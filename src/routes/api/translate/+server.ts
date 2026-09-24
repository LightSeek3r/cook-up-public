import { json, error } from '@sveltejs/kit';
import { requireAi, requireDb, requireKv } from '$lib/db';
import { LANG_NAMES, type Lang } from '$lib/config';
import { resolveLang } from '$lib/i18n';
import type { RequestHandler } from './$types';

/**
 * An instruct model rather than a dedicated MT model: culinary prose needs domain
 * context that `m2m100` lacks (it rendered "eggplant" as "eggs"). The extra cost is
 * paid once per recipe/language pair because the result is cached in KV forever.
 *
 * Must stay a *non-reasoning* model. Hybrid models such as `gemma-4-*-it` spend the
 * whole token budget on `reasoning_content` and return an empty answer.
 */
const MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';

interface Translated {
	title: string;
	instructions: string;
	machine: boolean;
}

/** Workers AI returns either the legacy `response` field or an OpenAI-style payload. */
interface ChatResult {
	response?: string;
	choices?: { message?: { content?: string } }[];
}

function systemPrompt(from: Lang, to: Lang): string {
	return [
		`You are a culinary translator. Translate the user's recipe instructions from`,
		`${LANG_NAMES[from]} into ${LANG_NAMES[to]}.`,
		`Rules: use the cooking vocabulary a native ${LANG_NAMES[to]} cookbook would use,`,
		`including the standard ${LANG_NAMES[to]} name of every ingredient;`,
		`leave only dish names and brand names in the original language;`,
		`keep every quantity, unit and step order exactly as written;`,
		`preserve the original line breaks and numbering.`,
		`Reply with the translation only — no preamble, notes or quotation marks.`
	].join(' ');
}

/**
 * i18n layer 2: recipe prose is translated lazily on first request and cached in
 * KV forever, so each recipe/language pair costs one Workers AI call in total.
 * Structured data (ingredients, labels) is pre-bundled and never goes through here.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);
	const kv = requireKv(platform);

	const id = Number(url.searchParams.get('id'));
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'valid "id" required');
	const lang = resolveLang(url.searchParams.get('lang'));
	// The batch pre-fill (pipeline/07_translate.mjs) writes straight to
	// recipe_i18n and has no use for the KV cache — letting it opt out keeps
	// thousands of one-off pre-fill calls from burning through KV's free-tier
	// daily put quota, which is shared with every real lazy-fallback request.
	const skipCache = url.searchParams.get('cache') === '0';

	const cacheKey = `recipe:${id}:${lang}`;
	const cached = await kv.get<Translated>(cacheKey, 'json');
	if (cached) return json({ ...cached, cached: true });

	const src = await db
		.prepare(
			`SELECT ri.title, ri.instructions, r.source_lang
       FROM recipe_i18n ri
       JOIN recipes r ON r.id = ri.recipe_id
       WHERE ri.recipe_id = ? AND ri.lang = r.source_lang`
		)
		.bind(id)
		.first<{ title: string; instructions: string; source_lang: string }>();

	if (!src) throw error(404, 'recipe not found');
	if (src.source_lang === lang) {
		return json({ title: src.title, instructions: src.instructions, machine: false });
	}

	const ai = requireAi(platform);
	const res = (await ai.run(MODEL, {
		messages: [
			{ role: 'system', content: systemPrompt(src.source_lang as Lang, lang) },
			{ role: 'user', content: src.instructions }
		],
		// Low temperature: sampling variance shows up as dropped or merged steps,
		// which is far worse in a recipe than a slightly stilted phrasing.
		temperature: 0.2,
		max_tokens: 4096
	})) as ChatResult;

	const text = (res.response ?? res.choices?.[0]?.message?.content ?? '').trim();

	const out: Translated = {
		// Dish names are proper nouns: a recipe stays "Tortang Talong" in every
		// language, and machine-translating short titles reliably mangles them.
		title: src.title,
		instructions: text || src.instructions,
		machine: true
	};

	// Never cache a failed translation — a permanent KV entry would freeze the
	// untranslated fallback in place forever. And never let a cache *write*
	// failure (e.g. the daily put-quota exhausted) fail a request that
	// otherwise succeeded — the translation is still good, it just won't be
	// cached this time.
	if (text && !skipCache) {
		try {
			await kv.put(cacheKey, JSON.stringify(out));
		} catch (err) {
			console.error('KV put failed, serving uncached:', err);
		}
	}
	return json({ ...out, cached: false });
};

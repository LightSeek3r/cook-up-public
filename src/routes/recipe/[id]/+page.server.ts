import { error } from '@sveltejs/kit';
import { nameForKey, recipePage } from '$lib/data';
import { corpusFor, recipeFile } from '$lib/server/data';
import { resolveLang } from '$lib/i18n';
import { substitutionsFor } from '$lib/substitutions';
import type { RecipeDetail, RecipeHit, SubstitutionTip } from '$lib/types';
import type { PageServerLoad } from './$types';

/**
 * From the data artefacts only (src/lib/server/data.ts): the recipe's own
 * r/<id>.json plus the corpus for ingredient names, related recipes and
 * substitution names. Never D1; unreadable artefacts are a 503.
 */
export const load: PageServerLoad = async ({ params, url, platform }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) throw error(400, 'invalid recipe id');

	const lang = resolveLang(url.searchParams.get('lang'));

	// Fetched alongside the corpus, which a cold isolate also has to fetch, but
	// only awaited once the corpus knows the id: for an unknown one the file's
	// 404 is expected and dropped here.
	const file = recipeFile(platform, id);
	file.catch(() => {});
	const corpus = await corpusFor(platform, lang);
	if (corpus.recipeIndex(id) < 0) throw error(404, 'recipe not found');

	const page = recipePage(corpus, await file, lang);
	const recipe = page.recipe as unknown as RecipeDetail;

	const nameByKey = new Map(recipe.ingredients.map((i) => [i.canonical_key, i.name]));
	const tips: SubstitutionTip[] = substitutionsFor(recipe.ingredients.map((i) => i.canonical_key)).map(
		(m) => ({
			from: m.from,
			to: m.to,
			fromName: nameByKey.get(m.from) ?? m.from,
			toName: nameForKey(corpus, m.to, lang) ?? m.to,
			benefit: m.benefit
		})
	);

	return { lang, tips, related: page.related as RecipeHit[], recipe };
};

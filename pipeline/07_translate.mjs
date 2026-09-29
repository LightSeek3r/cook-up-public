/**
 * Stage 07 — batch machine translation (ADR B′).
 *
 * Input:  recipes already seeded in D1 (stage 06)
 * Output: `recipe_i18n` rows with is_machine = 1, applied directly to D1 as
 *         each batch completes (not a single seed.sql — this stage makes
 *         live, costed AI calls interleaved with reads, so work already done
 *         must survive a crash or a rate limit partway through)
 *
 * Deviation from the original plan, and why: the original design called for
 * a direct call to the Workers AI REST API so it could log real neuron usage
 * from the response. This machine has no portable `CLOUDFLARE_API_TOKEN` —
 * only wrangler's own OAuth session, which isn't a bearer token that's safe
 * or stable to extract from its local config. The already-deployed
 * `/api/translate` endpoint does the *exact same* translation (same model,
 * same system prompt, same rules) and is reachable over plain HTTPS, so this
 * stage calls that instead of the raw REST API. Trade-off: no per-call
 * neuron count in the response, so cost is tracked by counting actual
 * characters translated instead (see the summary line at the end).
 *
 * Rules (kept in sync with src/routes/api/translate/+server.ts — divergence
 * between the two would be a silent quality bug):
 *   - titles are NOT translated; a dish name is a proper noun
 *   - model/prompt/temperature all live in that one endpoint now
 *
 * Quality gate the lazy endpoint cannot afford: assert the translation has
 * the same number of non-empty lines as the source; mismatches are logged
 * and skipped (left as a gap — the next run's selection query picks them up
 * again automatically), never written.
 *
 * Usage:
 *   node pipeline/07_translate.mjs --dry-run --limit=50   # cost measurement
 *   node pipeline/07_translate.mjs --limit=500            # real, incremental fill
 *   node pipeline/07_translate.mjs                        # fill every remaining gap
 */

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { esc, d1 } from './lib/d1.mjs';
import { nonEmptyLineCount } from './lib/translate_gate.mjs';
import { TARGET_LANGS } from './lib/langs.mjs';

const BASE_URL = 'https://cook-up.asakura-account.workers.dev';
const OUT_DIR = path.resolve('pipeline/out');

function parseArgs() {
	const args = process.argv.slice(2);
	const num = (flag, fallback) => {
		const hit = args.find((a) => a.startsWith(`--${flag}=`));
		return hit ? Number(hit.split('=')[1]) : fallback;
	};
	return {
		limit: num('limit', Infinity),
		dryRun: args.includes('--dry-run'),
		local: args.includes('--local')
	};
}

async function translate(id, lang) {
	// cache=0: this stage writes straight to recipe_i18n and never re-requests
	// the same (id, lang) pair, so the KV cache buys it nothing — and 20k+
	// pre-fill calls would blow through KV's free-tier daily put quota, which
	// is shared with every real lazy-fallback request. (Found the hard way:
	// the first full run did exactly that, 500ing every call after ~1000 puts.)
	const res = await fetch(`${BASE_URL}/api/translate?id=${id}&lang=${lang}&cache=0`);
	if (!res.ok) throw new Error(`translate ${id}/${lang}: HTTP ${res.status}`);
	return res.json();
}

async function main() {
	const { limit, dryRun, local } = parseArgs();

	let remaining = limit;
	let translatedCount = 0;
	let skippedMismatch = 0;
	let charsTranslated = 0;
	const mismatches = [];
	const inserts = []; // batched, applied every FLUSH_EVERY rows so a crash mid-run loses little

	const FLUSH_EVERY = 15;
	const flush = () => {
		if (!inserts.length) return;
		const values = inserts.splice(0, inserts.length).join(',\n');
		if (!dryRun) {
			d1(
				`INSERT INTO recipe_i18n (recipe_id, lang, title, instructions, is_machine) VALUES\n${values};`,
				{ local, json: false }
			);
		}
	};

	// The endpoint is network/inference-bound, not CPU-bound — sequential calls
	// measured ~4s each, which is ~24h wall-clock for the full 21k-pair fill.
	// Workers AI handles concurrent requests fine; this is the difference
	// between hours and minutes; kept modest to stay a good citizen of the
	// shared deployment rather than hammering it.
	const CONCURRENCY = 12;

	// Once the daily neuron allocation is gone, every remaining call fails —
	// the first full run burned ~16,000 doomed requests that way before
	// finishing. The endpoint returns an opaque 500 (it can't distinguish
	// AiError 4006 from any other failure without a redeploy), so treat a
	// sustained failure streak as "stop, come back tomorrow" instead.
	const ABORT_AFTER_CONSECUTIVE_FAILURES = 20;
	let consecutiveFailures = 0;
	let aborted = false;

	async function processGap(gap, lang) {
		let result;
		try {
			result = await translate(gap.id, lang);
			consecutiveFailures = 0;
		} catch (err) {
			console.error(`translate ${gap.id}/${lang} failed:`, err.message);
			if (++consecutiveFailures >= ABORT_AFTER_CONSECUTIVE_FAILURES) aborted = true;
			return;
		}

		const sourceLines = nonEmptyLineCount(gap.instructions);
		const translatedLines = nonEmptyLineCount(result.instructions);
		if (sourceLines !== translatedLines) {
			skippedMismatch++;
			mismatches.push(`${gap.id}\t${lang}\t${sourceLines} vs ${translatedLines} lines`);
			return;
		}

		charsTranslated += result.instructions.length;
		translatedCount++;
		inserts.push(`(${gap.id},${esc(lang)},${esc(gap.title)},${esc(result.instructions)},1)`);
		if (inserts.length >= FLUSH_EVERY) flush();
	}

	for (const lang of TARGET_LANGS) {
		if (remaining <= 0 || aborted) break;
		const gaps = d1(
			`SELECT r.id, r.source_lang, s.title, s.instructions
			 FROM recipes r
			 JOIN recipe_i18n s ON s.recipe_id = r.id AND s.lang = r.source_lang
			 WHERE NOT EXISTS (SELECT 1 FROM recipe_i18n t WHERE t.recipe_id = r.id AND t.lang = '${lang}')
			 LIMIT ${Math.min(remaining, 2000)}`,
			{ local }
		);

		for (let i = 0; i < gaps.length && remaining > 0 && !aborted; i += CONCURRENCY) {
			const batch = gaps.slice(i, i + Math.min(CONCURRENCY, remaining));
			remaining -= batch.length;
			await Promise.all(batch.map((gap) => processGap(gap, lang)));
			if ((i / CONCURRENCY) % 20 === 0) {
				console.log(`07_translate: ${lang} — ${Math.min(i + CONCURRENCY, gaps.length)}/${gaps.length}`);
			}
		}
	}
	flush();

	if (aborted) {
		console.error(
			`07_translate: ABORTED after ${ABORT_AFTER_CONSECUTIVE_FAILURES} consecutive failures — ` +
				`almost certainly the daily neuron allocation (AiError 4006). Everything translated ` +
				`before this point is already saved; re-run tomorrow to continue from the gap.`
		);
	}

	// No FTS rebuild here (deliberate, not an oversight): recipe_title_fts now
	// indexes only source-lang rows (migrations/0008_recipe_title_fts_source_only.sql)
	// because titles are never translated, so a translated row is never indexed
	// and there is nothing to rebuild. Rebuilding after every batch used to
	// re-read and rewrite the whole table — the actual cause of exhausting the
	// D1 free-tier read quota twice. Do not reintroduce a 'rebuild' call here.

	if (mismatches.length) {
		await writeFile(path.join(OUT_DIR, 'translate_mismatches.txt'), mismatches.join('\n') + '\n');
	}

	// $0.555/M output tokens, ~4 chars/token — the same estimation method used
	// for the earlier cost projection, now against what was actually sent.
	const estimatedCost = (charsTranslated / 4 / 1_000_000) * 0.555;
	console.log(
		`07_translate: ${translatedCount} translated, ${skippedMismatch} skipped (line-count mismatch, see translate_mismatches.txt)` +
			(dryRun ? ' [DRY RUN — nothing written]' : '')
	);
	console.log(
		`07_translate: ${charsTranslated} chars translated, ~$${estimatedCost.toFixed(4)} estimated output-token cost this run`
	);
}

await main();

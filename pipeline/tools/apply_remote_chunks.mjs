/**
 * Applies the chunk files written by pipeline/gen_remote_seed.mjs to remote
 * D1, in order, through pipeline/lib/d1.mjs (so every chunk is budget-checked
 * and logged in the daily ledger, which the old bash loop bypassed).
 *
 * - Refuses to start when the uncommitted chunks' estimated writes (plan.json)
 *   exceed what is left of today's write budget, unless --paid-plan.
 * - Stops before any chunk that would cross the budget, as a second check
 *   against the ledger's real figures.
 * - Records each committed chunk in applied.json next to the chunks; a rerun
 *   starts at the first uncommitted one. A chunk is atomic, so the one that
 *   failed is simply retried; a committed one is never re-sent.
 * - Retries a chunk once on Cloudflare's transient 7403 error.
 * - --across-days (a corpus restore only, plan mode 'restore'): starts even
 *   when the plan exceeds today's budget, applies what fits, and stops; a
 *   rerun on each following UTC day continues. Refused for any other plan,
 *   whose partial state a reader could see.
 *
 * Since migrations/0013_retire_recipe_corpus.sql the only chunks left to
 * apply are that restore (gen_remote_seed.mjs --restore-corpus); every other
 * plan writes tables D1 no longer has.
 *
 * Usage:
 *   node pipeline/tools/apply_remote_chunks.mjs --dir=pipeline/out/remote-chunks [--paid-plan] [--write-budget=N] [--dry-run] [--across-days]
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { d1, ledgerToday, D1_WRITE_BUDGET } from '../lib/d1.mjs';

const isTransient = (err) => /\b7403\b/.test(String(err?.stderr ?? '') + String(err?.message ?? ''));

/**
 * `exec(sql)` runs one chunk; `used()` returns rows written today. Returns
 * `{ applied, remaining, stopped }` where `stopped` is null, 'budget' or 'error'.
 */
export function applyChunks({ dir, exec, used, budget, paidPlan = false, dryRun = false, acrossDays = false, log = () => {} }) {
	const plan = JSON.parse(readFileSync(path.join(dir, 'plan.json'), 'utf8'));
	if (acrossDays && plan.mode !== 'restore') {
		throw new Error(`--across-days is for a corpus restore (plan mode 'restore'); ${dir} is '${plan.mode}'`);
	}
	const progressPath = path.join(dir, 'applied.json');
	const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { generated_at: plan.generated_at, applied: [] };
	if (progress.generated_at !== plan.generated_at) {
		throw new Error(`${progressPath} belongs to another generation (${progress.generated_at}); delete it only if no chunk of that run was applied`);
	}
	const done = new Set(progress.applied);
	const todo = plan.chunks.filter((c) => !done.has(c.file));
	const planned = todo.reduce((s, c) => s + c.writes, 0);
	const left = budget - used();
	log(`${todo.length}/${plan.chunks.length} chunks to apply, ~${planned} rows written; ${left} left of today's ${budget}-row budget`);
	if (!paidPlan && planned > left && acrossDays) {
		log(`spread over days: ~${Math.ceil(planned / budget)} day(s) at ${budget} rows/day; rerun after each 00:00 UTC reset until no chunk is left`);
	} else if (!paidPlan && planned > left) {
		log(`REFUSED: would cross today's write budget partway through. Resume after 00:00 UTC, or --paid-plan on Workers Paid.`);
		return { applied: 0, remaining: todo.length, stopped: 'budget' };
	}
	if (dryRun) return { applied: 0, remaining: todo.length, stopped: null };

	let applied = 0;
	for (const chunk of todo) {
		if (!paidPlan && used() + chunk.writes > budget) {
			log(`stopped before ${chunk.file}: ~${chunk.writes} more rows would cross today's budget (${used()} used)`);
			return { applied, remaining: todo.length - applied, stopped: 'budget' };
		}
		const sql = readFileSync(path.join(dir, chunk.file), 'utf8');
		try {
			try {
				exec(sql);
			} catch (err) {
				if (!isTransient(err)) throw err;
				log(`${chunk.file}: transient 7403, retrying once`);
				exec(sql);
			}
		} catch (err) {
			log(`FAILED at ${chunk.file} (rolled back as a whole; rerun to retry it): ${String(err?.stderr ?? err?.message ?? err).slice(0, 500)}`);
			return { applied, remaining: todo.length - applied, stopped: 'error' };
		}
		progress.applied.push(chunk.file);
		writeFileSync(`${progressPath}.tmp`, JSON.stringify(progress, null, 2) + '\n');
		renameSync(`${progressPath}.tmp`, progressPath);
		applied++;
		log(`${chunk.file} committed (${applied}/${todo.length})`);
	}
	return { applied, remaining: 0, stopped: null };
}

function main() {
	const argv = process.argv.slice(2);
	const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
	const dir = path.resolve(opt('dir') ?? 'pipeline/out/remote-chunks');
	const result = applyChunks({
		dir,
		exec: (sql) => d1(sql, { json: false }),
		used: () => ledgerToday().rows_written,
		budget: Number(opt('write-budget') ?? D1_WRITE_BUDGET),
		paidPlan: argv.includes('--paid-plan'),
		acrossDays: argv.includes('--across-days'),
		dryRun: argv.includes('--dry-run'),
		log: (m) => console.log(`apply_remote_chunks: ${m}`)
	});
	if (result.stopped) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();

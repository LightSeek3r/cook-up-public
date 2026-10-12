#!/usr/bin/env node
// Usage: node scripts/check-bundle-size.mjs   (after a build)
//
// Bundles the Worker exactly as `wrangler deploy` would (`--dry-run`, nothing
// uploaded) and enforces two budgets on wrangler's own "Total Upload" figure.
//
// Cloudflare's limit (developers.cloudflare.com/workers/platform/limits,
// checked 2026-10-12): 64 MiB uncompressed on Free and Paid; "There is no
// compressed size limit. Only the uncompressed bundle size counts." The old
// 3 MiB-gzip free-plan cap no longer exists. The budgets below are therefore
// early warnings, not the platform limit: raw size drives the 1 s startup
// limit, and gzip tracks what changed. Baseline 2026-10-12: 11819 KiB raw,
// 1914 KiB gzip.
import { spawnSync } from 'node:child_process';

const HARD_RAW_KIB = 64 * 1024;
const RAW_BUDGET_KIB = Number(process.env.BUDGET_RAW_KIB ?? 16 * 1024);
const GZIP_BUDGET_KIB = Number(process.env.BUDGET_GZIP_KIB ?? 2560);

const run = spawnSync(
	process.execPath,
	['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--outdir', '.wrangler/dry'],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);
const output = `${run.stdout}\n${run.stderr}`;
const m = output.match(/Total Upload:\s*([\d.]+)\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/);
if (run.status !== 0 || !m) {
	console.error(output);
	console.error(`wrangler deploy --dry-run ${run.status !== 0 ? `exited ${run.status}` : 'printed no "Total Upload" line'}`);
	process.exit(1);
}

const raw = Number(m[1]);
const gzip = Number(m[2]);
const mib = (/** @type {number} */ kib) => `${(kib / 1024).toFixed(2)} MiB`;
console.log(`worker bundle: ${raw} KiB (${mib(raw)}) raw, ${gzip} KiB (${mib(gzip)}) gzip`);
console.log(`budgets: raw ${mib(RAW_BUDGET_KIB)} (Cloudflare limit ${mib(HARD_RAW_KIB)}), gzip ${mib(GZIP_BUDGET_KIB)}`);

const problems = [];
if (raw > HARD_RAW_KIB) problems.push(`over Cloudflare's 64 MiB uncompressed Worker limit: deploy would be rejected`);
if (raw > RAW_BUDGET_KIB) problems.push(`raw size over the ${mib(RAW_BUDGET_KIB)} budget`);
if (gzip > GZIP_BUDGET_KIB) problems.push(`gzip size over the ${mib(GZIP_BUDGET_KIB)} budget`);
for (const p of problems) console.error(`BUNDLE PROBLEM: ${p}`);
if (problems.length) {
	console.error('Raise BUDGET_RAW_KIB / BUDGET_GZIP_KIB in the workflow only if the growth is intended.');
	process.exit(1);
}
console.log('bundle size OK');

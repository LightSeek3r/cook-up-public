#!/usr/bin/env node
// Usage: BASE_REF=origin/main node scripts/check-migrations.mjs
//
// 1. migrations/ holds only NNNN_snake_case.sql, numbered 0001.. without gaps
//    or duplicates (wrangler applies them in filename order and records names,
//    so a gap or a reused number silently reorders or skips one).
// 2. Append-only: compared with BASE_REF, no existing migration was modified,
//    renamed or deleted. Remote D1 holds content that cannot be regenerated,
//    and wrangler never re-runs an applied file, so an edit would make local
//    and remote schemas diverge without any error.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const DIR = 'migrations';
const problems = [];

const files = readdirSync(DIR).sort();
files.forEach((file, i) => {
	const expected = String(i + 1).padStart(4, '0');
	if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) problems.push(`${file}: name must match NNNN_snake_case.sql`);
	else if (file.slice(0, 4) !== expected) problems.push(`${file}: expected number ${expected} (gap or duplicate)`);
});

const base = process.env.BASE_REF || 'origin/main';
/** @param {string[]} args */
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let baseOk = true;
try {
	git('rev-parse', '--verify', '--quiet', `${base}^{commit}`);
} catch {
	baseOk = false;
	console.warn(`warning: ${base} not found, append-only check skipped (numbering still checked)`);
}
if (baseOk) {
	const mergeBase = git('merge-base', base, 'HEAD').trim();
	// Working tree included, so a local run also catches uncommitted edits.
	const changed = git('diff', '--name-status', '--diff-filter=MDRT', mergeBase, '--', DIR).trim();
	for (const line of changed.split('\n').filter(Boolean)) {
		problems.push(`existing migration changed since ${base}: ${line.replace(/\s+/g, ' ')}`);
	}
	const added = git('diff', '--name-only', '--diff-filter=A', mergeBase, '--', DIR).trim();
	console.log(`compared with ${base} (${mergeBase.slice(0, 12)}): ${added ? `new: ${added.split('\n').join(', ')}` : 'no new migrations'}`);
}

if (problems.length) {
	for (const p of problems) console.error(`MIGRATION PROBLEM: ${p}`);
	console.error('Never edit an applied migration; add a new NNNN_*.sql instead.');
	process.exit(1);
}
console.log(`migrations OK: ${files.length} files, 0001..${String(files.length).padStart(4, '0')}`);

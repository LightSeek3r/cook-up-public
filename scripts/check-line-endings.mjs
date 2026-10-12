#!/usr/bin/env node
// Fails when a tracked text file is stored with CRLF in the index. With
// `* text=auto eol=lf` such a file shows as modified on every checkout, and the
// pipeline's LF output then diffs against it on every line.
// Fix: `git add --renormalize <file>` (or `.`) and commit.
import { execFileSync } from 'node:child_process';

const out = execFileSync('git', ['ls-files', '--eol'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const bad = out
	.split('\n')
	.filter((line) => /^i\/(crlf|mixed)\b/.test(line))
	.map((line) => line.split('\t').pop());

if (bad.length) {
	console.error(`${bad.length} file(s) committed with CRLF line endings:`);
	for (const file of bad) console.error(`  ${file}`);
	console.error('Fix with: git add --renormalize . && git commit');
	process.exit(1);
}
console.log('line endings OK: no CRLF in the index');

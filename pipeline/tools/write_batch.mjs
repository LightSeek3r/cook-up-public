/**
 * Apostrophe-safe way to write a translated batch JSON file from Bash, for
 * cases where a Bash-based write is unavoidable.
 *
 * The real bug behind repeated agent complaints about "apostrophes breaking
 * shell escaping": agents were wrapping the whole JSON in a single-quoted
 * `node -e '...'` argument (or an equivalent quoted shell string) — a literal
 * apostrophe inside the translated text (e.g. Italian "c'è", a Portuguese
 * contraction) closes that quote early and breaks the command. It was never
 * a real environment limitation; it was always this one specific mistake.
 *
 * Reading from stdin via a quoted heredoc sidesteps it entirely: bash
 * performs zero interpretation inside a heredoc whose delimiter is quoted —
 * apostrophes, $, and backticks are all just literal characters there,
 * nothing to escape.
 *
 * Usage:
 *   node pipeline/tools/write_batch.mjs <output-path> <<'BATCH_EOF'
 *   [{"recipe_id": 123, "instructions": "..."}]
 *   BATCH_EOF
 *
 * The Write tool directly (no shell involved at all) is still the preferred
 * method and needs no escaping of any kind — use this script only when Bash
 * is the only option. Python is not available in this environment; don't
 * reach for it.
 */

import { writeFileSync } from 'node:fs';

const outPath = process.argv[2];
if (!outPath) throw new Error('usage: node write_batch.mjs <output-path> < input.json (or a heredoc)');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
	JSON.parse(input); // fail loudly on malformed/truncated JSON before anything downstream sees it
	writeFileSync(outPath, input);
	console.log(`write_batch: wrote ${input.length} bytes to ${outPath}`);
});

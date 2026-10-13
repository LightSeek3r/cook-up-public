// The startup warm-up's tiny corpus is the e2e seed's artefacts as the
// current generator writes them (`npx vitest run -u` rewrites the file after
// a format or seed change), and warming up runs cleanly. `.mjs` for
// node:sqlite (buildArtefacts).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildArtefacts, fixtureDb } from '../../../pipeline/lib/artefacts.mjs';
import { warmUp } from './warmup';

describe('startup warm-up', () => {
	it('warmup-corpus.json is the e2e seed built by the current generator', async () => {
		const seed = readFileSync(new URL('../../../tests/e2e/fixtures/seed.sql', import.meta.url), 'utf8');
		const { files } = buildArtefacts(fixtureDb(seed));
		const tiny = {
			core: files.get('core.bin').toString('base64'),
			names: files.get('names/en.json').toString('utf8'),
			titles: files.get('titles/en.json').toString('utf8')
		};
		await expect(`${JSON.stringify(tiny, null, '\t')}\n`).toMatchFileSnapshot('./warmup-corpus.json');
	});

	it('runs every data path without an error', () => {
		const error = vi.spyOn(console, 'error');
		warmUp();
		expect(error).not.toHaveBeenCalled();
		error.mockRestore();
	});
});

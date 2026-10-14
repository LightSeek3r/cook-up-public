import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
	parseFile,
	readFile,
	readStore,
	recipeI18nRows,
	serializeFile,
	srcHash,
	storeDigest,
	storeExists,
	storeFile,
	storeLangs,
	writeFile
} from './recipe_i18n_store.mjs';

let dir;
beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), 'recipe-i18n-store-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const rows = (entries) => new Map(entries.map((e) => [e.recipe_id, e]));
const TITLES = rows([
	{ recipe_id: 7, title: 'Soupe au poulet', src: srcHash('Chicken Soup'), origin: 'batch', reviewed: false },
	{ recipe_id: 3, title: 'Tarte Tatin', src: srcHash('Tarte Tatin'), origin: 'batch', reviewed: true, keep: 'French dish name' }
]);

describe('file format', () => {
	it('round-trips, in recipe_id order with a fixed key order and a verifying header', () => {
		const bytes = serializeFile('titles', 'fr', TITLES);
		const lines = bytes.toString('utf8').trimEnd().split('\n');
		expect(JSON.parse(lines[0])).toMatchObject({ format: 1, kind: 'titles', lang: 'fr', rows: 2 });
		expect(lines.slice(1).map((l) => JSON.parse(l).recipe_id)).toEqual([3, 7]);
		expect(Object.keys(JSON.parse(lines[1]))).toEqual(['recipe_id', 'title', 'src', 'origin', 'reviewed', 'keep']);
		expect([...parseFile('titles', 'fr', bytes)]).toEqual([...rows([...TITLES.values()].sort((a, b) => a.recipe_id - b.recipe_id))]);
	});

	it('gzips instructions and is byte-identical for equal content', () => {
		const texts = rows([{ recipe_id: 1, instructions: '1. Un.\n2. Deux.', is_machine: 1, src: 'x', origin: 'backup', reviewed: false }]);
		const a = serializeFile('instructions', 'fr', texts);
		expect(gunzipSync(a).toString('utf8')).toContain('"instructions":"1. Un.\\n2. Deux."');
		expect(serializeFile('instructions', 'fr', new Map([...texts].reverse()))).toEqual(a);
	});

	it('refuses a hand-edited, truncated or misnamed file', () => {
		const bytes = serializeFile('titles', 'fr', TITLES);
		expect(() => parseFile('titles', 'fr', Buffer.from(bytes.toString('utf8').replace('Soupe', 'Potage')))).toThrow(/sha256/);
		const lines = bytes.toString('utf8').split('\n');
		expect(() => parseFile('titles', 'fr', Buffer.from(lines.slice(0, 2).join('\n') + '\n'))).toThrow(/sha256/);
		expect(() => parseFile('titles', 'de', bytes)).toThrow(/not a format-1 titles\/de file/);
		expect(() => parseFile('instructions', 'fr', serializeFile('instructions', 'de', new Map()))).toThrow(/instructions\/fr/);
	});
});

describe('reading and writing a store', () => {
	it('writes atomically, reports no change for equal content, and refuses a file that changed meanwhile', () => {
		expect(storeExists(dir)).toBe(false);
		expect(readFile('titles', 'fr', dir)).toEqual({ rows: new Map(), sha256: null });
		expect(writeFile('titles', 'fr', TITLES, { dir, expectSha: null })).toBe(true);
		const first = readFile('titles', 'fr', dir);
		expect(first.rows.size).toBe(2);
		expect(writeFile('titles', 'fr', TITLES, { dir, expectSha: first.sha256 })).toBe(false);
		expect(() => writeFile('titles', 'fr', new Map(), { dir, expectSha: null })).toThrow(/changed while/);
		expect(storeExists(dir)).toBe(true);
		expect(storeLangs('titles', dir)).toEqual(['fr']);
		expect(Object.keys(storeDigest(dir))).toEqual(['titles/fr.jsonl']);
	});

	it('names files per kind and language', () => {
		expect(storeFile('titles', 'pnb')).toBe('titles/pnb.jsonl');
		expect(storeFile('instructions', 'bn')).toBe('instructions/bn.jsonl.gz');
		expect(() => readFile('steps', 'fr', dir)).toThrow(/unknown kind/);
	});

	it('parallel writers of one file never lose a row (unique temp file, locked compare-and-rename)', async () => {
		const storeModule = new URL('./recipe_i18n_store.mjs', import.meta.url).href;
		const worker = `
			import { readFile, writeFile, srcHash } from ${JSON.stringify(storeModule)};
			const id = Number(process.argv[1]);
			const dir = process.argv[2];
			for (let i = 0; i < 6; i++) {
				const recipe_id = id * 100 + i;
				for (;;) {
					const { rows, sha256 } = readFile('instructions', 'bn', dir);
					rows.set(recipe_id, { recipe_id, instructions: '1. ' + 'x'.repeat(2000), is_machine: 1, src: srcHash('s'), origin: 'batch', reviewed: false });
					try { writeFile('instructions', 'bn', rows, { dir, expectSha: sha256 }); break; }
					catch (e) { if (!/changed while/.test(String(e.message))) throw e; }
				}
			}`;
		const runs = Array.from({ length: 6 }, (_, n) =>
			new Promise((resolve, reject) => {
				const child = spawn(process.execPath, ['--input-type=module', '-e', worker, String(n + 1), dir], { stdio: ['ignore', 'ignore', 'pipe'] });
				let err = '';
				child.stderr.on('data', (d) => (err += d));
				child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
			})
		);
		await Promise.all(runs);
		expect(readFile('instructions', 'bn', dir).rows.size).toBe(36);
	}, 60_000);

	it('a damaged file stops readStore', () => {
		writeFile('titles', 'fr', TITLES, { dir });
		const file = path.join(dir, 'titles/fr.jsonl');
		writeFileSync(file, readFileSync(file, 'utf8').replace('Tatin', 'Tatin!'));
		expect(() => readStore(dir)).toThrow(/hand-edited/);
	});
});

describe('recipeI18nRows', () => {
	const store = {
		titles: {
			en: rows([{ recipe_id: 1, title: 'Chicken Soup' }, { recipe_id: 2, title: 'Rhubarb Pie' }]),
			fr: rows([{ recipe_id: 1, title: 'Soupe au poulet' }]),
			bn: rows([{ recipe_id: 2, title: 'রুবার্ব পাই' }])
		},
		instructions: {
			en: rows([{ recipe_id: 1, instructions: '1. Boil.', is_machine: 0 }, { recipe_id: 2, instructions: '1. Bake.', is_machine: 0 }]),
			fr: rows([{ recipe_id: 1, instructions: '1. Bouillir.', is_machine: 1 }, { recipe_id: 2, instructions: '1. Cuire.', is_machine: 1 }])
		}
	};

	it('gives every language row its own title, else the English one', () => {
		expect(recipeI18nRows(store)).toEqual([
			{ recipe_id: 1, lang: 'en', title: 'Chicken Soup', instructions: '1. Boil.', is_machine: 0 },
			{ recipe_id: 2, lang: 'en', title: 'Rhubarb Pie', instructions: '1. Bake.', is_machine: 0 },
			{ recipe_id: 2, lang: 'bn', title: 'রুবার্ব পাই', instructions: '1. Bake.', is_machine: 0 },
			{ recipe_id: 1, lang: 'fr', title: 'Soupe au poulet', instructions: '1. Bouillir.', is_machine: 1 },
			{ recipe_id: 2, lang: 'fr', title: 'Rhubarb Pie', instructions: '1. Cuire.', is_machine: 1 }
		]);
	});

	it('refuses a language row without an English title', () => {
		expect(() => recipeI18nRows({ titles: {}, instructions: { fr: rows([{ recipe_id: 9, instructions: 'x', is_machine: 1 }]) } })).toThrow(/no English title/);
	});
});

// The whole recipe translation flow on a three-recipe corpus in temp dirs,
// through the real tools: import the backup, hand out a batch, apply a good
// one and a bad one, status, then build the artefacts and search them.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildArtefacts, snapshotDb } from '../lib/artefacts.mjs';
import { writeManifest, writeTable } from '../lib/i18n_backup.mjs';
import { readFile } from '../lib/recipe_i18n_store.mjs';
import { loadCorpus } from '../../src/lib/data/corpus.js';
import { searchTitles } from '../../src/lib/data/search.js';

const REPO = path.resolve(import.meta.dirname, '../..');
const RECIPES = [
	{ id: 900001, title: 'Chicken Soup', instructions: '1. Boil the chicken for 40 minutes.\n2. Add salt and serve.', key: 'chicken' },
	{ id: 900002, title: 'Rhubarb Pie II', instructions: '1. Line a dish with pastry.\n2. Fill with rhubarb.\n3. Bake at 180 °C for 35 minutes.', key: 'rhubarb' },
	{ id: 900003, title: 'Tiramisu', instructions: '1. Layer biscuits and cream.\n2. Chill for 4 hours.', key: 'mascarpone' }
];
const ZH = {
	900001: '1. 将鸡肉煮 40 分钟。\n2. 加盐后上桌。',
	900002: '1. 在烤盘中铺上酥皮。\n2. 填入大黄。\n3. 以 180 °C 烘烤 35 分钟。'
};

let work;
let dirs;
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

/** Runs one tool as an agent would, from the repository root. */
function tool(name, ...args) {
	const r = spawnSync(process.execPath, [path.join(REPO, 'pipeline/tools', name), ...args, `--store=${dirs.store}`], { cwd: REPO, encoding: 'utf8' });
	return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const withOut = (...args) => [...args, `--pipeline-out=${dirs.out}`];

beforeAll(() => {
	work = mkdtempSync(path.join(tmpdir(), 'recipe-i18n-flow-'));
	dirs = { out: path.join(work, 'out'), backup: path.join(work, 'backup'), store: path.join(work, 'store'), batches: path.join(work, 'batches') };
	for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
	const recipe = (r) => ({
		id: r.id,
		source_url: `https://example.test/${r.id}`,
		source_lang: 'en',
		license: 'CC-BY-SA-3.0',
		attribution: 'test',
		title: r.title,
		instructions: r.instructions,
		cuisine: null,
		meal_type: 'dinner',
		difficulty: null,
		notes: [],
		prep_minutes: null,
		total_minutes: 30,
		servings: 4
	});
	writeFileSync(path.join(dirs.out, 'recipes.jsonl'), jsonl(RECIPES.map(recipe)));
	writeFileSync(
		path.join(dirs.out, 'ingredients.jsonl'),
		jsonl(RECIPES.map((r) => ({ canonical_key: r.key, category: 'other', is_staple: 0, beneficial: 0, allergens: [], names: { en: r.key } })))
	);
	writeFileSync(path.join(dirs.out, 'recipe_ingredients.jsonl'), jsonl(RECIPES.map((r) => ({ recipe_id: r.id, canonical_key: r.key, raw_text: r.key, quantity: 1, unit: null }))));
	for (const f of ['recipe_ingredients.grams', 'recipe_diets', 'recipes.nutrition', 'ingredient_nutrition', 'ingredient_micronutrient', 'recipe_micronutrient', 'recipe_images']) {
		writeFileSync(path.join(dirs.out, `${f}.jsonl`), '');
	}
	// The backup as remote held it: English, plus Chinese with one title of
	// another dish copied in and one recipe never translated.
	const rows = [
		...RECIPES.map((r) => ({ recipe_id: r.id, lang: 'en', title: r.title, instructions: r.instructions, is_machine: 0 })),
		{ recipe_id: 900001, lang: 'zh', title: 'Chicken Soup', instructions: ZH[900001], is_machine: 1 },
		{ recipe_id: 900002, lang: 'zh', title: 'Creamed Potatoes', instructions: ZH[900002], is_machine: 1 }
	];
	const counts = { en: { rows: 3, machine: 0 }, zh: { rows: 2, machine: 2 } };
	const names = RECIPES.map((r, i) => ({ ingredient_id: i + 1, canonical_key: r.key, lang: 'en', name: r.key }));
	writeManifest(
		{
			format: 1,
			exported_at: '2026-10-12T00:00:00.000Z',
			tables: {
				recipe_i18n: writeTable({ table: 'recipe_i18n', rows, counts, backupDir: dirs.backup }),
				ingredient_i18n: writeTable({ table: 'ingredient_i18n', rows: names, counts: { en: { rows: 3 } }, backupDir: dirs.backup })
			}
		},
		dirs.backup
	);
});

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('recipe translation tools, end to end', () => {
	it('imports the backup once: instructions kept, the wrong title refused, a rerun changes nothing', () => {
		const first = tool('recipe_i18n_import_backup.mjs', `--backup=${dirs.backup}`, `--pipeline-out=${dirs.out}`);
		expect(first.status, first.out).toBe(0);
		expect(first.out).toMatch(/zh instructions 2 rows \(2 new.*titles 0 \(1 backup titles differ from English, 0 imported, 1 refused/);
		expect(first.out).toMatch(/refused zh 900002: .*\[target-script\]/);
		const again = tool('recipe_i18n_import_backup.mjs', `--backup=${dirs.backup}`, `--pipeline-out=${dirs.out}`);
		expect(again.out.match(/no change on disk/g)?.length).toBe(4);
	}, 60_000);

	it('hands out a title batch, applies a good one, rejects a bad one without writing', () => {
		const input = path.join(dirs.batches, 'in_titles_fr_1.json');
		const next = tool('recipe_i18n_next_batch.mjs', ...withOut('--kind=titles', '--lang=fr', `--out=${input}`));
		expect(next.out).toMatch(/wrote 3 titles .*\(3 remaining before this batch\)/);
		const handed = JSON.parse(readFileSync(input, 'utf8'));
		expect(handed.map((r) => r.id)).toEqual([900001, 900002, 900003]);
		expect(handed[1]).toMatchObject({ en: 'Rhubarb Pie II', ingredients: ['rhubarb'], first_step: 'Line a dish with pastry.' });

		const good = path.join(dirs.batches, 'titles_fr_1.json');
		writeFileSync(good, JSON.stringify([
			{ id: 900001, title: 'Soupe au poulet' },
			{ id: 900002, title: 'Tarte à la rhubarbe II' },
			{ id: 900003, title: 'Tiramisu' }
		]));
		const applied = tool('recipe_i18n_apply.mjs', ...withOut('--kind=titles', '--lang=fr', `--file=${good}`));
		expect(applied.status, applied.out).toBe(0);
		expect(applied.out.trim()).toBe('APPLIED 3 titles for fr; 0 remaining, 3 awaiting review');

		const before = readFile('titles', 'zh', dirs.store).sha256;
		const bad = path.join(dirs.batches, 'titles_zh_1.json');
		writeFileSync(bad, JSON.stringify([
			{ id: 900001, title: 'Chicken Soup' },
			{ id: 900002, title: '大黄派' },
			{ id: 900004, title: '提拉米苏' }
		]));
		const rejected = tool('recipe_i18n_apply.mjs', ...withOut('--kind=titles', '--lang=zh', `--file=${bad}`));
		expect(rejected.status).toBe(1);
		expect(rejected.out).toContain('REJECTED 900001: [identical-to-source] title is the English title');
		expect(rejected.out).toContain('REJECTED 900002: [variant-numeral]');
		expect(rejected.out).toContain('REJECTED 900004: [unknown-id]');
		expect(rejected.out).toMatch(/batch rejected, 3 problem\(s\); nothing written/);
		expect(readFile('titles', 'zh', dirs.store).sha256).toBe(before);

		writeFileSync(bad, JSON.stringify([{ id: 900001, title: '鸡汤' }, { id: 900002, title: '大黄派 II' }, { id: 900003, title: '提拉米苏' }]));
		expect(tool('recipe_i18n_apply.mjs', ...withOut('--kind=titles', '--lang=zh', `--file=${bad}`)).out.trim()).toBe('APPLIED 3 titles for zh; 0 remaining, 3 awaiting review');
	}, 60_000);

	it('hands out the missing instructions, applies them, and the status matrix adds up', () => {
		const input = path.join(dirs.batches, 'in_instructions_zh_1.json');
		expect(tool('recipe_i18n_next_batch.mjs', ...withOut('--kind=instructions', '--lang=zh', `--out=${input}`)).out).toMatch(/wrote 1 instructions/);
		expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual([{ id: 900003, en_title: 'Tiramisu', lines: 2, en: RECIPES[2].instructions }]);
		const batch = path.join(dirs.batches, 'instructions_zh_1.json');
		writeFileSync(batch, JSON.stringify([{ id: 900003, instructions: '1. 将饼干和奶油分层铺好。\n2. 冷藏 4 小时。' }]));
		expect(tool('recipe_i18n_apply.mjs', ...withOut('--kind=instructions', '--lang=zh', `--file=${batch}`)).out.trim()).toBe(
			'APPLIED 1 instructions for zh; 0 remaining, 3 awaiting review'
		);
		const status = tool('recipe_i18n_status.mjs', ...withOut('--lang=zh'));
		expect(status.status, status.out).toBe(0);
		expect(status.out).toMatch(/titles \(3 served recipes\)\nlang +done missing invalid stale reviewed +kept-en\nzh +3 +0 +0 +0 +0 +0/);
		expect(status.out).toMatch(/instructions \(3 served recipes\)\nlang .* batch-wait batch-rev backup\nzh +3 +0 +0 +0 +0 +\d+ +1 +0 +2\n/);
	}, 60_000);

	it('reviews only this session\'s instructions with --origin=batch, and samples the imported ones reproducibly', () => {
		const review = path.join(dirs.batches, 'in_review_instructions_zh_1.json');
		expect(tool('recipe_i18n_next_batch.mjs', ...withOut('--kind=instructions', '--lang=zh', '--review', '--origin=batch', `--out=${review}`)).out).toMatch(
			/wrote 1 instructions to review \(origin batch\)/
		);
		expect(JSON.parse(readFileSync(review, 'utf8')).map((r) => r.id)).toEqual([900003]);
		const draw = (n) => {
			const out = path.join(dirs.batches, `sample_zh_${n}.json`);
			const r = tool('recipe_i18n_next_batch.mjs', ...withOut('--kind=instructions', '--lang=zh', '--review', '--origin=backup', '--sample=1', '--seed=3', `--out=${out}`));
			expect(r.out).toMatch(/wrote a sample of 1 of 2 instructions to review \(origin backup\) \(seed 3\)/);
			return readFileSync(out, 'utf8');
		};
		const first = draw(1);
		expect(draw(2)).toBe(first);
		expect([900001, 900002]).toContain(JSON.parse(first)[0].id);
		expect(tool('recipe_i18n_next_batch.mjs', ...withOut('--kind=instructions', '--lang=zh', '--origin=batch', `--out=${review}`)).status).toBe(1);
	}, 60_000);

	it('builds artefacts from the store whose search finds the translated titles', async () => {
		const { db } = await snapshotDb({ outDir: dirs.out, backupDir: dirs.backup, storeDir: dirs.store });
		const { files, manifest } = buildArtefacts(db);
		expect(manifest.counts.title_overrides).toMatchObject({ fr: 2, zh: 3, en: 0 });
		const text = (prefix) =>
			Object.fromEntries([...files].filter(([p]) => p.startsWith(prefix)).map(([p, b]) => [p.slice(prefix.length, -5), b.toString('utf8')]));
		const corpus = loadCorpus({ core: files.get('core.bin'), titles: text('titles/'), names: text('names/') });
		expect(searchTitles(corpus, { q: 'poulet', lang: 'fr' }).recipes.map((r) => [r.id, r.title])).toEqual([[900001, 'Soupe au poulet']]);
		expect(searchTitles(corpus, { q: 'Chicken', lang: 'fr' }).recipes.map((r) => r.title)).toEqual(['Soupe au poulet']);
		expect(searchTitles(corpus, { q: '鸡', lang: 'zh' }).recipes.map((r) => r.title)).toEqual(['鸡汤']);
		const page = JSON.parse(files.get('r/900003.json').toString('utf8'));
		expect(page.i18n.zh).toEqual({ title: '提拉米苏', instructions: '1. 将饼干和奶油分层铺好。\n2. 冷藏 4 小时。', is_machine: 1 });
		// A title without instructions in its language still reaches the page, over the English text.
		expect(page.i18n.fr).toEqual({ title: 'Tiramisu', instructions: RECIPES[2].instructions, is_machine: 0 });
		expect(JSON.parse(files.get('r/900001.json').toString('utf8')).i18n.fr.title).toBe('Soupe au poulet');
	}, 60_000);
});

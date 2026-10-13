import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { BUDGETS, buildArtefacts, checkBudgets, encodeCore, fixtureDb } from './artefacts.mjs';
import { CORE_SECTIONS, NULL_INT, decodeCore } from '../../src/lib/data/core.js';
import { loadCorpus } from '../../src/lib/data/corpus.js';
import { compareBinary } from '../../src/lib/data/text.js';
import { checkInstalled, install, isHot, pack, readLock, readTree, sha256, unpack, verifyAgainstManifest } from '../../scripts/lib/datapack.mjs';

const FIXTURE = readFileSync(new URL('../fixtures/artefact-corpus.sql', import.meta.url), 'utf8');

let built;
let db;
beforeAll(() => {
	db = fixtureDb(FIXTURE);
	built = buildArtefacts(db);
});
const text = (p) => built.files.get(p).toString('utf8');
const json = (p) => JSON.parse(text(p));
const all = (sql) => db.prepare(sql).all();

describe('determinism', () => {
	it('the same database gives byte-identical files and the same version', () => {
		const again = buildArtefacts(fixtureDb(FIXTURE));
		expect(again.version).toBe(built.version);
		expect([...again.files.keys()]).toEqual([...built.files.keys()]);
		for (const [p, body] of built.files) expect(sha256(again.files.get(p)), p).toBe(sha256(body));
	});

	it('one changed instruction changes the version and that recipe file only, besides the files embedding the version', () => {
		const changed = fixtureDb(FIXTURE);
		const { recipe_id: id } = changed.prepare(`SELECT recipe_id FROM recipe_i18n WHERE lang = 'fr' ORDER BY recipe_id LIMIT 1`).get();
		changed.prepare(`UPDATE recipe_i18n SET instructions = instructions || '!' WHERE recipe_id = ? AND lang = 'fr'`).run(id);
		const other = buildArtefacts(changed);
		expect(other.version).not.toBe(built.version);
		const differ = [...built.files.keys()].filter((p) => sha256(other.files.get(p)) !== sha256(built.files.get(p)));
		expect(differ.filter((p) => p.startsWith('r/'))).toEqual([`r/${id}.json`]);
		expect(differ.filter((p) => !p.startsWith('r/') && p !== 'manifest.json').every((p) => text(p).includes(built.version))).toBe(true);
	});
});

describe('manifest and versions', () => {
	it('lists every other file with its size and sha256, nothing else', () => {
		const manifest = json('manifest.json');
		expect(manifest.version).toBe(built.version);
		expect(manifest.files.map((f) => f.path)).toEqual([...built.files.keys()].filter((p) => p !== 'manifest.json').sort(compareBinary));
		expect(verifyAgainstManifest(built.files)).toEqual([]);
	});

	it('every small file carries the data version; per-recipe files do not', () => {
		for (const [p] of built.files) {
			if (p === 'manifest.json') continue;
			if (p === 'core.bin') expect(decodeCore(built.files.get(p)).version).toBe(built.version);
			else if (p.startsWith('r/')) expect(json(p).version).toBeUndefined();
			else expect(json(p).version, p).toBe(built.version);
		}
	});

	it('refuses to mix files of two data versions', () => {
		const changed = fixtureDb(FIXTURE);
		changed.exec("UPDATE ingredient_i18n SET name = name || '?' WHERE ingredient_id = 1 AND lang = 'en'");
		const other = buildArtefacts(changed);
		expect(other.version).not.toBe(built.version);
		const core = built.files.get('core.bin');
		expect(loadCorpus({ core, names: { en: text('names/en.json') } }).name(0, 'en')).toBeTruthy();
		const mixed = { en: other.files.get('names/en.json').toString('utf8') };
		expect(() => loadCorpus({ core, names: mixed }).name(0, 'en')).toThrow(/different builds/);
		const titles = { fr: other.files.get('titles/fr.json').toString('utf8') };
		expect(() => loadCorpus({ core, titles, names: { en: text('names/en.json') } }).title(0, 'fr')).toThrow(/different builds/);
	});
});

describe('schema', () => {
	it('core.bin decodes to the database it was built from', () => {
		const c = decodeCore(built.files.get('core.bin'));
		const recipes = all('SELECT * FROM recipes ORDER BY id');
		const ingredients = all('SELECT * FROM ingredients ORDER BY id');
		expect(c.recipes).toBe(recipes.length);
		expect(c.ingredients).toBe(ingredients.length);
		for (const [name] of CORE_SECTIONS) expect(c[name], name).toBeDefined();
		expect([...c.recipeId]).toEqual(recipes.map((r) => r.id));
		expect([...c.totalMinutes].map((v) => (v === NULL_INT ? null : v))).toEqual(recipes.map((r) => r.total_minutes));
		expect([...c.kcal].map((v) => (Number.isNaN(v) ? null : v))).toEqual(recipes.map((r) => r.kcal));
		expect([...c.coverage]).toEqual(recipes.map((r) => r.nutrition_coverage));
		expect([...c.nonStaple]).toEqual(recipes.map((r) => r.non_staple_count));
		expect(c.keys()).toEqual(ingredients.map((i) => i.canonical_key));
		expect([...c.recipeCount]).toEqual(ingredients.map((i) => i.recipe_count));
		const source = new Map(all('SELECT i.recipe_id, i.title FROM recipe_i18n i JOIN recipes r ON r.id = i.recipe_id AND i.lang = r.source_lang').map((r) => [r.recipe_id, r.title]));
		expect(c.sourceTitles()).toEqual(recipes.map((r) => source.get(r.id) ?? null));
		expect(c.sourceTitle(3)).toBe(source.get(recipes[3].id));
		for (const list of Object.values(c.vocab)) expect([...list].sort(compareBinary)).toEqual(list);
	});

	it('the CSR lists are delta-coded ascending lists that mirror each other', () => {
		const c = decodeCore(built.files.get('core.bin'));
		const lists = (start, values) =>
			Array.from({ length: start.length - 1 }, (_, i) => {
				let v = 0;
				return [...values.subarray(start[i], start[i + 1])].map((d) => (v += d));
			});
		const byRecipe = lists(c.recipeIngStart, c.recipeIng);
		const byIngredient = lists(c.postingStart, c.posting);
		const pairs = all('SELECT recipe_id, ingredient_id FROM recipe_ingredients ORDER BY recipe_id, ingredient_id');
		expect(byRecipe.flatMap((gs, r) => gs.map((g) => [c.recipeId[r], g + 1]))).toEqual(pairs.map((p) => [p.recipe_id, p.ingredient_id]));
		expect(byIngredient.reduce((n, l) => n + l.length, 0)).toBe(pairs.length);
		for (const [g, rs] of byIngredient.entries()) for (const r of rs) expect(byRecipe[r]).toContain(g);
	});

	it('names files resolve COALESCE(t.name, en.name, canonical_key) and mark own names', () => {
		const ingredients = all('SELECT id, canonical_key FROM ingredients ORDER BY id');
		const rows = all('SELECT ingredient_id, lang, name FROM ingredient_i18n');
		const own = (lang) => new Map(rows.filter((r) => r.lang === lang).map((r) => [r.ingredient_id, r.name]));
		const en = own('en');
		for (const lang of json('manifest.json').langs) {
			const file = json(`names/${lang}.json`);
			const mine = own(lang);
			expect(file.names.split('\n')).toEqual(ingredients.map((i) => mine.get(i.id) ?? en.get(i.id) ?? i.canonical_key));
			expect(file.own).toBe(ingredients.map((i) => (mine.has(i.id) ? '1' : '0')).join(''));
		}
	});

	it('title overrides hold exactly the language titles that differ from the source title', () => {
		const rows = all(`SELECT t.recipe_id, t.lang, t.title, s.title AS source FROM recipe_i18n t JOIN recipes r ON r.id = t.recipe_id
			LEFT JOIN recipe_i18n s ON s.recipe_id = r.id AND s.lang = r.source_lang ORDER BY t.recipe_id`);
		let overridden = 0;
		for (const lang of json('manifest.json').langs) {
			const file = json(`titles/${lang}.json`);
			const want = rows.filter((r) => r.lang === lang && r.title !== r.source);
			expect(file.ids).toEqual(want.map((r) => r.recipe_id));
			expect(file.titles).toEqual(want.map((r) => r.title));
			overridden += want.length;
		}
		expect(overridden).toBeGreaterThan(0);
	});

	it('a recipe file has the recipes row in table column order, every language row and the page order of ingredients', () => {
		const columns = all(`SELECT name FROM pragma_table_info('recipes') ORDER BY cid`).map((r) => r.name);
		const { id } = all('SELECT id FROM recipes ORDER BY id')[0];
		const detail = json(`r/${id}.json`);
		expect(Object.keys(detail)).toEqual(['recipe', 'i18n', 'ingredients', 'micronutrients', 'related']);
		expect(Object.keys(detail.recipe)).toEqual(columns);
		expect(Object.keys(detail.i18n)).toEqual(all(`SELECT lang FROM recipe_i18n WHERE recipe_id = ${id} ORDER BY lang`).map((r) => r.lang));
		expect(Object.keys(detail.ingredients[0])).toEqual(['id', 'canonical_key', 'category', 'raw_text', 'quantity', 'unit', 'grams']);
		expect(detail.related).toEqual(JSON.parse(all(`SELECT related_ids FROM recipe_related WHERE recipe_id = ${id}`)[0].related_ids));
	});

	it('every language gets titles, names and mosaic files, even one without rows', () => {
		const langs = json('manifest.json').langs;
		expect(langs).toEqual(expect.arrayContaining(['en', 'pnb', 'jv', 'es']));
		for (const lang of langs) for (const kind of ['titles', 'names', 'mosaic']) expect(built.files.has(`${kind}/${lang}.json`), `${kind}/${lang}`).toBe(true);
	});
});

describe('encodeCore', () => {
	it('rejects a value its section type cannot hold', () => {
		const columns = Object.fromEntries(CORE_SECTIONS.map(([name]) => [name, [0]]));
		expect(() => encodeCore({ ...columns, nonStaple: [70000] }, { format: 1 })).toThrow(/overflows u16/);
		expect(() => encodeCore({ ...columns, posting: undefined }, { format: 1 })).toThrow(/posting missing/);
	});
});

describe('size budgets', () => {
	it('the fixture is within budget', () => {
		expect(checkBudgets(built.files)).toEqual([]);
	});

	it('reports every exceeded budget', () => {
		const big = randomBytes(300_000);
		const files = new Map([
			['core.bin', big],
			['names/xx.json', big],
			['r/1.json', Buffer.alloc(BUDGETS.recipeRaw + 1)]
		]);
		const problems = checkBudgets(files);
		expect(problems.join('\n')).toMatch(/core\.bin: gzip/);
		expect(problems.join('\n')).toMatch(/names\/xx\.json: gzip/);
		expect(problems.join('\n')).toMatch(/r\/1\.json: raw/);
		expect(checkBudgets(new Map([['r/1.json', Buffer.alloc(10)]]), { ...BUDGETS, files: 0 })).toEqual(['1 files, budget 0']);
	});

	// The real artefacts exist where `npm run data:fetch` installed them (CI
	// runs it before the tests); without them this checks nothing and says so.
	const installed = path.resolve('static/data/manifest.json');
	// 3,500 files read and hashed: seconds, not the default 5 s budget.
	it.skipIf(!existsSync(installed))('the installed data (static/data) is the locked version, intact and within budget', () => {
		expect(checkInstalled(readLock())).toEqual([]);
		expect(checkBudgets(readTree(path.resolve('static/data')))).toEqual([]);
	}, 120_000);
});

describe('data pack', () => {
	it('round-trips every file byte for byte', () => {
		const back = unpack(pack(built.files));
		expect([...back.keys()].sort()).toEqual([...built.files.keys()].sort());
		for (const [p, body] of built.files) expect(sha256(back.get(p))).toBe(sha256(body));
	});

	it('refuses paths that escape the install directory', () => {
		expect(() => unpack(pack(new Map([['../evil', Buffer.from('x')]])))).toThrow(/unsafe path/);
	});

	it('verifyAgainstManifest names a changed, missing or extra file', () => {
		const files = new Map(built.files);
		const [first] = json('manifest.json').files;
		files.set(first.path, Buffer.from('tampered'));
		files.set('extra.json', Buffer.from('{}'));
		const second = json('manifest.json').files[1].path;
		files.delete(second);
		const problems = verifyAgainstManifest(files);
		expect(problems).toContain(`${first.path} differs from manifest.json`);
		expect(problems).toContain(`${second} missing`);
		expect(problems).toContain('extra.json is not in manifest.json');
	});

	it('install writes both trees and checkInstalled accepts them, then catches drift', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'cookup-data-'));
		try {
			const dirs = { staticDir: path.join(dir, 'static'), generatedDir: path.join(dir, 'generated') };
			install(built.files, dirs);
			const lock = { version: built.version, manifest_sha256: sha256(built.files.get('manifest.json')) };
			expect(checkInstalled(lock, dirs)).toEqual([]);
			expect([...readTree(dirs.generatedDir).keys()].every(isHot)).toBe(true);
			expect(readTree(dirs.generatedDir).has('core.bin')).toBe(true);
			expect(readTree(dirs.generatedDir).has(`r/${all('SELECT id FROM recipes LIMIT 1')[0].id}.json`)).toBe(false);

			writeFileSync(path.join(dirs.generatedDir, 'core.bin'), 'x');
			expect(checkInstalled(lock, dirs).join('\n')).toMatch(/core\.bin missing or different/);
			expect(checkInstalled({ ...lock, manifest_sha256: 'other' }, dirs).join('\n')).toMatch(/another data version/);
			rmSync(dirs.staticDir, { recursive: true });
			expect(checkInstalled(lock, dirs).join('\n')).toMatch(/manifest\.json missing/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

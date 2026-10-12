import { describe, it, expect } from 'vitest';
import { foldText, buildIndex, search } from './search';
import { loadGlossary, getEntry, getTermIds, getDiagramInfo, mergeEntries } from './load';
import { MAX_QUERY } from '$lib/search';
import type { CategoryId, GlossaryEntry, TermMeta, TermText } from './types';

interface Fixture {
	en?: string;
	short?: string;
	cat?: CategoryId;
	/** language-neutral aliases (terms.json) */
	aliases?: string[];
	/** local-language aliases (content/<lang>.json) */
	local?: string[];
}

function entry(id: string, name: string, f: Fixture = {}): GlossaryEntry {
	return {
		id,
		en: f.en ?? name,
		category: f.cat ?? 'modernist',
		aliases: f.aliases ?? [],
		related: [],
		text: { name, short: f.short ?? '', long: '', aliases: f.local }
	};
}

// Spelled with escapes so no editor or formatter can normalise the nukta forms.
const TADKA_DECOMPOSED = 'त\u0921\u093C\u0915\u093E';
const TADKA_COMPOSED = 'त\u095C\u0915\u093E';
const TADKA_PLAIN = 'त\u0921\u0915\u093E';

const ids = (entries: GlossaryEntry[], q: string, cat?: CategoryId) =>
	search(buildIndex(entries), q, { cat }).map((h) => h.id);

describe('foldText', () => {
	it('strips Latin accents and folds stroked and ligature letters', () => {
		expect(foldText('Sauté')).toBe('saute');
		expect(foldText('Crème brûlée')).toBe('creme brulee');
		expect(foldText('Straße')).toBe('strasse');
		expect(foldText('Đun sôi')).toBe('dun soi');
		expect(foldText('Smørrebrød')).toBe('smorrebrod');
		expect(foldText('Œuf Æble Łódź')).toBe('oeuf aeble lodz');
		expect(foldText('DİYARBAKIR ılık')).toBe('diyarbakir ilik');
	});

	it('collapses whitespace, including full-width and non-breaking spaces', () => {
		expect(foldText('  sous \t\n vide  ')).toBe('sous vide');
		expect(foldText('ａｂ　ｃ')).toBe('ab c');
	});

	it('removes Arabic harakat and tatweel but keeps the letters', () => {
		expect(foldText('سُوسْ')).toBe('سوس');
		expect(foldText('اســـتحلاب')).toBe('استحلاب');
	});

	it('unifies alef, yeh, kaf and heh variants', () => {
		const alefs = ['استحلاب', 'إستحلاب', 'أستحلاب', 'آستحلاب', 'ٱستحلاب'].map(foldText);
		expect(new Set(alefs).size).toBe(1);
		expect(foldText('مستوى')).toBe(foldText('مستوي'));
		expect(foldText('مستوی')).toBe(foldText('مستوي'));
		expect(foldText('طبخة')).toBe(foldText('طبخه'));
		expect(foldText('کباب')).toBe(foldText('كباب'));
		expect(foldText('بھوننا')).toBe(foldText('بهوننا'));
		expect(foldText('بہوننا')).toBe(foldText('بهوننا'));
	});

	it('folds composed and decomposed nukta forms to the base consonant', () => {
		expect(foldText(TADKA_COMPOSED)).toBe(TADKA_PLAIN);
		expect(foldText(TADKA_DECOMPOSED)).toBe(TADKA_PLAIN);
		// Bengali U+09DC decomposes to U+09A1 + nukta the same way
		expect(foldText('\u09DC')).toBe('\u09A1');
	});

	it('keeps Indic vowel signs: stripping every mark would reduce words to consonants', () => {
		expect(foldText('\u0915\u093E')).toBe('\u0915\u093E');
		expect(foldText('\u0995\u09BF')).toBe('\u0995\u09BF');
	});

	it('strips ZWJ and ZWNJ', () => {
		expect(foldText('\u0645\u06CC\u200C\u062E\u0648\u0627\u0647\u0645')).toBe(
			foldText('\u0645\u06CC\u062E\u0648\u0627\u0647\u0645')
		);
		expect(foldText('\u0915\u200D\u0937')).toBe('\u0915\u0937');
	});

	it('folds katakana to hiragana, including dakuten and half-width forms', () => {
		expect(foldText('ブランチング')).toBe('ぶらんちんぐ');
		expect(foldText('ﾌﾞﾗﾝﾁ')).toBe('ぶらんち');
		expect(foldText('ぶらんち')).toBe('ぶらんち');
		// the prolonged sound mark sits outside the shifted range and must survive
		expect(foldText('スーヴィード')).toContain('ー');
	});

	it('keeps Hangul syllables composed', () => {
		const nfd = '수비드'.normalize('NFD');
		expect(nfd).not.toBe('수비드');
		expect(foldText(nfd)).toBe('수비드');
	});

	it('is idempotent', () => {
		for (const s of ['Sauté', 'سُوسْ', 'तड़का', 'ブランチ', 'Ёж', 'Đun sôi']) {
			expect(foldText(foldText(s))).toBe(foldText(s));
		}
	});
});

describe('search: scripts', () => {
	it('fr: "saute" finds Sauté in either case', () => {
		const e = [entry('saute', 'Sauté', { cat: 'dry-heat' }), entry('roast', 'Rôtir')];
		expect(ids(e, 'saute')).toEqual(['saute']);
		expect(ids(e, 'SAUTÉ')).toEqual(['saute']);
	});

	it('es: "pure" finds Puré', () => {
		const e = [entry('puree', 'Puré'), entry('sear', 'Sellar')];
		expect(ids(e, 'pure')).toEqual(['puree']);
	});

	it('vi: "dun soi" finds Đun sôi', () => {
		const e = [entry('boil', 'Đun sôi', { en: 'Boil' }), entry('steam', 'Hấp', { en: 'Steam' })];
		expect(ids(e, 'dun soi')).toEqual(['boil']);
		expect(ids(e, 'đun')).toEqual(['boil']);
		expect(ids(e, 'sôi')).toEqual(['boil']);
	});

	it('ar: matches with and without harakat, in either direction', () => {
		const withMarks = [entry('sv', 'سُوسْ فِيد', { en: 'Sous-vide' })];
		expect(ids(withMarks, 'سوس')).toEqual(['sv']);
		expect(ids(withMarks, 'سُوس')).toEqual(['sv']);
		const bare = [entry('sv', 'سوس فيد', { en: 'Sous-vide' })];
		expect(ids(bare, 'سُوسْ فِيد')).toEqual(['sv']);
	});

	it('ar: every alef variant finds the same entry', () => {
		const e = [entry('em', 'استحلاب', { en: 'Emulsify' }), entry('bl', 'سلق', { en: 'Blanch' })];
		for (const q of ['استحلاب', 'إستحلاب', 'أستحلاب', 'آستحلاب', 'ٱستحلاب']) {
			expect(ids(e, q)).toEqual(['em']);
		}
		const hamza = [entry('em', 'إستحلاب', { en: 'Emulsify' })];
		expect(ids(hamza, 'استحلاب')).toEqual(['em']);
	});

	it('pnb: heh doachashmee and heh goal match plain heh', () => {
		const e = [entry('fry', 'بھوننا', { en: 'Fry' }), entry('kb', 'کباب', { en: 'Kebab' })];
		expect(ids(e, 'بھوننا')).toEqual(['fry']);
		expect(ids(e, 'بہوننا')).toEqual(['fry']);
		expect(ids(e, 'بهوننا')).toEqual(['fry']);
		expect(ids(e, 'كباب')).toEqual(['kb']);
	});

	it('hi: tadka matches with and without the nukta, composed or not', () => {
		for (const name of [TADKA_DECOMPOSED, TADKA_COMPOSED, TADKA_PLAIN]) {
			const e = [entry('tadka', name, { en: 'Tadka' })];
			for (const q of [TADKA_DECOMPOSED, TADKA_COMPOSED, TADKA_PLAIN, TADKA_PLAIN.slice(0, 2)]) {
				expect(ids(e, q)).toEqual(['tadka']);
			}
		}
	});

	it('hi: a different vowel sign does not match', () => {
		const e = [entry('tadka', TADKA_DECOMPOSED, { en: 'Tadka' })];
		expect(ids(e, 'त\u0921\u0915\u093F')).toEqual([]);
	});

	it('ja: hiragana and katakana are interchangeable', () => {
		const e = [
			entry('blanch', 'ブランチング', { en: 'Blanch' }),
			entry('boil', 'ゆでる', { en: 'Boil' })
		];
		expect(ids(e, 'ぶらんちんぐ')).toEqual(['blanch']);
		expect(ids(e, 'ブランチ')).toEqual(['blanch']);
		expect(ids(e, 'ユデル')).toEqual(['boil']);
		expect(ids(e, 'ゆでる')).toEqual(['boil']);
	});

	it('ja: katakana alias is found from hiragana input', () => {
		const e = [entry('sv', '真空調理', { en: 'Sous-vide', local: ['スーヴィード'] })];
		expect(ids(e, 'すーゔぃーど')).toEqual(['sv']);
	});

	it('zh: a single character is a valid query and matches by substring', () => {
		const e = [entry('blanch', '焯水', { en: 'Blanch' }), entry('steam', '蒸', { en: 'Steam' })];
		expect(ids(e, '焯')).toEqual(['blanch']);
		expect(ids(e, '水')).toEqual(['blanch']);
		expect(ids(e, '蒸')).toEqual(['steam']);
		expect(ids(e, '炒')).toEqual([]);
	});

	it('ko: a partial name matches, and NFD-typed input is recomposed', () => {
		const e = [entry('sv', '수비드', { en: 'Sous-vide' }), entry('bl', '데치기', { en: 'Blanch' })];
		expect(ids(e, '수')).toEqual(['sv']);
		expect(ids(e, '수비')).toEqual(['sv']);
		expect(ids(e, '비드')).toEqual(['sv']);
		expect(ids(e, '수비드'.normalize('NFD'))).toEqual(['sv']);
		expect(ids(e, '데치')).toEqual(['bl']);
	});

	it('ru: yo and ye are interchangeable in names and aliases', () => {
		const e = [
			entry('braise', 'Тушение', { en: 'Braise', local: ['тушёнка'] }),
			entry('sear', 'Обжарка', { en: 'Sear' })
		];
		expect(ids(e, 'тушенка')).toEqual(['braise']);
		expect(ids(e, 'тушёнка')).toEqual(['braise']);
		expect(foldText('Ёж')).toBe(foldText('еж'));
	});

	it('finds the English name whatever the UI language', () => {
		const e = [
			entry('sv', '真空調理', { en: 'Sous-vide' }),
			entry('em', 'استحلاب', { en: 'Emulsify' }),
			entry('bl', 'Blanchir', { en: 'Blanch' })
		];
		expect(ids(e, 'sous vide')).toEqual(['sv']);
		expect(ids(e, 'sous')).toEqual(['sv']);
		expect(ids(e, 'emulsif')).toEqual(['em']);
		expect(ids(e, 'EMULSIFY')).toEqual(['em']);
		expect(ids(e, 'blanch')).toEqual(['bl']);
	});

	it('finds terms through neutral aliases from terms.json', () => {
		const e = [entry('julienne', 'ジュリエンヌ', { en: 'Julienne', aliases: ['allumette'] })];
		expect(ids(e, 'allumette')).toEqual(['julienne']);
	});
});

describe('search: ranking and semantics', () => {
	const fixtures = [
		entry('def', 'Braise', { en: 'Braise', short: 'Cook slowly, never fry first.' }),
		entry('def-sub', 'Reheat', { en: 'Reheat', short: 'Often called refrying.' }),
		entry('sub', 'Airfry', { en: 'Airfry' }),
		entry('alias', 'Sauté', { en: 'Sauté', aliases: ['fry off'] }),
		entry('word', 'Pan-fry', { en: 'Pan-fry' }),
		entry('prefix', 'Frying', { en: 'Frying' }),
		entry('exact', 'Fry', { en: 'Fry' }),
		entry('en-only', '炒める', { en: 'Fry basket method' })
	];

	it('orders exact > prefix > word-prefix > alias > substring > English name > definition', () => {
		expect(ids(fixtures, 'fry')).toEqual([
			'exact',
			'prefix',
			'word',
			'alias',
			'sub',
			'en-only',
			'def',
			'def-sub'
		]);
	});

	it('reports strictly descending scores', () => {
		const scores = search(buildIndex(fixtures), 'fry').map((h) => h.score);
		expect(scores).toEqual([...scores].sort((a, b) => b - a));
		expect(new Set(scores).size).toBe(scores.length);
	});

	it('breaks score ties by shorter name, then by given order', () => {
		const e = [
			entry('long', 'Roasted nuts'),
			entry('short', 'Roasts'),
			entry('first', 'Roaster'),
			entry('second', 'Roaster')
		];
		expect(ids(e, 'roast')).toEqual(['short', 'first', 'second', 'long']);
	});

	it('requires every token (AND)', () => {
		const e = [
			entry('sv', 'Sous-vide'),
			entry('sc', 'Sous-chef prep'),
			entry('poach', 'Poach', { short: 'Cook gently in hot liquid, often sous vide.' })
		];
		expect(ids(e, 'sous vide')).toEqual(['sv', 'poach']);
		expect(ids(e, 'vide sous')).toEqual(['sv', 'poach']);
		expect(ids(e, 'sous chef')).toEqual(['sc']);
		expect(ids(e, 'sous poach')).toEqual(['poach']);
		expect(ids(e, 'sous zzz')).toEqual([]);
	});

	it('sums per-token tiers, so matching more strongly wins', () => {
		const e = [
			entry('a', 'Cold smoke', { en: 'Cold smoke' }),
			entry('b', 'Smoke', { en: 'Smoke', short: 'Flavor food with cold wood smoke.' })
		];
		expect(ids(e, 'cold smoke')).toEqual(['a', 'b']);
	});

	it('ranks the whole phrase above a longer name containing both words', () => {
		const e = [entry('p', 'Vide sous'), entry('a', 'Sous-vide')];
		expect(ids(e, 'sous vide')).toEqual(['a', 'p']);
	});

	it('treats punctuation in the query as a separator', () => {
		const e = [entry('sv', 'Sous-vide')];
		expect(ids(e, 'sous-vide')).toEqual(['sv']);
		expect(ids(e, '"sous, vide!"')).toEqual(['sv']);
	});

	it('filters by category, with and without a query', () => {
		const e = [
			entry('a', 'Blanch', { cat: 'moist-heat' }),
			entry('b', 'Blend', { cat: 'prep-mixing' }),
			entry('c', 'Bake', { cat: 'dry-heat' })
		];
		expect(ids(e, 'bl')).toEqual(['b', 'a']);
		expect(ids(e, 'bl', 'moist-heat')).toEqual(['a']);
		expect(ids(e, '', 'dry-heat')).toEqual(['c']);
		expect(ids(e, 'bl', 'dry-heat')).toEqual([]);
	});

	it('returns everything in the given order with score 0 for an empty query', () => {
		const e = [entry('z', 'Zest'), entry('a', 'Acidify'), entry('m', 'Marinate')];
		const hits = search(buildIndex(e), '');
		expect(hits).toEqual([
			{ id: 'z', score: 0 },
			{ id: 'a', score: 0 },
			{ id: 'm', score: 0 }
		]);
		expect(ids(e, '   ')).toEqual(['z', 'a', 'm']);
		expect(ids(e, '!!!')).toEqual(['z', 'a', 'm']);
	});

	it('returns nothing for an empty glossary', () => {
		expect(search(buildIndex([]), 'x')).toEqual([]);
		expect(search(buildIndex([]), '')).toEqual([]);
	});

	it('clamps a very long query instead of choking on it', () => {
		const e = [entry('a', 'Alpha')];
		expect(() => search(buildIndex(e), 'a'.repeat(MAX_QUERY * 50))).not.toThrow();
		expect(ids(e, 'alpha' + ' '.repeat(10) + 'x'.repeat(MAX_QUERY))).toEqual([]);
	});
});

describe('mergeEntries', () => {
	const metas: TermMeta[] = [
		{ id: 'b', en: 'Beta', category: 'dry-heat', aliases: [], related: [] },
		{ id: 'a', en: 'Alpha', category: 'dry-heat', aliases: [], related: [] },
		{ id: 'c', en: 'Gamma', category: 'dry-heat', aliases: [], related: [] },
		{ id: 'noen', en: 'Delta', category: 'dry-heat', aliases: [], related: [] }
	];
	const t = (name: string, extra: Partial<TermText> = {}): TermText => ({
		name,
		short: `${name} short`,
		long: `${name} long`,
		...extra
	});
	const en = { a: t('Alpha'), b: t('Beta'), c: t('Gamma') };

	it('uses the whole localised TermText when present, the English one otherwise', () => {
		const fr = { a: t('Éta', { tips: ['x', 'y'] }) };
		const out = mergeEntries(metas, en, fr, 'fr');
		const byId = Object.fromEntries(out.map((e) => [e.id, e]));
		expect(byId.a.text).toBe(fr.a);
		expect(byId.b.text).toBe(en.b);
		expect(byId.a.text.tips).toEqual(['x', 'y']);
		// no field-by-field merge: the English tips must not leak into the French entry
		expect(byId.b.text.tips).toBeUndefined();
	});

	it('skips terms that have no English text, even if the language has one', () => {
		const out = mergeEntries(metas, en, { noen: t('Delta fr') }, 'fr');
		expect(out.map((e) => e.id)).not.toContain('noen');
	});

	it('sorts by the language collator and breaks ties by terms order', () => {
		const dup = { a: t('Same'), b: t('Same'), c: t('Same') };
		expect(mergeEntries(metas, dup, {}, 'en').map((e) => e.id)).toEqual(['b', 'a', 'c']);
		// a raw code-unit sort would put the accented name after Zebra
		const accented = { a: t('Zebra'), b: t('Émeu'), c: t('Alpha') };
		expect(mergeEntries(metas, accented, {}, 'fr').map((e) => e.text.name)).toEqual([
			'Alpha',
			'Émeu',
			'Zebra'
		]);
	});

	it('does not mutate its inputs', () => {
		const snapshot = metas.map((m) => m.id);
		mergeEntries(metas, en, {}, 'en');
		expect(metas.map((m) => m.id)).toEqual(snapshot);
	});
});

describe('loader (sample data)', () => {
	// These read the real checked-in content, so assert structure and invariants
	// rather than specific translated strings that later editing will change.
	const langs = ['en', 'fr', 'ar', 'ja'] as const;

	it('sorts every language with its own collator', async () => {
		for (const lang of langs) {
			const names = (await loadGlossary(lang)).map((e) => e.text.name);
			expect(names, lang).toEqual([...names].sort(new Intl.Collator(lang).compare));
		}
	});

	it('loads exactly the terms.json terms in every language', async () => {
		for (const lang of langs) {
			const loaded = (await loadGlossary(lang)).map((e) => e.id).sort();
			expect(loaded, lang).toEqual([...getTermIds()].sort());
		}
	});

	it('merges metadata with text; the English name equals terms.json', async () => {
		const sv = await getEntry('en', 'sous-vide');
		expect(sv?.category).toBe('modernist');
		expect(sv?.diagram).toBe('sous-vide');
		expect(sv?.text.name).toBe(sv?.en);
	});

	it('serves non-English text where a content file exists', async () => {
		const en = await loadGlossary('en');
		for (const lang of ['fr', 'ar', 'ja'] as const) {
			const localised = await loadGlossary(lang);
			expect(
				localised.some((e) => e.text.long !== en.find((x) => x.id === e.id)?.text.long),
				lang
			).toBe(true);
		}
	});

	it('keeps step counts equal to diagram marks in every language', async () => {
		for (const lang of langs) {
			for (const e of await loadGlossary(lang)) {
				if (!e.diagram) continue;
				const info = await getDiagramInfo(e.diagram);
				expect(info, `${lang}/${e.id}`).toBeDefined();
				expect(e.text.steps, `${lang}/${e.id}`).toHaveLength(info!.marks);
				expect(e.text.diagramAlt, `${lang}/${e.id}`).toBeTruthy();
			}
		}
	});

	it('caches per language and returns distinct arrays for distinct languages', async () => {
		expect(await loadGlossary('fr')).toBe(await loadGlossary('fr'));
		expect(await loadGlossary('fr')).not.toBe(await loadGlossary('en'));
		const [a, b] = await Promise.all([loadGlossary('ja'), loadGlossary('ja')]);
		expect(a).toBe(b);
	});

	it('returns undefined for an unknown id', async () => {
		expect(await getEntry('fr', 'no-such-term')).toBeUndefined();
		expect(await getEntry('en', '')).toBeUndefined();
		expect(await getDiagramInfo('no-such-diagram')).toBeUndefined();
	});

	it('finds each term by its own localised name first, and by its English name', async () => {
		for (const lang of langs) {
			const entries = await loadGlossary(lang);
			const index = buildIndex(entries);
			for (const e of entries) {
				expect(search(index, e.text.name)[0]?.id, `${lang}/${e.id} by name`).toBe(e.id);
				expect(search(index, e.en).map((h) => h.id), `${lang}/${e.id} by en`).toContain(e.id);
			}
		}
	});
});

// src/lib/data/text.js against SQLite itself: the FTS5 trigram folding (read
// back through fts5vocab), LIKE's ASCII-only case folding and BINARY order.
// If a node upgrade brings an SQLite with another Unicode table, this fails
// before search results drift from D1's.
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { compareBinary, ftsFold, likeFold, trigramMatch } from './text.js';
import { MATCH_PAGE_SIZE, MISSING_NAMES_SEP } from './match.js';
import { MAX_QUERY, MIN_FTS_LENGTH, RECIPE_HIT_LIMIT } from './search.js';
import * as config from '../config';
import * as search from '../search';

describe('ftsFold', () => {
	it('folds every code point of the BMP and the first supplementary plane exactly as the trigram tokenizer', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram'); CREATE VIRTUAL TABLE v USING fts5vocab(t, 'instance');`);
		const insert = db.prepare('INSERT INTO t(rowid, x) VALUES (?, ?)');
		db.exec('BEGIN');
		for (let cp = 0x20; cp <= 0x1ffff; cp++) {
			if (cp >= 0xd800 && cp <= 0xdfff) continue;
			const c = String.fromCodePoint(cp);
			insert.run(cp, c + c + c);
		}
		db.exec('COMMIT');
		const wrong = [];
		for (const { term, doc } of db.prepare('SELECT term, doc FROM v').iterate()) {
			const want = [...term][0];
			if (ftsFold(String.fromCodePoint(doc)) !== want) wrong.push(doc.toString(16));
		}
		expect(wrong).toEqual([]);
	}, 60_000);

	it('agrees with MATCH on mixed strings, including V8/SQLite disagreements', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(`CREATE VIRTUAL TABLE t USING fts5(x, tokenize='trigram')`);
		const docs = ['Crème Brûlée', 'ΣΟΦΙΑ ς', 'Straße ẞ', 'İstanbul Kebab', 'µg ſoup', 'ᏣᎳᎩ', 'Ⴀrmenian', 'a😀😀b', 'CHICKEN soup'];
		docs.forEach((d, i) => db.prepare('INSERT INTO t(rowid, x) VALUES (?, ?)').run(i + 1, d));
		for (const q of ['crè', 'BRÛ', 'σοφ', 'ΣΟΦ', 'ss ', 'ẞ', 'ist', 'İST', 'μg', 'sou', 'ꮳꮃ', 'ᏣᎳᎩ', 'ⴀrm', '😀😀', 'a😀😀', 'ken', 'xyz']) {
			const sql = db.prepare('SELECT rowid FROM t WHERE x MATCH ? ORDER BY rowid').all(`"${q.replace(/"/g, '""')}"`).map((r) => r.rowid);
			const js = docs.map((d, i) => [i + 1, trigramMatch(ftsFold(d), ftsFold(q))]).filter(([, hit]) => hit).map(([i]) => i);
			expect(js, q).toEqual(sql);
		}
	});
});

describe('likeFold', () => {
	it('is case-insensitive for ASCII only, like LIKE without case_sensitive_like', () => {
		const db = new DatabaseSync(':memory:');
		for (const [text, pattern] of [['Crème', 'CRÈME'], ['Crème', 'crème'], ['CHICKEN', 'chick'], ['Ölbaum', 'öl'], ['ΣΟΦΙΑ', 'σοφ'], ['abc', 'ABC']]) {
			const sql = db.prepare(`SELECT ? LIKE ? AS hit`).get(text, `%${pattern}%`).hit === 1;
			expect(likeFold(text).includes(likeFold(pattern)), `${text} / ${pattern}`).toBe(sql);
		}
	});
});

describe('compareBinary', () => {
	it('orders like SQLite BINARY, astral code points after U+E000..U+FFFF', () => {
		const db = new DatabaseSync(':memory:');
		const ch = String.fromCodePoint;
		const strings = ['', 'a', 'B', 'b', 'ab', ch(0xe9), 'e' + ch(0x301), ch(0xffff), ch(0xe000), ch(0x1f600), ch(0x1f600) + 'a',
			ch(0x4e2d), 'Z', ch(0) + 'x', 'zz', ch(0x3a9)];
		db.exec('CREATE TABLE s(v TEXT)');
		for (const v of strings) db.prepare('INSERT INTO s VALUES (?)').run(v);
		const sql = db.prepare('SELECT v FROM s ORDER BY v').all().map((r) => r.v);
		expect([...strings].sort(compareBinary)).toEqual(sql);
	});
});

describe('constants mirrored from the app (src/lib/data cannot import $lib)', () => {
	it('match and search limits equal config.ts / search.ts', () => {
		expect(MATCH_PAGE_SIZE).toBe(config.MATCH_PAGE_SIZE);
		expect(MISSING_NAMES_SEP).toBe(config.MISSING_NAMES_SEP);
		expect(MAX_QUERY).toBe(search.MAX_QUERY);
		expect(MIN_FTS_LENGTH).toBe(search.MIN_FTS_LENGTH);
		expect(RECIPE_HIT_LIMIT).toBe(search.RECIPE_HIT_LIMIT);
	});
});

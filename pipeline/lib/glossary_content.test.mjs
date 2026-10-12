import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
	REQUIRE_COMPLETE_LANGS,
	formatIssue,
	validateCompleteness,
	validateLangContent,
	validateStructure
} from './glossary_gate.mjs';
import { SUPPORTED_LANGS } from './langs.mjs';
import { loadGlossaryData } from './glossary_apply_lib.mjs';

// The real checked-in data. Tolerates an empty or partial dataset: missing
// language files simply produce no checks, so this only fails on real defects
// or on a REQUIRE_COMPLETE_LANGS language that lacks a term.
const root = fileURLToPath(new URL('../../src/lib/glossary', import.meta.url));
const data = loadGlossaryData(root, {
	diagramsDir: path.join(root, '..', '..', 'components', 'glossary', 'diagrams')
});
const { terms, diagrams, contentByLang } = data;

describe('glossary data (src/lib/glossary)', () => {
	it('is structurally valid', () => {
		const issues = validateStructure({
			terms,
			diagrams,
			contentByLang,
			diagramFileExists: data.diagramFileExists
		});
		expect(issues.map(formatIssue)).toEqual([]);
	});

	it('only has content files for supported languages', () => {
		for (const lang of Object.keys(contentByLang)) expect(SUPPORTED_LANGS).toContain(lang);
	});

	for (const lang of SUPPORTED_LANGS.filter((l) => l !== 'en')) {
		if (!contentByLang[lang]) continue;
		it(`${lang} passes the translation quality gate`, () => {
			const issues = validateLangContent({
				lang,
				terms,
				en: contentByLang.en ?? {},
				content: contentByLang[lang],
				allContentByLang: contentByLang
			});
			expect(issues.map(formatIssue)).toEqual([]);
		});
	}

	it(`has every term in ${REQUIRE_COMPLETE_LANGS.join(', ')}`, () => {
		const issues = validateCompleteness({ terms, contentByLang, langs: REQUIRE_COMPLETE_LANGS });
		expect(issues.map(formatIssue)).toEqual([]);
	});
});

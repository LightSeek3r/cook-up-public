import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { LANG_KEY, SUPPORTED_LANGS } from './config';

// static/lang-init.js runs before any module, so it repeats the language list
// and the storage key as literals. Run it for real against a fake browser.
const source = readFileSync(new URL('../../static/lang-init.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

/** The URL the script sends the page to, or null when it leaves it alone. */
function run({ url = 'https://cook.test/', languages = ['en-US'], stored = null, onLine = true, storage = 'ok' } = {}) {
	const u = new URL(url);
	let replaced = null;
	const sandbox = {
		URLSearchParams,
		location: {
			pathname: u.pathname,
			search: u.search,
			hash: u.hash,
			replace: (to) => (replaced = to)
		},
		navigator: { languages, language: languages[0], onLine },
		localStorage: {
			getItem(key) {
				if (storage === 'blocked') throw new Error('SecurityError');
				return key === LANG_KEY ? stored : null;
			}
		}
	};
	vm.runInNewContext(source, sandbox);
	return replaced;
}

describe('lang-init.js', () => {
	it('repeats the module constants', () => {
		// The key the script reads, not any mention of it (a comment would also match).
		expect(source.match(/localStorage\.getItem\('([^']+)'\)/)?.[1]).toBe(LANG_KEY);
		const literal = source
			.match(/var supported = \[([^\]]+)\]/)[1]
			.replaceAll("'", '')
			.split(/\s*,\s*/);
		expect(literal).toEqual([...SUPPORTED_LANGS]);
	});

	it('is linked from <head> in app.html', () => {
		expect(html).toContain('<script src="/lang-init.js">');
		expect(html.indexOf('/lang-init.js')).toBeLessThan(html.indexOf('%sveltekit.head%'));
	});

	it('sends a page without ?lang= to the browser language, keeping path, other params and hash', () => {
		expect(run({ languages: ['fr-FR', 'en'] })).toBe('/?lang=fr');
		expect(run({ url: 'https://cook.test/recipe/12?have=egg#steps', languages: ['de'] })).toBe(
			'/recipe/12?have=egg&lang=de#steps'
		);
	});

	it('takes the first browser language the site supports', () => {
		expect(run({ languages: ['sv-SE', 'zh-Hant-TW', 'en'] })).toBe('/?lang=zh');
		expect(run({ languages: ['pa-PK'] })).toBe('/?lang=pnb');
		expect(run({ languages: ['pa-IN'] })).toBeNull();
	});

	it('a language chosen in the picker beats the browser, English included', () => {
		expect(run({ languages: ['fr'], stored: 'es' })).toBe('/?lang=es');
		expect(run({ languages: ['fr'], stored: 'en' })).toBeNull();
	});

	it('ignores a stored value that is not a language, and blocked storage', () => {
		expect(run({ languages: ['it'], stored: 'klingon' })).toBe('/?lang=it');
		expect(run({ languages: ['it'], storage: 'blocked' })).toBe('/?lang=it');
	});

	it('leaves English, unsupported languages and explicit ?lang= alone', () => {
		expect(run({ languages: ['en-GB'] })).toBeNull();
		expect(run({ languages: ['sv'] })).toBeNull();
		expect(run({ url: 'https://cook.test/?lang=en', languages: ['fr'] })).toBeNull();
		expect(run({ url: 'https://cook.test/?lang=nope', languages: ['fr'] })).toBeNull();
	});

	it('does nothing offline or on /admin', () => {
		expect(run({ languages: ['fr'], onLine: false })).toBeNull();
		expect(run({ url: 'https://cook.test/admin', languages: ['fr'] })).toBeNull();
	});
});

/**
 * Mirrors src/lib/config.ts's `SUPPORTED_LANGS`. pipeline/ is plain Node ESM
 * and can't import the SvelteKit TS module (or its `$lib` alias) at runtime —
 * only a vitest test file can, since vite transpiles TS there. See
 * pipeline/lib/langs.test.mjs, which asserts these two lists stay identical,
 * so drift fails CI instead of relying on this comment (the failure mode that
 * used to require each of 03_normalize_ingredients.mjs, 07_translate.mjs and
 * pipeline/tools/verify_lang.mjs to keep its own copy in sync by hand).
 */
export const SUPPORTED_LANGS = [
	'en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'ja', 'ko', 'vi',
	'pt', 'it', 'bn', 'ru', 'pnb', 'jv'
];

// Every phase-2/3 recipe is source_lang='en' (see 07_translate.mjs's header)
// — every other supported language is a translation target.
export const TARGET_LANGS = SUPPORTED_LANGS.filter((l) => l !== 'en');

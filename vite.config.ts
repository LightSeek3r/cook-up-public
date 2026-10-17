import { sveltekit } from '@sveltejs/kit/vite';
// vitest/config's defineConfig, not plain vite's — a drop-in replacement that
// also types the `test` block below. Plain vite's UserConfig doesn't know
// about it, which fails svelte-check with "'test' does not exist".
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// `$lib` / `$components` are declared in svelte.config.js and the generated
		// .svelte-kit tsconfig, not in Vite — they only resolve because the
		// sveltekit() plugin above is loaded, so tests must share this config.
		// src/**/*.test.mjs is for the rare src-side test that needs real node APIs:
		// theme-css.test.mjs reads app.css as text, and Vite's SSR pipeline returns an
		// empty string for any CSS import (?raw and ?inline included). The generated
		// tsconfig typechecks src/**/*.{js,ts,svelte} but not .mjs, so that extension
		// buys node:fs without pulling in @types/node for one file.
		include: [
			'src/**/*.test.ts',
			'src/**/*.test.mjs',
			'pipeline/**/*.test.mjs',
			'scripts/**/*.test.mjs'
		],
		environment: 'node'
	}
});

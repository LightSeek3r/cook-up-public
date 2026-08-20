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
		include: ['src/**/*.test.ts', 'pipeline/**/*.test.mjs'],
		environment: 'node'
	}
});

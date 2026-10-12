#!/usr/bin/env node
// Usage: node scripts/verify-deploy.mjs <base-url> [--expect-version=<v>] [--page=/glossary ...]
//        [--api=/api/ingredients?lang=en ...] [--no-api] [--no-headers] [--wait=<seconds>]
//
// Exit 0 only if every page and API returns 200, the chunk graph is complete
// and from one build (see scripts/lib/chunks.mjs), and static files carry the
// `/*` headers of the project-root `_headers`. Makes plain GETs only: no
// JavaScript runs, so /api/track never fires and nothing is written.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { checkStaticHeaders, chunkReportOk, globalHeaderRules, verifyChunks } from './lib/chunks.mjs';

export const DEFAULT_PAGES = ['/', '/glossary'];
export const DEFAULT_APIS = ['/api/ingredients?lang=en'];

/**
 * @param {string} base
 * @param {{ pages?: string[], apis?: string[], expectVersion?: string, waitSeconds?: number, headersFile?: string, log?: (line: string) => void }} [opts]
 */
export async function verifyDeploy(base, opts = {}) {
	const log = opts.log ?? console.log;
	const pages = opts.pages?.length ? opts.pages : DEFAULT_PAGES;
	const apis = opts.apis ?? DEFAULT_APIS;
	const deadline = Date.now() + (opts.waitSeconds ?? 0) * 1000;
	const headersFile = opts.headersFile ?? '_headers';
	const headerRules = existsSync(headersFile) ? globalHeaderRules(readFileSync(headersFile, 'utf8')) : new Map();

	// A fresh deploy can take a few seconds to reach every colo; until then the
	// old version answers. Retry while the only problem is the version mismatch
	// or a transient failure, up to --wait seconds.
	for (let attempt = 1; ; attempt++) {
		const report = await verifyChunks(base, { pages, expectVersion: opts.expectVersion });
		/** @type {string[]} */
		const apiFailures = [];
		for (const path of apis) {
			const url = new URL(path, base).href;
			try {
				const res = await fetch(url, { headers: { 'user-agent': 'cook-up-verify/1' } });
				const type = res.headers.get('content-type') ?? '';
				if (res.status !== 200 || !type.includes('json')) apiFailures.push(`${res.status} ${type} ${url}`);
				await res.body?.cancel();
			} catch (err) {
				apiFailures.push(`${err instanceof Error ? err.message : err} ${url}`);
			}
		}
		const sampleChunk = report.urls.find((u) => u.endsWith('.js'));
		const headerProblems = headerRules.size
			? await checkStaticHeaders(
					[new URL('/favicon.svg', base).href, ...(sampleChunk ? [sampleChunk] : [])],
					headerRules
				)
			: [];
		const ok = chunkReportOk(report) && apiFailures.length === 0 && headerProblems.length === 0;
		if (ok || Date.now() >= deadline) {
			log(`version.json: ${report.version ?? '(unreadable)'}; __sveltekit_${report.htmlGlobal ?? '?'}`);
			log(`pages: ${pages.join(' ')}; apis: ${apis.join(' ') || '(none)'}`);
			log(`immutable files checked: ${report.checked}, failed: ${report.failures.length}`);
			log(
				headerRules.size
					? `static headers checked: ${[...headerRules.keys()].join(', ')} on /favicon.svg and ${sampleChunk ?? '(no chunk)'}`
					: `static headers: skipped (${headersFile ? `no ${headersFile}` : '--no-headers'})`
			);
			for (const f of report.failures) log(`  FAIL ${f.status} ${f.url}`);
			for (const p of report.problems) log(`  PROBLEM ${p}`);
			for (const a of apiFailures) log(`  API FAIL ${a}`);
			for (const h of headerProblems) log(`  HEADER FAIL ${h}`);
			log(ok ? 'VERIFY OK' : 'VERIFY FAILED');
			return { ok, report, apiFailures, headerProblems };
		}
		log(`attempt ${attempt} not yet consistent, retrying in 10 s`);
		await new Promise((resolve) => setTimeout(resolve, 10_000));
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const args = process.argv.slice(2);
	const base = args.find((a) => !a.startsWith('--'));
	if (!base) {
		console.error('usage: node scripts/verify-deploy.mjs <base-url> [--expect-version=v] [--page=/p] [--api=/a] [--wait=s]');
		process.exit(2);
	}
	/** @param {string} name */
	const many = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
	const { ok } = await verifyDeploy(base, {
		pages: many('page'),
		apis: args.includes('--no-api') ? [] : many('api').length ? many('api') : DEFAULT_APIS,
		expectVersion: many('expect-version')[0],
		waitSeconds: Number(many('wait')[0] ?? 0),
		// For checks run from a checkout that may be ahead of what is deployed.
		headersFile: args.includes('--no-headers') ? '' : undefined
	});
	process.exit(ok ? 0 : 1);
}

/**
 * Test doubles for the Worker's ASSETS binding and for a D1 that must not be
 * used, shared by the src test suites.
 */

/**
 * An ASSETS binding serving artefact files (paths as buildArtefacts returns
 * them, e.g. `core.bin`, `names/fr.json`) under /data/, 404 for anything else.
 * `fetched` records every path asked for, to prove what is cached.
 */
export function artefactAssets(files: Map<string, Uint8Array>) {
	const fetched: string[] = [];
	return {
		fetched,
		async fetch(input: string | URL | Request): Promise<Response> {
			const { pathname } = new URL(input instanceof Request ? input.url : input);
			fetched.push(pathname);
			const body = pathname.startsWith('/data/') ? files.get(pathname.slice('/data/'.length)) : undefined;
			return body ? new Response(body.slice()) : new Response('Not Found', { status: 404 });
		}
	};
}

/** A D1 binding that throws the moment anything touches it. */
export const throwingDb: unknown = new Proxy(
	{},
	{
		get(_, property) {
			throw new Error(`reached D1 (${String(property)})`);
		}
	}
);

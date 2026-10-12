/**
 * Test doubles for D1, shared by the src test suites.
 *
 * Both enforce D1's cap of 100 bound parameters per statement, which SQLite
 * itself does not (its default is 32,766): a statement over the cap passes
 * against node:sqlite and 500s on the real thing, as `/api/recipes` did at 100
 * favorites. The error is raised when the statement runs, like D1 does.
 */

/** https://developers.cloudflare.com/d1/platform/limits/ */
export const D1_MAX_BOUND_PARAMS = 100;

export function assertD1Binds(binds: readonly unknown[]): void {
	if (binds.length > D1_MAX_BOUND_PARAMS) {
		throw new Error(
			`D1_ERROR: too many SQL variables (${binds.length} bound, D1 allows ${D1_MAX_BOUND_PARAMS})`
		);
	}
}

/** The slice of node:sqlite's DatabaseSync this adapter uses, so the module
 *  needs no node types and can be imported from .ts and .mjs tests alike. */
export interface SqliteLike {
	prepare(sql: string): {
		all(...binds: never[]): unknown[];
		get(...binds: never[]): unknown;
		run(...binds: never[]): unknown;
	};
}

export interface FakeStatement {
	bind(...binds: unknown[]): FakeStatement;
	all<T = unknown>(): Promise<{ results: T[] }>;
	first<T = unknown>(): Promise<T | null>;
	run(): Promise<{ success: true; meta: Record<string, never> }>;
}

/**
 * A D1Database stand-in over a node:sqlite database: `prepare().bind().all()`,
 * `.first()` and `.run()`, with or without `bind`. Callers cast it to
 * `D1Database` where a type is needed.
 */
export function sqliteD1(sqlite: SqliteLike): { prepare(sql: string): FakeStatement } {
	return {
		prepare(sql) {
			const statement = (binds: unknown[]): FakeStatement => {
				const exec = async <R>(fn: (args: never[]) => R): Promise<R> => {
					assertD1Binds(binds);
					return fn(binds as never[]);
				};
				return {
					bind: (...next) => statement(next),
					all: <T>() =>
						exec((args) => ({ results: sqlite.prepare(sql).all(...args) as T[] })),
					first: <T>() => exec((args) => (sqlite.prepare(sql).get(...args) ?? null) as T | null),
					run: () =>
						exec((args) => {
							sqlite.prepare(sql).run(...args);
							return { success: true as const, meta: {} };
						})
				};
			};
			return statement([]);
		}
	};
}

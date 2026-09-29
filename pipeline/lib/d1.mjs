/**
 * Shared D1 shell-out helper (extracted from pipeline/07_translate.mjs).
 *
 * Invokes wrangler's own JS entry point directly via `node`, with the SQL as
 * one argv element — no shell involved at all, so none of its quoting rules
 * apply. (Two dead ends first: `execSync` with a command *string* went
 * through cmd.exe, which mangled embedded single quotes and newlines;
 * `execFileSync('npx.cmd', ...)` can't spawn without a shell either, since
 * `.cmd` files aren't directly executable.)
 *
 * Also owns the daily quota ledger (below) — every remote call's cost is
 * logged and checked here, in the one place that actually talks to D1,
 * rather than trusted to each caller.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const WRANGLER_BIN = path.resolve('node_modules/wrangler/bin/wrangler.js');

export function esc(v) {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'number') return String(v);
	return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * D1 free-tier daily caps, confirmed with the account owner on 2026-09-24:
 * 5,000,000 rows read, 100,000 rows written, reset 00:00 UTC. The real quota
 * was exhausted twice in one week before this guard existed (wrangler error
 * 7500, recovery trickling back in slowly) — the root cause was an FTS
 * 'rebuild' running after every translation batch (see
 * migrations/0008_recipe_title_fts_source_only.sql), but the ledger stays as
 * a second line of defence against any future per-call cost nobody thought to
 * budget for.
 *
 * Pipeline work may use at most 80% of each cap — the user's explicit
 * ceiling, not just this codebase's guess — leaving the rest as headroom for
 * live-site traffic (page views, searches), which this ledger cannot see.
 */
export const D1_READ_CAP = 5_000_000;
export const D1_WRITE_CAP = 100_000;
export const D1_BUDGET_FRACTION = 0.8;

export const D1_READ_BUDGET = Math.floor(D1_READ_CAP * D1_BUDGET_FRACTION);
export const D1_WRITE_BUDGET = Math.floor(D1_WRITE_CAP * D1_BUDGET_FRACTION);

export class D1BudgetExceeded extends Error {
	constructor(kind, used, budget) {
		super(
			`D1 ${kind} budget exceeded: ${used}/${budget} rows already used today ` +
				`(80% of the daily free-tier cap). Refusing to run another remote ` +
				`query — resume after the 00:00 UTC reset.`
		);
		this.name = 'D1BudgetExceeded';
		this.kind = kind;
		this.used = used;
		this.budget = budget;
	}
}

const EMPTY_LEDGER = { rows_read: 0, rows_written: 0 };

/** Pure: throws if `ledger`'s totals are already at or past either budget. Exported so
 *  the guard can be unit-tested without touching the filesystem or a real D1 call. */
export function checkBudget(ledger) {
	if (ledger.rows_read >= D1_READ_BUDGET) throw new D1BudgetExceeded('read', ledger.rows_read, D1_READ_BUDGET);
	if (ledger.rows_written >= D1_WRITE_BUDGET) {
		throw new D1BudgetExceeded('write', ledger.rows_written, D1_WRITE_BUDGET);
	}
}

/** Pure: returns a new ledger with `usage` added on top of `ledger`. Never mutates its input. */
export function addUsage(ledger, usage) {
	return {
		rows_read: ledger.rows_read + (usage.rows_read ?? 0),
		rows_written: ledger.rows_written + (usage.rows_written ?? 0)
	};
}

const LEDGER_DIR = path.resolve('pipeline/out/d1_usage');
const todayUtc = () => new Date().toISOString().slice(0, 10);
const ledgerPath = (date) => path.join(LEDGER_DIR, `${date}.json`);

function readLedger(date) {
	const p = ledgerPath(date);
	if (!existsSync(p)) return { ...EMPTY_LEDGER };
	return JSON.parse(readFileSync(p, 'utf8'));
}

function writeLedger(date, ledger) {
	mkdirSync(LEDGER_DIR, { recursive: true });
	writeFileSync(ledgerPath(date), JSON.stringify(ledger, null, 2) + '\n');
}

/**
 * Runs one D1 statement.
 *
 * Local mode never touches the ledger or the budget: wrangler's `--local`
 * `meta` only ever carries `duration` (confirmed directly against wrangler
 * 4.123.0), and there is no real quota to protect on a local sqlite file.
 *
 * Remote mode always requests `--json` from wrangler now (previously only
 * when `json: true` was passed) specifically so every call — including plain
 * INSERTs that don't care about `results` — reports `meta.rows_read` /
 * `meta.rows_written` for the ledger. The budget check runs *before* the call,
 * against the ledger's state from prior calls today: it cannot know this
 * call's own cost in advance, so it pauses the *next* call once a prior one's
 * actual usage crosses the budget, rather than pretending to predict this one.
 */
export function d1(sql, { local, json = true } = {}) {
	if (!local) {
		checkBudget(readLedger(todayUtc()));
	}

	const args = [WRANGLER_BIN, 'd1', 'execute', 'cook-up-db', local ? '--local' : '--remote', '--json', '--command', sql];
	const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 });
	const parsed = JSON.parse(out);

	if (!local) {
		const meta = parsed[0]?.meta ?? {};
		const date = todayUtc();
		writeLedger(date, addUsage(readLedger(date), { rows_read: meta.rows_read, rows_written: meta.rows_written }));
	}

	return json ? parsed[0]?.results ?? [] : out;
}

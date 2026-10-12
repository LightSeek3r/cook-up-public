#!/usr/bin/env node
// Usage: CF_ANALYTICS_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node scripts/d1-usage.mjs
//
// Today's D1 rows read/written for the whole account, against the Free plan's
// daily caps, from the GraphQL Analytics API. Read-only: it queries analytics
// about D1, never D1 itself, so it costs no D1 rows.
//
// Free caps (developers.cloudflare.com/d1/platform/pricing, checked
// 2026-10-12): 5,000,000 rows read and 100,000 rows written per day,
// account-wide, reset at 00:00 UTC. That reset is why "today (UTC)" is
// measured rather than a rolling 24 h: it is the window the cap counts.
// Past the cap D1 rejects every query until the reset.
//
// Token: Account > Account Analytics > Read, nothing else.
//
// Prints a report, appends it to $GITHUB_STEP_SUMMARY, and writes
// level=ok|warn|crit plus a one-line summary to $GITHUB_OUTPUT. Exits 1 only
// when the query itself fails; the workflow decides what a level means.
import { appendFileSync } from 'node:fs';

const CAPS = { rowsRead: 5_000_000, rowsWritten: 100_000 };
const WARN = Number(process.env.D1_WARN_RATIO ?? 0.7);
const CRIT = Number(process.env.D1_CRIT_RATIO ?? 0.9);
const ENDPOINT = process.env.CF_GRAPHQL_URL ?? 'https://api.cloudflare.com/client/v4/graphql';

const token = process.env.CF_ANALYTICS_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) {
	console.error('CF_ANALYTICS_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
	process.exit(1);
}

const now = new Date();
const today = now.toISOString().slice(0, 10);
const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

const query = `query D1Usage($accountTag: string!, $start: Date!, $end: Date!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(limit: 10000, filter: { date_geq: $start, date_leq: $end }) {
        sum { rowsRead rowsWritten readQueries writeQueries }
        dimensions { date databaseId }
      }
    }
  }
}`;

const res = await fetch(ENDPOINT, {
	method: 'POST',
	headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	body: JSON.stringify({ query, variables: { accountTag: account, start: yesterday, end: today } }),
	signal: AbortSignal.timeout(30_000)
});
/** @type {{ data?: any, errors?: { message: string }[] | null }} */
const body = await res.json().catch(() => ({ errors: [{ message: `HTTP ${res.status}, non-JSON body` }] }));
if (!res.ok || body.errors?.length) {
	console.error(`GraphQL query failed (HTTP ${res.status}): ${(body.errors ?? []).map((e) => e.message).join('; ')}`);
	process.exit(1);
}
const accounts = body.data?.viewer?.accounts ?? [];
if (accounts.length === 0) {
	console.error('no account in the response: check CLOUDFLARE_ACCOUNT_ID and that the token covers it');
	process.exit(1);
}

/** @type {{ sum: Record<string, number>, dimensions: { date: string, databaseId: string } }[]} */
const groups = accounts[0].d1AnalyticsAdaptiveGroups ?? [];
/** @param {string} date */
const total = (date) => {
	const t = { rowsRead: 0, rowsWritten: 0, readQueries: 0, writeQueries: 0 };
	for (const g of groups.filter((g) => g.dimensions.date === date)) {
		for (const k of /** @type {(keyof typeof t)[]} */ (Object.keys(t))) t[k] += g.sum[k] ?? 0;
	}
	return t;
};
const t = total(today);
const y = total(yesterday);
const ratio = { rowsRead: t.rowsRead / CAPS.rowsRead, rowsWritten: t.rowsWritten / CAPS.rowsWritten };
const worst = Math.max(ratio.rowsRead, ratio.rowsWritten);
const level = worst >= CRIT ? 'crit' : worst >= WARN ? 'warn' : 'ok';

// Linear projection to midnight UTC; only a hint, traffic is not uniform.
const elapsed = (now.getTime() - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
const project = (/** @type {number} */ used) => (elapsed > 0.05 ? Math.round(used / elapsed) : null);
const pct = (/** @type {number} */ r) => `${(r * 100).toFixed(1)}%`;
const fmt = (/** @type {number | null} */ n) => (n === null ? 'n/a' : n.toLocaleString('en-US'));

const lines = [
	`### D1 usage ${today} (UTC, ${Math.round(elapsed * 24)} h into the day): ${level.toUpperCase()}`,
	'',
	'| | used today | Free cap | share | projected 24 h | yesterday |',
	'|---|---:|---:|---:|---:|---:|',
	`| rows read | ${fmt(t.rowsRead)} | ${fmt(CAPS.rowsRead)} | ${pct(ratio.rowsRead)} | ${fmt(project(t.rowsRead))} | ${fmt(y.rowsRead)} |`,
	`| rows written | ${fmt(t.rowsWritten)} | ${fmt(CAPS.rowsWritten)} | ${pct(ratio.rowsWritten)} | ${fmt(project(t.rowsWritten))} | ${fmt(y.rowsWritten)} |`,
	`| queries (read / write) | ${fmt(t.readQueries)} / ${fmt(t.writeQueries)} | | | | ${fmt(y.readQueries)} / ${fmt(y.writeQueries)} |`,
	'',
	`Thresholds: warn ${pct(WARN)}, critical ${pct(CRIT)} of either cap. Caps are account-wide and reset at 00:00 UTC.`
];
const summary = `D1 ${today}: reads ${pct(ratio.rowsRead)} (${fmt(t.rowsRead)}), writes ${pct(ratio.rowsWritten)} (${fmt(t.rowsWritten)}) of the Free caps`;

console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, `level=${level}\nsummary=${summary}\ndate=${today}\n`);
}

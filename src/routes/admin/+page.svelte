<script lang="ts">
	import AreaChart from '$components/admin/AreaChart.svelte';
	import BarList from '$components/admin/BarList.svelte';
	import Donut from '$components/admin/Donut.svelte';
	import Histogram from '$components/admin/Histogram.svelte';
	import StatCard from '$components/admin/StatCard.svelte';
	import { LANG_NAMES, SUPPORTED_LANGS } from '$lib/config';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const stage = $derived(form?.stage === 'code' ? 'code' : 'email');
	const email = $derived(form && 'email' in form ? (form.email ?? '') : '');

	const ERRORS: Record<string, string> = {
		invalidEmail: 'That does not look like an email address.',
		invalidCode: 'The code is six digits.',
		// One message for every verify failure: distinct ones revealed which addresses are allowlisted.
		invalid: 'That code is not valid. It may be wrong, expired or already used — request a new one if needed.'
	};
	const errorText = $derived(
		form && 'error' in form && form.error ? (ERRORS[form.error] ?? 'Something went wrong.') : ''
	);

	const nf = new Intl.NumberFormat();
	const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
	// A null figure is one the deployed data artefacts do not record: no bar rather than a false 0.
	const known = (items: { key: string; n: number | null }[]) =>
		items.filter((item): item is { key: string; n: number } => item.n !== null);

	// In an attribute this would need entity-escaping to survive Svelte's `{`
	// expression syntax; as a binding it is just a string.
	const CODE_PATTERN = '[0-9]{6}';

	// `autofocus` is an accessibility smell in general, but this input is the sole
	// purpose of the step it appears on, and focusing it saves a screen-reader
	// user a tab. Done imperatively so the linter's blanket rule still holds.
	let codeInput: HTMLInputElement | undefined = $state();
	$effect(() => {
		codeInput?.focus();
	});

	// Translation completeness is measured against the recipe count, and the
	// machine column is the honest one: the translation tooling writes a row for
	// every language including the source, so `translated` alone reads as
	// complete for English regardless.
	const translationRows = $derived.by(() => {
		if (!data.authed) return [];
		const total = data.dashboard.content.recipes;
		const byLang = new Map(data.dashboard.translations.map((t) => [t.lang, t]));
		return SUPPORTED_LANGS.map((lang) => {
			const row = byLang.get(lang);
			return {
				lang,
				name: LANG_NAMES[lang],
				translated: row?.translated ?? 0,
				machine: row?.machine ?? null,
				missing: Math.max(0, total - (row?.translated ?? 0)),
				pct: pct(row?.translated ?? 0, total)
			};
		}).sort((a, b) => b.pct - a.pct);
	});
</script>

<svelte:head>
	<title>cook-up · admin</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if !data.authed}
	<section class="gate">
		<h1>Admin</h1>

		{#if stage === 'email'}
			<p class="lede">Enter your address and a one-time code will be sent to it.</p>
			<form method="POST" action="?/requestCode">
				<label for="email">Email</label>
				<input id="email" name="email" type="email" autocomplete="email" required value={email} />
				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
				<button type="submit">Send code</button>
			</form>
		{:else}
			<p class="lede">
				If <strong>{email}</strong> is authorised, a six-digit code is on its way. It expires in
				10 minutes.
			</p>
			<form method="POST" action="?/verify">
				<input type="hidden" name="email" value={email} />
				<label for="code">Code</label>
				<input
					id="code"
					name="code"
					bind:this={codeInput}
					inputmode="numeric"
					autocomplete="one-time-code"
					pattern={CODE_PATTERN}
					maxlength="6"
					class="code"
					required
				/>
				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
				<button type="submit">Sign in</button>
			</form>
			<form method="POST" action="?/requestCode" class="secondary">
				<input type="hidden" name="email" value={email} />
				<button type="submit" class="link">Send another code</button>
			</form>
		{/if}
	</section>
{:else}
	{@const d = data.dashboard}
	<section class="dash">
		<header class="head">
			<div>
				<h1>Admin</h1>
				<p class="lede">Signed in as {data.email}</p>
			</div>
			<form method="POST" action="?/logout">
				<button type="submit" class="link">Sign out</button>
			</form>
		</header>

		<h2>Traffic</h2>
		<div class="cards">
			<StatCard label="Views today" value={d.traffic.views.today} />
			<StatCard
				label="Views, last 30 days"
				value={d.traffic.views.last30}
				previous={d.traffic.views.prev30}
				hint="vs previous 30"
			/>
			<StatCard
				label="Visits, last 30 days"
				value={d.traffic.visits.last30}
				previous={d.traffic.visits.prev30}
				hint="new sessions"
			/>
			<StatCard label="Views, all time" value={d.traffic.views.total} />
			<StatCard
				label="Recipe views, last 30 days"
				value={d.traffic.recipeViews.last30}
				previous={d.traffic.recipeViews.prev30}
			/>
			<StatCard
				label="Recipes never opened"
				value={d.unseen}
				hint="of {nf.format(d.content.recipes)}"
			/>
		</div>

		<div class="panel">
			<h3>Views and visits, last 90 days</h3>
			<AreaChart points={d.series} />
		</div>

		<div class="grid-2">
			<div class="panel">
				<h3>Views by language, last 30 days</h3>
				<Donut items={d.langs} label="Page views by interface language" />
			</div>
			<div class="panel">
				<h3>Top recipes, last 30 days</h3>
				{#if d.top30.length}
					<ol class="ranked">
						{#each d.top30.slice(0, 12) as r (r.id)}
							<li>
								<a href="/recipe/{r.id}">{r.title}</a>
								<span>{nf.format(r.views)}</span>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="muted">No recipe views recorded yet.</p>
				{/if}
			</div>
		</div>

		<div class="grid-3">
			<div class="panel">
				<h3>Countries</h3>
				<BarList items={d.countries} empty="No views yet." />
			</div>
			<div class="panel">
				<h3>Referrers</h3>
				<BarList items={d.referrers} empty="All direct so far." />
			</div>
			<div class="panel">
				<h3>Device</h3>
				<BarList items={d.devices} empty="No views yet." />
			</div>
		</div>

		<h2>Translations</h2>
		<div class="panel">
			<h3>Completeness by language</h3>
			<table>
				<thead>
					<tr>
						<th scope="col">Language</th>
						<th scope="col">Rows</th>
						<th scope="col">Machine</th>
						<th scope="col">Missing</th>
						<th scope="col">Coverage</th>
					</tr>
				</thead>
				<tbody>
					{#each translationRows as row (row.lang)}
						<tr>
							<th scope="row">{row.name}</th>
							<td>{nf.format(row.translated)}</td>
							<td>{row.machine === null ? '—' : nf.format(row.machine)}</td>
							<td class:warn={row.missing > 0}>{nf.format(row.missing)}</td>
							<td class="barcell">
								<span class="track"><span class="bar" style:width="{row.pct}%"></span></span>
								<span class="pctn">{row.pct}%</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<h2>Content</h2>
		<div class="grid-2">
			<div class="panel">
				<h3>Nutrition coverage</h3>
				<Histogram buckets={d.coverage} threshold={Math.round(d.coverageMin * 10)} />
			</div>
			<div class="panel">
				<h3>Balance grade</h3>
				<BarList items={d.grades} />
			</div>
		</div>

		<div class="grid-2">
			<div class="panel">
				<h3>Recipe completeness</h3>
				<BarList
					total={d.content.recipes}
					asPercent
					items={known([
						{ key: 'Photo', n: d.content.withImage },
						{ key: 'Nutrition shown', n: d.content.nutritionVisible },
						{ key: 'Calories', n: d.content.withKcal },
						{ key: 'Difficulty', n: d.content.withDifficulty },
						{ key: 'Notes', n: d.content.withNotes },
						{ key: 'Cuisine', n: d.content.withCuisine }
					])}
				/>
				<p class="muted">Out of {nf.format(d.content.recipes)} recipes.</p>
			</div>
			<div class="panel">
				<h3>Ingredients</h3>
				<BarList
					total={d.ingredients.ingredients}
					asPercent
					items={known([
						{ key: 'With nutrition', n: d.ingredients.withNutrition },
						{ key: 'Used by no recipe', n: d.ingredients.orphans }
					])}
				/>
				<p class="muted">Out of {nf.format(d.ingredients.ingredients)} ingredients.</p>
			</div>
		</div>

		<div class="panel">
			<h3>Most-used ingredients</h3>
			<BarList items={d.topIngredients} />
		</div>
	</section>
{/if}

<style>
	.gate {
		max-width: 22rem;
		margin: var(--space-6) auto;
	}
	.gate form {
		display: grid;
		gap: var(--space-2);
		margin-top: var(--space-4);
	}
	.gate label {
		font-size: 0.85rem;
		color: var(--muted);
	}
	.gate input {
		font: inherit;
		padding: var(--space-3);
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--ink);
	}
	.code {
		font-size: 1.5rem;
		letter-spacing: 0.4em;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.gate button[type='submit'] {
		font: inherit;
		font-weight: 600;
		padding: var(--space-3);
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--primary);
		color: var(--on-primary);
		cursor: pointer;
	}
	.secondary {
		margin-top: var(--space-3);
		text-align: center;
	}
	.link {
		font: inherit;
		font-size: 0.85rem;
		background: none;
		border: 0;
		color: var(--muted);
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
	}
	.error {
		margin: 0;
		color: var(--grade-e);
		font-size: 0.85rem;
	}
	.lede {
		margin: var(--space-2) 0 0;
		color: var(--muted);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-4);
	}
	h1 {
		margin: 0;
	}
	h2 {
		margin: var(--space-6) 0 var(--space-3);
		font-size: 1.1rem;
		text-transform: lowercase;
		letter-spacing: 0.04em;
		color: var(--muted);
	}
	h3 {
		margin: 0 0 var(--space-3);
		font-size: 0.95rem;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: var(--space-3);
	}
	.panel {
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: var(--space-4);
		box-shadow: var(--shadow-1);
		margin-top: var(--space-3);
		min-width: 0;
	}
	.grid-2,
	.grid-3 {
		display: grid;
		gap: var(--space-3);
	}
	.grid-2 {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
	}
	.grid-3 {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
	}
	.ranked {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-2);
		font-size: 0.85rem;
	}
	.ranked li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.ranked span {
		color: var(--muted);
		font-variant-numeric: tabular-nums;
		flex: none;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	th,
	td {
		text-align: right;
		padding: var(--space-2) var(--space-1);
		border-bottom: 1px solid var(--line);
		font-variant-numeric: tabular-nums;
	}
	thead th {
		color: var(--muted);
		font-weight: 500;
	}
	th:first-child,
	tbody th {
		text-align: left;
		font-weight: 600;
	}
	.warn {
		color: var(--grade-d);
	}
	.barcell {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		justify-content: flex-end;
	}
	.track {
		flex: 1;
		max-width: 6rem;
		height: 8px;
		background: var(--surface-sunken);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}
	.bar {
		display: block;
		height: 100%;
		background: var(--primary);
		border-radius: var(--radius-pill);
	}
	.pctn {
		min-width: 3.5ch;
	}
	.muted {
		color: var(--muted);
		font-size: 0.8rem;
		line-height: 1.5;
		margin: var(--space-3) 0 0;
	}
</style>

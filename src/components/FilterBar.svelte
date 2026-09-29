<script lang="ts">
	import { ALLERGENS, CUISINES, DIETS, MEAL_TYPES } from '$lib/config';

	interface Props {
		cuisine: string;
		meal: string;
		diet: string;
		sort: string;
		query: string;
		allergens: string[];
		t: (key: string) => string;
		onFilter: (key: 'cuisine' | 'meal' | 'diet' | 'sort', value: string) => void;
		onQuery: (value: string) => void;
		onAllergens: (next: string[]) => void;
	}

	let { cuisine, meal, diet, sort, query, allergens, t, onFilter, onQuery, onAllergens }: Props =
		$props();

	const pick = (key: 'cuisine' | 'meal' | 'diet' | 'sort') => (event: Event) =>
		onFilter(key, (event.currentTarget as HTMLSelectElement).value);

	function toggleAllergen(key: string) {
		onAllergens(
			allergens.includes(key) ? allergens.filter((value) => value !== key) : [...allergens, key]
		);
	}

	const activeCount = $derived(
		[cuisine, meal, diet, sort].filter(Boolean).length + (allergens.length > 0 ? 1 : 0)
	);
</script>

<div class="filters" class:filtered={activeCount > 0}>
	<div class="search">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2" />
			<path d="M13.2 13.2 17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		<input
			type="search"
			placeholder={t('search.placeholder')}
			aria-label={t('search.placeholder')}
			value={query}
			oninput={(event) => onQuery((event.currentTarget as HTMLInputElement).value)}
		/>
	</div>

	<select
		class:on={cuisine}
		aria-label={t('filter.cuisine')}
		value={cuisine}
		onchange={pick('cuisine')}
	>
		<option value="">{t('filter.cuisine')} — {t('filter.all')}</option>
		{#each CUISINES as value (value)}
			<!-- Was `value.replace(/_/g, ' ')`, which rendered raw lowercase English
			     slugs in all 10 locales while the sibling selects used t(). -->
			<option {value}>{t(`cuisine.${value}`)}</option>
		{/each}
	</select>

	<select class:on={meal} aria-label={t('filter.meal')} value={meal} onchange={pick('meal')}>
		<option value="">{t('filter.meal')} — {t('filter.all')}</option>
		{#each MEAL_TYPES as value (value)}
			<option {value}>{t(`meal.${value}`)}</option>
		{/each}
	</select>

	<select class:on={diet} aria-label={t('filter.diet')} value={diet} onchange={pick('diet')}>
		<option value="">{t('filter.diet')} — {t('filter.all')}</option>
		{#each DIETS as value (value)}
			<option {value}>{t(`diet.${value}`)}</option>
		{/each}
	</select>

	<select class:on={sort} aria-label={t('filter.sort')} value={sort} onchange={pick('sort')}>
		<option value="">{t('sort.match')}</option>
		<option value="kcal">{t('sort.kcal')}</option>
		<option value="grade">{t('sort.grade')}</option>
		<option value="time">{t('sort.time')}</option>
	</select>

	<details class="allergens">
		<summary class:on={allergens.length > 0}>
			<span class="label">{t('filter.allergens')}</span>
			{#if allergens.length}<span class="count">{allergens.length}</span>{/if}
		</summary>
		<div class="panel">
			{#each ALLERGENS as key (key)}
				<label>
					<input
						type="checkbox"
						checked={allergens.includes(key)}
						onchange={() => toggleAllergen(key)}
					/>
					{t(`allergen.${key}`)}
				</label>
			{/each}
		</div>
	</details>
</div>

<style>
	.filters {
		position: sticky;
		top: 0;
		z-index: 5;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--space-2);
		/* Sticky bars must not clip the content scrolling under them. */
		padding: var(--space-2) 0 var(--space-3);
		background: linear-gradient(var(--bg) 82%, transparent);
		backdrop-filter: blur(6px);
	}
	/* Same reasoning as the tray on the home page: the fade-to-transparent tail
	   only works because what shows through is blurred. Solid --bg instead. */
	@media (prefers-reduced-transparency: reduce) {
		.filters {
			background: var(--bg);
			backdrop-filter: none;
		}
	}
	.search {
		grid-column: 1 / -1;
		position: relative;
		display: flex;
		align-items: center;
	}
	.search svg {
		position: absolute;
		inset-inline-start: 0.7rem;
		width: 1.1rem;
		height: 1.1rem;
		color: var(--muted);
		pointer-events: none;
	}
	.search input {
		width: 100%;
		padding-inline-start: 2.35rem;
	}
	input,
	select {
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-1);
		min-width: 0;
		transition:
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	input:hover,
	select:hover {
		border-color: var(--line-strong);
	}
	/* Active filters are called out so a stale filter can't silently empty the list. */
	select.on {
		border-color: var(--primary);
		color: var(--primary);
		font-weight: 600;
	}

	/* The allergen picker sits in the grid like the selects beside it, but its
	   own content is a panel that must overlay rather than push the bar's
	   height around as boxes get (un)checked. */
	.allergens {
		position: relative;
		min-width: 0;
		/* Fills the row the sort select starts in the 3-column mobile grid, which
		   would otherwise leave one empty cell. */
		grid-column: span 2;
	}
	/* One line, truncated like the selects beside it: a wrapped label (ar runs
	   three lines at 420px) makes this one control taller than its row. */
	.allergens .label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.allergens > summary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-1);
		cursor: pointer;
		list-style: none;
		transition:
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	/* Chrome/Safari draw their own disclosure triangle even with list-style:none. */
	.allergens > summary::-webkit-details-marker {
		display: none;
	}
	.allergens > summary:hover {
		border-color: var(--line-strong);
	}
	.allergens > summary.on {
		border-color: var(--primary);
		color: var(--primary);
		font-weight: 600;
	}
	.allergens .count {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--primary);
		background: color-mix(in srgb, var(--primary) 14%, var(--surface));
		border-radius: var(--radius-pill);
		padding: 0 0.4rem;
		font-variant-numeric: tabular-nums;
	}
	/* `inset-inline-start`, not `left`: in RTL the summary's own start edge is
	   the visual right, and the panel has to open from the same edge the
	   control itself reads from. */
	.panel {
		position: absolute;
		inset-block-start: calc(100% + 0.4rem);
		inset-inline-start: 0;
		z-index: 6;
		display: grid;
		gap: 0.4rem;
		width: max-content;
		max-width: min(16rem, calc(100vw - 2 * var(--space-3)));
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: var(--radius);
		box-shadow: var(--shadow-2);
	}
	.panel label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.9rem;
		font-size: 0.85rem;
		white-space: nowrap;
	}
	/* Undoes the text-field styling `input, select` above gives every input. */
	.panel input {
		all: revert;
		accent-color: var(--primary);
	}

	@media (min-width: 48rem) {
		.filters {
			/* `auto` for the allergen summary: its label + count is the one control
			   that reads as broken when truncated, and it has no option list to peek. */
			grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
		}
		.search,
		.allergens {
			grid-column: auto;
		}
	}
</style>

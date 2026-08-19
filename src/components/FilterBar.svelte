<script lang="ts">
	import { CUISINES, DIETS, MEAL_TYPES } from '$lib/config';

	interface Props {
		cuisine: string;
		meal: string;
		diet: string;
		sort: string;
		query: string;
		t: (key: string) => string;
		onFilter: (key: 'cuisine' | 'meal' | 'diet' | 'sort', value: string) => void;
		onQuery: (value: string) => void;
	}

	let { cuisine, meal, diet, sort, query, t, onFilter, onQuery }: Props = $props();

	const pick = (key: 'cuisine' | 'meal' | 'diet' | 'sort') => (event: Event) =>
		onFilter(key, (event.currentTarget as HTMLSelectElement).value);

	const activeCount = $derived([cuisine, meal, diet, sort].filter(Boolean).length);
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
			<option {value}>{value.replace(/_/g, ' ')}</option>
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
	</select>
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

	@media (min-width: 48rem) {
		.filters {
			grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
		}
		.search {
			grid-column: auto;
		}
	}
</style>

<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import FoodIcon from './FoodIcon.svelte';
	import { ALLERGENS, CUISINES, DIETS, MEAL_TYPES } from '$lib/config';
	import { DIET_SLASHED, cuisineIcon, dietIcon, mealIcon } from '$lib/icons';

	type FilterKey = 'cuisine' | 'meal' | 'diet' | 'sort';

	interface Props {
		cuisine: string;
		meal: string;
		diet: string;
		sort: string;
		query: string;
		allergens: string[];
		t: (key: string) => string;
		onFilter: (key: FilterKey, value: string) => void;
		onQuery: (value: string) => void;
		onAllergens: (next: string[]) => void;
		/** Clears every filter in one go. Optional: without it the bar rewrites
		 *  the URL itself, because calling onFilter once per key would lose all
		 *  but the last change (each call builds on a URL that has not updated yet). */
		onReset?: () => void;
	}

	let {
		cuisine,
		meal,
		diet,
		sort,
		query,
		allergens,
		t,
		onFilter,
		onQuery,
		onAllergens,
		onReset
	}: Props = $props();

	const uid = $props.id();

	// The eight cuisines with the most recipes in the corpus (data-494124df,
	// October 2026); the select still lists all of them.
	const QUICK_CUISINES = [
		'african',
		'american',
		'indian',
		'italian',
		'french',
		'british',
		'middle_eastern',
		'mexican'
	] as const satisfies readonly (typeof CUISINES)[number][];

	const pick = (key: FilterKey) => (event: Event) =>
		onFilter(key, (event.currentTarget as HTMLSelectElement).value);

	function toggleAllergen(key: string) {
		onAllergens(
			allergens.includes(key) ? allergens.filter((value) => value !== key) : [...allergens, key]
		);
	}

	const activeCount = $derived(
		[cuisine, meal, diet, sort].filter(Boolean).length + (allergens.length > 0 ? 1 : 0)
	);

	// Split rather than replace so the number can be set in bold whatever side
	// of it the language puts the words.
	const activeParts = $derived(t('filter.active').split('{n}'));

	// Closed by default so the board stays on the first screen; a link that
	// arrives with filters on opens it, so they are not hidden. After that the
	// user's own toggle (bind:open) wins.
	let open = $state(untrack(() => activeCount > 0));
	let summaryEl = $state<HTMLElement>();
	let resetWidth = $state(0);

	function reset() {
		// The button unmounts once the filters clear; hand focus to the
		// summary rather than letting it drop to <body>.
		summaryEl?.focus();
		if (onReset) return onReset();
		const url = new URL($page.url);
		for (const key of ['cuisine', 'meal', 'diet', 'sort', 'noAllergen']) url.searchParams.delete(key);
		goto(url, { keepFocus: true, noScroll: true, replaceState: true });
	}

	const quickRows = $derived([
		{
			key: 'meal' as const,
			label: t('filter.meal'),
			current: meal,
			items: MEAL_TYPES.map((value) => ({
				value,
				label: t(`meal.${value}`),
				icon: mealIcon(value),
				slashed: false
			}))
		},
		{
			key: 'diet' as const,
			label: t('filter.diet'),
			current: diet,
			items: DIETS.map((value) => ({
				value,
				label: t(`diet.${value}`),
				icon: dietIcon(value),
				slashed: DIET_SLASHED.includes(value)
			}))
		},
		{
			key: 'cuisine' as const,
			label: t('filter.cuisine'),
			current: cuisine,
			items: QUICK_CUISINES.map((value) => ({
				value,
				label: t(`cuisine.${value}`),
				icon: cuisineIcon(value),
				slashed: false
			}))
		}
	]);
</script>

<!-- Rendered twice, shown once: in the sticky bar from 48rem, inside the
     collapsed panel below it. Moving them with CSS alone is impossible (a
     closed <details> hides its content), and choosing in script would shift
     the layout at hydration. The hidden copy is display:none, so it is out of
     the tab order and the accessibility tree. -->
{#snippet fields()}
	<label class="field" class:on={cuisine}>
		<span class="field-label">{t('filter.cuisine')}</span>
		<select value={cuisine} onchange={pick('cuisine')}>
			<option value="">{t('filter.all')}</option>
			{#each CUISINES as value (value)}
				<option {value}>{t(`cuisine.${value}`)}</option>
			{/each}
		</select>
	</label>

	<label class="field" class:on={meal}>
		<span class="field-label">{t('filter.meal')}</span>
		<select value={meal} onchange={pick('meal')}>
			<option value="">{t('filter.all')}</option>
			{#each MEAL_TYPES as value (value)}
				<option {value}>{t(`meal.${value}`)}</option>
			{/each}
		</select>
	</label>

	<label class="field" class:on={diet}>
		<span class="field-label">{t('filter.diet')}</span>
		<select value={diet} onchange={pick('diet')}>
			<option value="">{t('filter.all')}</option>
			{#each DIETS as value (value)}
				<option {value}>{t(`diet.${value}`)}</option>
			{/each}
		</select>
	</label>

	<label class="field" class:on={sort}>
		<span class="field-label">{t('filter.sort')}</span>
		<select value={sort} onchange={pick('sort')}>
			<option value="">{t('sort.match')}</option>
			<option value="kcal">{t('sort.kcal')}</option>
			<option value="grade">{t('sort.grade')}</option>
			<option value="time">{t('sort.time')}</option>
		</select>
	</label>

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
{/snippet}

<!-- Only the search (and, from 48rem, the selects) sticks: pinned chip rows
     would cover a third of a phone. -->
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
	<div class="wide-fields">{@render fields()}</div>
</div>

<!-- Until the button is measured (SSR, first frame), a width that fits the
     English label. -->
<div
	class="quick-wrap"
	style:--reset-w={activeCount === 0 ? '0px' : resetWidth ? `${resetWidth}px` : '8rem'}
>
	<details class="quick chrome" bind:open>
		<summary bind:this={summaryEl}>
			<svg class="chevron" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
				<path
					d="M7.5 5 12.5 10 7.5 15"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			<span class="quick-title">{t('filter.quick')}</span>
			{#if activeCount > 0}
				<span class="active-count">
					<span class="active-words">{activeParts[0]}</span><b>{activeCount}</b><span
						class="active-words">{activeParts.slice(1).join(String(activeCount))}</span
					>
				</span>
			{/if}
		</summary>
		<div class="quick-body">
			<div class="narrow-fields">{@render fields()}</div>
			{#each quickRows as row (row.key)}
				<div class="chip-row" role="group" aria-labelledby="{uid}-{row.key}">
					<span class="row-label" id="{uid}-{row.key}">{row.label}</span>
					<div class="chip-list">
						{#each row.items as item (item.value)}
							<button
								type="button"
								class="fchip"
								aria-pressed={row.current === item.value}
								onclick={() => onFilter(row.key, row.current === item.value ? '' : item.value)}
							>
								<span class="fchip-art" class:slashed={item.slashed}>
									<FoodIcon cp={item.icon} size={24} />
								</span>
								<span class="fchip-label">{item.label}</span>
							</button>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</details>
	<!-- Outside the summary, so a reset needs no opening first and the
	     summary keeps its native toggle semantics. -->
	{#if activeCount > 0}
		<button type="button" class="reset" bind:offsetWidth={resetWidth} onclick={reset}>
			{t('filter.reset')}
		</button>
	{/if}
</div>

<style>
	/* Phones: the search alone, 56px. */
	.filters {
		position: sticky;
		top: 0;
		z-index: 5;
		display: grid;
		align-items: end;
		gap: var(--space-2);
		/* Sticky bars must not clip the content scrolling under them. */
		padding: 0.375rem 0;
		background: linear-gradient(var(--bg) 82%, transparent);
		backdrop-filter: blur(6px);
	}
	.wide-fields {
		display: none;
	}
	.narrow-fields {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-items: end;
		gap: var(--space-2);
		padding-block-end: var(--space-3);
		border-block-end: 1px solid var(--line);
	}
	.narrow-fields .allergens {
		grid-column: 1 / -1;
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
		inset-inline-start: 0.8rem;
		width: 1.15rem;
		height: 1.15rem;
		color: var(--muted);
		pointer-events: none;
	}
	.search input {
		width: 100%;
		padding-inline-start: 2.6rem;
	}
	.search input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	.field {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}
	.field-label,
	.row-label {
		font-family: var(--font-body);
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Scripts without case get nothing from uppercase, and the tracking only
	   breaks up their glyphs. */
	:global(:is(:lang(ar), :lang(pnb), :lang(hi), :lang(bn), :lang(zh), :lang(ja), :lang(ko)))
		:is(.field-label, .row-label) {
		letter-spacing: 0;
		font-size: 0.78rem;
	}
	input,
	select {
		width: 100%;
		min-height: var(--tap);
		padding: 0.45rem 0.7rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius);
		background-color: var(--surface);
		color: var(--ink);
		/* 16px: below it iOS zooms the page on focus. */
		font-size: 1rem;
		box-shadow:
			inset 0 1px 2px var(--lo-2),
			0 1px 0 var(--hi);
		min-width: 0;
		transition: border-color var(--dur-fast) ease;
	}
	input:hover,
	select:hover {
		border-color: var(--muted);
	}
	/* An active filter is called out by weight and a doubled border, not colour
	   alone, so a stale filter can't silently empty the list. */
	.field.on select {
		border-color: var(--primary);
		box-shadow: inset 0 0 0 1px var(--primary);
		font-weight: 700;
	}
	.field.on .field-label {
		color: var(--primary);
	}

	/* The allergen picker sits in the grid like the selects beside it, but its
	   own content is a panel that must overlay rather than push the bar's
	   height around as boxes get (un)checked. */
	.allergens {
		position: relative;
		min-width: 0;
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
		min-height: var(--tap);
		padding: 0.45rem 0.9rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-btn);
		background: var(--sheen);
		color: var(--ink);
		font-weight: 600;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		cursor: pointer;
		list-style: none;
		transition: border-color var(--dur-fast) ease;
	}
	/* Chrome/Safari draw their own disclosure triangle even with list-style:none. */
	.allergens > summary::-webkit-details-marker {
		display: none;
	}
	.allergens > summary:hover {
		border-color: var(--primary);
	}
	.allergens > summary.on {
		border-color: var(--primary);
		box-shadow: inset 0 0 0 1px var(--primary);
		font-weight: 700;
	}
	.allergens .count {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--on-primary);
		background: var(--primary);
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

	.quick-wrap {
		position: relative;
		margin-block-end: var(--space-4);
	}
	.quick > summary {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--tap);
		/* Room for the reset button laid over the end of this row. */
		padding-inline: var(--space-3) calc(var(--reset-w) + var(--space-3));
		border-radius: inherit;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}
	.quick > summary::-webkit-details-marker {
		display: none;
	}
	.quick > summary:hover .chevron {
		color: var(--primary);
	}
	.chevron {
		flex: none;
		width: 1.1rem;
		height: 1.1rem;
		color: var(--muted);
		transition: transform var(--dur) var(--ease-out);
	}
	:global([dir='rtl']) .chevron {
		transform: scaleX(-1);
	}
	.quick[open] .chevron {
		transform: rotate(90deg);
	}
	:global([dir='rtl']) .quick[open] .chevron {
		transform: scaleX(-1) rotate(90deg);
	}
	.quick-title {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.active-count {
		flex: none;
		padding: 0.1rem 0.55rem;
		border: 1px solid color-mix(in srgb, var(--primary) 45%, transparent);
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--primary) 12%, var(--surface));
		color: var(--ink);
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.active-count b {
		font-variant-numeric: tabular-nums;
	}
	/* Phones keep the number and give the words to screen readers only: with
	   the reset button on the same row, the longer languages squeezed the
	   panel's own title down to one letter. */
	@media (max-width: 29.99rem) {
		.active-words {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
	}
	.quick-body {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3);
		border-block-start: 1px solid var(--line);
	}
	.reset {
		position: absolute;
		inset-block-start: 1px;
		inset-inline-end: var(--space-1);
		min-height: var(--tap);
		padding: 0 var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-btn);
		background: transparent;
		color: var(--primary);
		font-size: 0.875rem;
		font-weight: 700;
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}
	.reset:hover {
		border-color: var(--line-strong);
		background: var(--surface);
	}
	.chip-row {
		display: grid;
		gap: var(--space-1);
		align-items: start;
	}
	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.fchip {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: var(--tap);
		max-width: 100%;
		padding-inline: 0.45rem 0.65rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-chip);
		background: var(--sheen);
		color: var(--ink);
		font-size: 0.9rem;
		font-weight: 600;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		transition:
			transform var(--dur) var(--ease-out),
			border-color var(--dur-fast) ease;
	}
	.fchip:hover {
		border-color: var(--primary);
	}
	.fchip:active {
		transform: scale(0.96);
	}
	/* Pressed reads as a switch pushed in: tinted, inset, heavier type and a lit
	   lamp, so the state never rests on the border colour alone. */
	.fchip[aria-pressed='true'] {
		background: color-mix(in srgb, var(--primary) 13%, var(--surface));
		border-color: var(--primary);
		box-shadow: var(--shadow-press);
		font-weight: 750;
	}
	/* Indicator lamp. */
	.fchip::after {
		content: '';
		flex: none;
		width: 0.45rem;
		height: 0.45rem;
		margin-inline-start: 0.1rem;
		border-radius: 50%;
		background: var(--line-strong);
		box-shadow: inset 0 1px 1px rgb(0 0 0 / 30%);
	}
	.fchip[aria-pressed='true']::after {
		background: var(--accent);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent),
			0 0 8px var(--accent);
	}
	.fchip-art {
		position: relative;
		flex: none;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0.15rem;
		border-radius: 50%;
		/* Sunken, not --surface: Noto's white plate and glass vanish on white. */
		background: var(--surface-sunken);
		box-shadow: inset 0 0 0 1px var(--line);
	}
	/* "Without X": a bar across the glyph, in the theme's ink so it reads on
	   the colour artwork. A border, not a background, so forced colours keep it. */
	.fchip-art.slashed::after {
		content: '';
		position: absolute;
		inset-inline: -0.05rem;
		top: 50%;
		border-top: 2.5px solid var(--primary);
		border-radius: 2px;
		box-shadow: 0 0 0 1px var(--surface);
		transform: rotate(45deg);
	}
	.fchip-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Tablets: the selects join the sticky bar, on a row of their own. Sharing
	   one with the search at 768px cut their values to four letters. */
	@media (min-width: 48rem) {
		.filters {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			padding: var(--space-2) 0 var(--space-3);
		}
		.wide-fields {
			display: contents;
		}
		.narrow-fields {
			display: none;
		}
		.search {
			grid-column: span 3;
		}
		.wide-fields .allergens {
			grid-row: 1;
			grid-column: 4;
		}
		.chip-row {
			grid-template-columns: 6rem minmax(0, 1fr);
		}
		.chip-row .row-label {
			line-height: var(--tap);
		}
	}

	/* One row. Keep its height (5rem) in step with the results pane's sticky
	   `top: 5.5rem` on the home page. */
	@media (min-width: 64rem) {
		.filters {
			/* `auto` for the allergen summary: its label + count is the one control
			   that reads as broken when truncated, and it has no option list to peek. */
			grid-template-columns: minmax(12rem, 2fr) repeat(4, minmax(0, 1fr)) auto;
		}
		.search,
		.wide-fields .allergens {
			grid-row: auto;
			grid-column: auto;
		}
	}

	@media (forced-colors: active) {
		/* box-shadow is dropped here, which took the doubled border with it. */
		.field.on select,
		.allergens > summary.on {
			border-width: 3px;
		}
		.fchip[aria-pressed='true'] {
			border: 3px solid Highlight;
		}
		.fchip[aria-pressed='true']::after {
			background: Highlight;
			forced-color-adjust: none;
		}
	}
</style>

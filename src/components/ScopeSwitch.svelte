<script lang="ts">
	import { onMount } from 'svelte';
	import { seasonPrefs } from '$lib/seasonal/prefs.svelte';
	import type { SeasonScope } from '$lib/seasonal/prefs';

	interface Props {
		t: (key: string) => string;
	}

	let { t }: Props = $props();

	const uid = $props.id();
	const SCOPES: readonly SeasonScope[] = ['local', 'world'];

	onMount(() => seasonPrefs.hydrate());
</script>

<fieldset class="scope">
	<legend class="sr-only">{t('seasonal.scope.calendar')}</legend>
	{#each SCOPES as scope (scope)}
		<label>
			<input
				type="radio"
				name="{uid}-scope"
				value={scope}
				checked={seasonPrefs.scope === scope}
				onchange={() => (seasonPrefs.scope = scope)}
			/>
			<span>{t(`seasonal.scope.${scope}`)}</span>
		</label>
	{/each}
</fieldset>

<style>
	.scope {
		display: inline-flex;
		flex: none;
		margin: 0;
		padding: 2px;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-sunken);
		box-shadow: inset 0 1px 2px var(--lo);
	}
	label {
		position: relative;
		display: grid;
		place-items: center;
		min-height: var(--tap);
		padding: 0 0.85rem;
		border-radius: var(--radius-pill);
		color: var(--muted);
		font-size: 0.82rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		transition: color var(--dur-fast) ease;
	}
	label:hover {
		color: var(--ink);
	}
	input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		opacity: 0;
		cursor: pointer;
	}
	label:has(input:checked) {
		background: var(--surface);
		color: var(--ink);
		font-weight: 750;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 3px var(--lo-2);
	}
	label:has(input:focus-visible) {
		outline: 3px solid var(--focus);
		outline-offset: 1px;
	}
	@media (forced-colors: active) {
		label:has(input:checked) {
			forced-color-adjust: none;
			background: Highlight;
			color: HighlightText;
		}
	}
</style>

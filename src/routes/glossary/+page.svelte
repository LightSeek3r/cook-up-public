<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import SeoHead from '$components/SeoHead.svelte';
	import { t as translator } from '$lib/i18n';
	import { MAX_QUERY } from '$lib/search';
	import { CATEGORY_DATA_CAT } from '$lib/glossary/categories';
	import { buildIndex, search } from '$lib/glossary/search';
	import { CATEGORY_IDS, type CategoryId } from '$lib/glossary/types';

	let { data } = $props();

	const lang = $derived(data.lang);
	const t = $derived(translator(lang));

	// Derived from `data.entries`, so it is rebuilt exactly when the language (and
	// with it the entries) changes, and never on a keystroke.
	const index = $derived(buildIndex(data.entries));
	const byId = $derived(new Map(data.entries.map((entry) => [entry.id, entry])));

	const parseCat = (value: string | null): CategoryId | null =>
		(CATEGORY_IDS as readonly string[]).includes(value ?? '') ? (value as CategoryId) : null;

	const urlQuery = $derived($page.url.searchParams.get('q') ?? '');
	const cat = $derived(parseCat($page.url.searchParams.get('cat')));

	// Local state rather than read off the URL so typing stays instant; the URL is
	// written from the debounced value, one navigation per pause.
	let query = $state($page.url.searchParams.get('q') ?? '');
	let debouncedQuery = $state($page.url.searchParams.get('q') ?? '');
	// The last ?q value this page either wrote or adopted, so an echo of its own
	// navigation is never mistaken for an external change.
	let syncedQuery = $page.url.searchParams.get('q') ?? '';

	const hits = $derived(
		search(index, query.trim(), { cat: cat ?? undefined }).flatMap(({ id }) => {
			const entry = byId.get(id);
			return entry ? [entry] : [];
		})
	);

	const countText = $derived(t('glossary.count').replace('{n}', String(hits.length)));

	function hrefFor(next: CategoryId | null) {
		const params = new URLSearchParams({ lang });
		if (next) params.set('cat', next);
		const q = query.trim();
		if (q) params.set('q', q);
		return `/glossary?${params}`;
	}

	const clearHref = $derived(
		`/glossary?${new URLSearchParams(cat ? { lang, cat } : { lang })}`
	);

	function onsubmit(event: SubmitEvent) {
		// With JS the list is already filtered; skip the full-page GET and just
		// flush the pending debounce so the URL is shareable immediately.
		event.preventDefault();
		debouncedQuery = query;
	}

	// Typing must not navigate once per keystroke.
	$effect(() => {
		const value = query;
		const timer = setTimeout(() => (debouncedQuery = value), 220);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		const value = debouncedQuery.trim();
		if (value === syncedQuery) return;
		syncedQuery = value;
		const url = new URL(untrack(() => $page.url));
		if (value) url.searchParams.set('q', value);
		else url.searchParams.delete('q');
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	});

	// Back/forward, the clear link and chip links change ?q without going through
	// the input; pull that into the field.
	$effect(() => {
		const fromUrl = urlQuery;
		if (fromUrl === syncedQuery) return;
		syncedQuery = fromUrl;
		if (fromUrl !== untrack(() => query).trim()) {
			query = fromUrl;
			debouncedQuery = fromUrl;
		}
	});
</script>

<SeoHead
	title="{t('glossary.heading')} — {t('app.title')}"
	description={t('glossary.metaDescription')}
	url={$page.url}
	{lang}
/>

<header class="intro">
	<h1>{t('glossary.heading')}</h1>
	<p class="muted lede">{t('glossary.intro')}</p>
</header>

<form class="search no-print" method="GET" action="/glossary" role="search" {onsubmit}>
	<input type="hidden" name="lang" value={lang} />
	{#if cat}<input type="hidden" name="cat" value={cat} />{/if}
	<label class="sr-only" for="glossary-q">{t('glossary.searchLabel')}</label>
	<div class="field">
		<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
			<circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2" />
			<path d="M13.2 13.2 17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		<input
			id="glossary-q"
			type="search"
			name="q"
			maxlength={MAX_QUERY}
			autocomplete="off"
			placeholder={t('glossary.searchPlaceholder')}
			bind:value={query}
		/>
	</div>
	<button type="submit" class="submit">{t('glossary.searchSubmit')}</button>
</form>

<nav class="chips no-print" aria-label={t('glossary.filterLabel')}>
	<ul>
		<li>
			<a
				class="chip"
				href={hrefFor(null)}
				aria-current={cat === null ? 'true' : undefined}
				data-sveltekit-noscroll
				data-sveltekit-replacestate
			>
				{t('glossary.filterAll')}
			</a>
		</li>
		{#each CATEGORY_IDS as id (id)}
			<li>
				<a
					class="chip"
					data-cat={CATEGORY_DATA_CAT[id]}
					href={hrefFor(id)}
					aria-current={cat === id ? 'true' : undefined}
					data-sveltekit-noscroll
					data-sveltekit-replacestate
				>
					{t(`glossary.cat.${id}`)}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<p class="count muted" aria-live="polite">{countText}</p>

{#if hits.length === 0}
	<div class="card empty">
		<p>{t('glossary.empty')}</p>
		<a class="clear" href={clearHref}>{t('glossary.clear')}</a>
	</div>
{:else}
	<ul class="grid">
		{#each hits as entry (entry.id)}
			<li>
				<a
					class="card entry"
					data-cat={CATEGORY_DATA_CAT[entry.category]}
					href="/glossary/{entry.id}?lang={lang}"
				>
					<h2 class="name">{entry.text.name}</h2>
					{#if lang !== 'en' && entry.en !== entry.text.name}
						<span class="en-name" lang="en" dir="ltr">{entry.en}</span>
					{/if}
					<p class="short">{entry.text.short}</p>
					<span class="tags">
						<span class="tag">{t(`glossary.cat.${entry.category}`)}</span>
						{#if entry.diagram}
							<span class="tag badge">
								<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
									<rect
										x="3"
										y="3.5"
										width="14"
										height="13"
										rx="2"
										fill="none"
										stroke="currentColor"
										stroke-width="1.6"
									/>
									<path
										d="M6.5 12.5 9 9.5l2 2 2.5-3.5"
										fill="none"
										stroke="currentColor"
										stroke-width="1.6"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								{t('glossary.diagramBadge')}
							</span>
						{/if}
					</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.intro {
		margin: var(--space-3) 0 var(--space-3);
	}
	.lede {
		margin: var(--space-1) 0 0;
		max-width: 60ch;
		font-size: 1rem;
	}

	.search {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-3);
	}
	.field {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1 1 16rem;
	}
	.field svg {
		position: absolute;
		inset-inline-start: 0.7rem;
		width: 1.1rem;
		height: 1.1rem;
		color: var(--muted);
		pointer-events: none;
	}
	.field input {
		width: 100%;
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
		padding-inline-start: 2.35rem;
		border: 1px solid var(--line);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--ink);
		box-shadow: var(--shadow-1);
		transition: border-color var(--dur-fast) ease;
	}
	.field input:hover {
		border-color: var(--line-strong);
	}
	.submit {
		min-height: 2.75rem;
		min-width: 2.75rem;
		padding: 0 1.1rem;
		border: none;
		border-radius: var(--radius-pill);
		background: var(--primary);
		color: var(--on-primary);
		font-weight: 700;
		box-shadow: var(--shadow-2);
	}

	.chips ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		padding: 0.3rem 0.9rem;
		background: var(--cat-tint, var(--surface));
		color: var(--cat-ink, var(--ink));
		border: 1px solid var(--cat-line, var(--line-strong));
		border-radius: var(--radius-pill);
		font-size: 0.85rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			border-color var(--dur-fast) ease,
			box-shadow var(--dur-fast) ease;
	}
	.chip:hover {
		border-color: var(--cat-ink, var(--primary));
	}
	/* Selection is a heavier ring plus weight, not colour alone, so it survives
	   greyscale and forced-colors. */
	.chip[aria-current='true'] {
		border-color: var(--cat-ink, var(--primary));
		box-shadow: inset 0 0 0 1px var(--cat-ink, var(--primary));
		font-weight: 800;
	}
	@media (forced-colors: active) {
		.chip[aria-current='true'] {
			background: Highlight;
			color: HighlightText;
			border-color: Highlight;
			forced-color-adjust: none;
		}
	}

	.count {
		margin: var(--space-3) 0 var(--space-2);
		font-variant-numeric: tabular-nums;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.entry {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		height: 100%;
		border-inline-start: 4px solid var(--cat-ink, var(--line-strong));
		color: var(--ink);
		text-decoration: none;
		transition:
			transform var(--dur) var(--ease-spring),
			box-shadow var(--dur) ease,
			border-color var(--dur-fast) ease;
	}
	.entry:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-2);
		border-color: var(--line-strong);
		border-inline-start-color: var(--cat-ink, var(--line-strong));
	}
	.name {
		margin: 0;
		font-size: 1.05rem;
	}
	.en-name {
		color: var(--muted);
		font-size: 0.8rem;
	}
	.short {
		margin: 0;
		font-size: 0.9rem;
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-block-start: auto;
		padding-block-start: var(--space-1);
	}
	.tag {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.1rem 0.6rem;
		background: var(--cat-tint, var(--surface-sunken));
		color: var(--cat-ink, var(--muted));
		border-radius: var(--radius-pill);
		font-size: 0.75rem;
		font-weight: 700;
	}
	.badge {
		background: none;
		color: var(--muted);
		border: 1px solid var(--line-strong);
	}
	.badge svg {
		width: 0.9rem;
		height: 0.9rem;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
	}
	.empty p {
		margin: 0;
	}
	.clear {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		font-weight: 600;
	}
</style>

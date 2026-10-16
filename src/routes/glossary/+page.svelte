<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import SeoHead from '$components/SeoHead.svelte';
	import FoodIcon from '$components/FoodIcon.svelte';
	import { FALLBACK_EMOJI } from '$lib/emoji';
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
	<div class="empty">
		<span class="empty-art"><FoodIcon cp={FALLBACK_EMOJI} size={56} /></span>
		<p class="empty-title">{t('glossary.empty')}</p>
		<a class="chrome-control clear" href={clearHref}>{t('glossary.clear')}</a>
	</div>
{:else}
	<ul class="grid">
		{#each hits as entry (entry.id)}
			<li>
				<a
					class="entry"
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
		margin: var(--space-3) 0;
	}
	.intro h1 {
		font-size: clamp(1.8rem, 1.3rem + 1.8vw, 2.5rem);
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
		inset-inline-start: 0.85rem;
		width: 1.15rem;
		height: 1.15rem;
		color: var(--muted);
		pointer-events: none;
	}
	/* A recessed well in the worktop, the same as the home search. */
	.field input {
		width: 100%;
		min-height: var(--tap);
		padding: 0.45rem 0.85rem;
		padding-inline-start: 2.6rem;
		border: 1px solid var(--line-strong);
		border-radius: var(--radius-btn);
		background: var(--surface);
		color: var(--ink);
		/* 16px: below it iOS zooms the page on focus. */
		font-size: 1rem;
		box-shadow:
			inset 0 1px 2px var(--lo-2),
			0 1px 0 var(--hi);
		transition: border-color var(--dur-fast) ease;
	}
	.field input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	.field input:hover {
		border-color: var(--muted);
	}
	/* Polished copper: a light/shade sheen over the fill, kept off the middle
	   band where the label sits so --on-primary keeps its contrast. */
	.submit {
		min-height: var(--tap);
		min-width: var(--tap);
		padding: 0 1.2rem;
		border: 1px solid color-mix(in srgb, var(--primary) 75%, black);
		border-radius: var(--radius-btn);
		background:
			linear-gradient(180deg, rgb(255 255 255 / 22%), transparent 34% 66%, rgb(0 0 0 / 14%)),
			var(--primary);
		color: var(--on-primary);
		font-weight: 700;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 30%),
			0 8px 18px -12px var(--primary);
		transition: transform var(--dur) var(--ease-out);
	}
	.submit:active {
		transform: translateY(1px);
	}

	/* Category switches, dressed like the home page's quick filters: steel
	   face, an indicator lamp, pressed in when current. The category's own ink
	   runs down the start edge, the same stripe as its cards below. */
	.chips ul {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-height: var(--tap);
		padding-inline: 0.7rem 0.65rem;
		border: 1px solid var(--line-strong);
		border-inline-start: 3px solid var(--cat-ink, var(--line-strong));
		border-radius: var(--radius-chip);
		background: var(--sheen);
		color: var(--ink);
		font-size: 0.88rem;
		font-weight: 600;
		text-decoration: none;
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 1px var(--lo-2);
		transition:
			transform var(--dur) var(--ease-out),
			border-color var(--dur-fast) ease;
	}
	.chip:hover {
		border-color: var(--primary);
		border-inline-start-color: var(--cat-ink, var(--primary));
	}
	.chip:active {
		transform: scale(0.96);
	}
	.chip::after {
		content: '';
		flex: none;
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--line-strong);
		box-shadow: inset 0 1px 1px rgb(0 0 0 / 30%);
	}
	/* Current is a pushed-in switch: tint, inset, heavier type and a lit lamp,
	   never the border colour alone. */
	.chip[aria-current='true'] {
		background: color-mix(in srgb, var(--primary) 13%, var(--surface));
		border-color: var(--primary);
		border-inline-start-color: var(--cat-ink, var(--primary));
		box-shadow: var(--shadow-press);
		font-weight: 750;
	}
	.chip[aria-current='true']::after {
		background: var(--accent);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent),
			0 0 8px var(--accent);
	}
	@media (forced-colors: active) {
		.chip {
			background: ButtonFace;
		}
		.chip::after {
			border: 1px solid CanvasText;
		}
		.chip[aria-current='true'] {
			background: Highlight;
			color: HighlightText;
			border-color: Highlight;
			forced-color-adjust: none;
		}
		.chip[aria-current='true']::after {
			background: HighlightText;
		}
	}

	.count {
		margin: var(--space-3) 0 var(--space-2);
		font-variant-numeric: tabular-nums;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr));
		gap: var(--space-3);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	/* A raised sheet with the category's ink down its start edge. */
	.entry {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		height: 100%;
		padding: var(--space-3) var(--space-4);
		background: var(--surface);
		border: 1px solid var(--line-strong);
		border-inline-start: 4px solid var(--cat-ink, var(--line-strong));
		border-radius: var(--radius-card);
		box-shadow:
			inset 0 1px 0 var(--hi),
			0 1px 0 var(--lo),
			0 10px 20px -16px var(--lo-2);
		color: var(--ink);
		text-decoration: none;
		transition:
			transform var(--dur) var(--ease-out),
			box-shadow var(--dur) ease;
	}
	.entry:hover {
		transform: translateY(-2px);
		box-shadow: var(--shadow-2);
	}
	.entry:hover .name {
		color: var(--primary);
	}
	.name {
		margin: 0;
		font-size: 1.15rem;
		overflow-wrap: anywhere;
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
		display: grid;
		justify-items: center;
		gap: var(--space-2);
		padding: var(--space-5) var(--space-4);
		border: 1.5px dashed var(--line-strong);
		border-radius: var(--radius-card);
		text-align: center;
	}
	.empty-art {
		display: grid;
		place-items: center;
		width: 4rem;
		height: 4rem;
		padding: 0.7rem;
		border-radius: 50%;
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--line-strong),
			0 1px 0 var(--hi);
	}
	.empty-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
	}
	.clear {
		padding-inline: 1rem;
		font-size: 0.88rem;
		font-weight: 700;
		text-decoration: none;
	}
</style>

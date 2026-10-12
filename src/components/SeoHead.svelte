<script lang="ts">
	import { DEFAULT_LANG, SUPPORTED_LANGS, type Lang } from '$lib/config';

	interface Props {
		title: string;
		description: string;
		url: URL;
		lang: Lang;
		type?: 'website' | 'article';
		/** Pages with no crawlable content of their own (favorites live in localStorage, errors). */
		noindex?: boolean;
	}

	let { title, description, url, lang, type = 'website', noindex = false }: Props = $props();

	// og:locale wants underscore-joined IETF-ish tags, not our bare ISO codes;
	// only en/fr/ar have a real regional convention worth being specific about,
	// everything else is fine as a bare language code doubled for the country part.
	const OG_LOCALE: Record<Lang, string> = {
		en: 'en_US',
		es: 'es_ES',
		fr: 'fr_FR',
		de: 'de_DE',
		ar: 'ar_AR',
		hi: 'hi_IN',
		zh: 'zh_CN',
		ja: 'ja_JP',
		ko: 'ko_KR',
		vi: 'vi_VN',
		pt: 'pt_BR', // Brazil is the larger speaker base than pt_PT
		it: 'it_IT',
		bn: 'bn_BD',
		ru: 'ru_RU',
		pnb: 'pnb_PK',
		jv: 'jv_ID'
	};

	// Only `lang` survives into the canonical: it selects a different document
	// (translated text), while ?have, ?q, ?cat and the rest only filter one, and a
	// canonical per filter combination would tell crawlers each is its own page.
	// English keeps the bare URL, which is also the x-default.
	const hrefFor = (code: Lang) =>
		`${url.origin}${url.pathname}${code === DEFAULT_LANG ? '' : `?lang=${code}`}`;

	// hreflang wants ISO 639-1 where one exists: `pnb` has none, so it goes out as
	// Punjabi in Arabic script; `zh` names the script it is actually written in.
	const HREFLANG: Partial<Record<Lang, string>> = { zh: 'zh-Hans', pnb: 'pa-Arab' };

	const canonical = $derived(hrefFor(lang));
	const image = $derived(`${url.origin}/og-image.png`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex" />
	{:else}
		<link rel="canonical" href={canonical} />
		{#each SUPPORTED_LANGS as code (code)}
			<link rel="alternate" hreflang={HREFLANG[code] ?? code} href={hrefFor(code)} />
		{/each}
		<link rel="alternate" hreflang="x-default" href={hrefFor(DEFAULT_LANG)} />
	{/if}

	<meta property="og:type" content={type} />
	<meta property="og:site_name" content="Cook Up" />
	<meta property="og:locale" content={OG_LOCALE[lang]} />
	<meta property="og:url" content={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
</svelte:head>

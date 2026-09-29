<script lang="ts">
	import type { Lang } from '$lib/config';

	interface Props {
		title: string;
		description: string;
		url: URL;
		lang: Lang;
		type?: 'website' | 'article';
	}

	let { title, description, url, lang, type = 'website' }: Props = $props();

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

	// Canonical/og:url drop query params (?lang=, ?have=…): those select a
	// *variant* of the page, not a distinct resource, and a canonical URL that
	// changes with every filter would tell crawlers every combination is a
	// separate page.
	const canonical = $derived(`${url.origin}${url.pathname}`);
	const image = $derived(`${url.origin}/og-image.png`);
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

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

import { error } from '@sveltejs/kit';
import { ALL_YEAR, VIEW_COUNT, WORLD_VIEW, maskOf } from '$lib/data/seasons.js';
import { vocabOrNull } from '$lib/data/core.js';
import { corpusFor } from '$lib/server/data';
import { resolveLang } from '$lib/i18n';
import { parseMonthParam, type SeasonPageItem } from '$lib/seasonal/ui';
import type { IngredientCategory } from '$lib/config';
import type { PageServerLoad } from './$types';

/**
 * Every ingredient some calendar gives a season (staples aside, as on the
 * board), with the world view's mask. The server renders the world, the one
 * view that does not depend on the reader, for the month in the URL, so this
 * page is a pure function of its URL like every other; the browser then
 * switches to the reader's own climate (seasons.json) once hydrated. No
 * clock is read here.
 */
export const load: PageServerLoad = async ({ params, url, platform }) => {
	const month = parseMonthParam(params.month);
	if (month === null) error(404, 'month not found');
	const lang = resolveLang(url.searchParams.get('lang'));

	const corpus = await corpusFor(platform, lang, { seasons: true });
	const seasons = corpus.seasons();
	const core = corpus.core;
	const items: SeasonPageItem[] = [];
	if (seasons) {
		for (let g = 0; g < core.ingredients; g++) {
			if (core.isStaple[g]) continue;
			let seasonal = false;
			for (let v = 0; v < VIEW_COUNT && !seasonal; v++) seasonal = maskOf(seasons, g, v) !== ALL_YEAR;
			if (!seasonal) continue;
			items.push({
				id: g + 1,
				name: corpus.name(g, lang),
				canonical_key: core.key(g),
				category: vocabOrNull(core.vocab.category, core.category[g]) as IngredientCategory,
				world: maskOf(seasons, g, WORLD_VIEW)
			});
		}
	}

	return { lang, month, items };
};

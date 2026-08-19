import { json } from '@sveltejs/kit';
import { parseIds, requireDb } from '$lib/db';
import { matchRecipes } from '$lib/match';
import { resolveLang } from '$lib/i18n';
import { CUISINES, DIETS, MEAL_TYPES } from '$lib/config';
import type { RequestHandler } from './$types';

/** Whitelists a filter value; unknown values are dropped rather than passed through. */
const oneOf = <T extends string>(allowed: readonly T[], value: string | null): T | undefined =>
	value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export const GET: RequestHandler = async ({ url, platform }) => {
	const db = requireDb(platform);

	const have = parseIds(url.searchParams.get('have'));
	if (have.length === 0) return json({ results: [] });

	const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0);

	const data = await matchRecipes(db, {
		have,
		lang: resolveLang(url.searchParams.get('lang')),
		cuisine: oneOf(CUISINES, url.searchParams.get('cuisine')),
		mealType: oneOf(MEAL_TYPES, url.searchParams.get('meal')),
		diet: oneOf(DIETS, url.searchParams.get('diet')),
		excludeAllergens: parseIds(url.searchParams.get('noAllergen')),
		sort: oneOf(['kcal', 'grade'] as const, url.searchParams.get('sort')),
		offset
	});

	return json(data);
};

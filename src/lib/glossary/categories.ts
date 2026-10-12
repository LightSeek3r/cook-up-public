import type { CategoryId } from './types';

/** Reuses the ingredient [data-cat] palettes already themed (and contrast-gated) in app.css. */
export const CATEGORY_DATA_CAT: Record<CategoryId, string> = {
	'knife-cuts': 'vegetable',
	'dry-heat': 'spice',
	'moist-heat': 'dairy',
	'prep-mixing': 'legume',
	'sauces-emulsions': 'fruit',
	'dough-bread': 'grain',
	'pastry-sweets': 'nut',
	modernist: 'other',
	preservation: 'fruit',
	fermentation: 'legume',
	'meat-fish': 'protein'
};

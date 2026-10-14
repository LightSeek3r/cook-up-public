// Static data artefacts (pipeline/09_build_artefacts.mjs): decoders and the
// environment-neutral query code shared by the Worker and the browser. Plain
// JS with JSDoc types so the pipeline and parity tools can run it in Node
// without the `$lib` alias or a TS loader.

export { decodeCore, CORE_FORMAT, NULL_INT } from './core.js';
export { loadCorpus } from './corpus.js';
export { matchCore, matchResponse, resolveKeys, slackFor, MATCH_PAGE_SIZE, MISSING_NAMES_SEP } from './match.js';
export {
	buildMosaic,
	normaliseQuery,
	recipeHit,
	recipesByIds,
	searchIngredients,
	searchTitles,
	INGREDIENT_HIT_LIMIT,
	MIN_FTS_LENGTH,
	RECIPE_HIT_LIMIT
} from './search.js';
export { nameForKey, recipePage } from './recipe.js';
export { compareBinary, ftsFold, likeFold, trigramMatch } from './text.js';

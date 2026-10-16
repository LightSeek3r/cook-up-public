import type { ALLERGENS, CUISINES, DIETS, MEAL_TYPES } from '$lib/config';
import { FALLBACK_EMOJI, type EmojiKey } from '$lib/emoji';

type Cuisine = (typeof CUISINES)[number];
type MealType = (typeof MEAL_TYPES)[number];
type Diet = (typeof DIETS)[number];
type Allergen = (typeof ALLERGENS)[number];

export const MEAL_ICON: Record<MealType, EmojiKey> = {
	breakfast: '1f373', // egg in a pan
	lunch: '1f96a', // sandwich
	dinner: '1f37d', // plate with cutlery
	snack: '1f37f', // popcorn
	dessert: '1f9c1', // cupcake
	side: '1f957' // green salad
};

export const DIET_ICON: Record<Diet, EmojiKey> = {
	vegan: '1f331', // seedling
	vegetarian: '1f955', // carrot
	pescatarian: '1f41f', // fish
	gluten_free: '1f33e', // sheaf, struck through by the UI
	dairy_free: '1f95b' // glass of milk, struck through by the UI
};

/** Diets drawn as "without X": the UI lays a diagonal slash over the glyph. */
export const DIET_SLASHED: readonly Diet[] = ['gluten_free', 'dairy_free'];

/**
 * One recognisable dish per cuisine, never a flag or a person. Shared glyphs
 * are deliberate where the dish is shared or Noto has nothing closer.
 */
export const CUISINE_ICON: Record<Cuisine, EmojiKey> = {
	african: '1f372', // stews (jollof, groundnut, tagine); shared with moroccan
	albanian: '1f967', // byrek; shared with bulgarian banitsa, the same Balkan filo pie
	american: '1f354', // hamburger
	australian: '1f36a', // Anzac biscuit
	austrian: '1f370', // Sachertorte
	belgian: '1f9c7', // waffle
	brazilian: '1fad8', // feijoada
	british: '1f35f', // fish and chips
	bulgarian: '1f967', // banitsa
	canadian: '1f95e', // pancakes with maple syrup
	caribbean: '1f357', // jerk chicken
	chinese: '1f95f', // dumpling
	colombian: '1fad3', // arepa
	danish: '1f950', // wienerbrød, the pastry English calls a Danish
	dutch: '1f9c0', // Gouda, Edam
	filipino: '1f36e', // leche flan
	finnish: '1f35e', // rye bread
	french: '1f956', // baguette
	german: '1f968', // pretzel
	greek: '1f957', // horiatiki salad
	hungarian: '1f336', // paprika, the base of goulash and paprikash
	indian: '1f35b', // curry and rice
	indonesian: '1f362', // satay; shared with malaysian, the same skewer
	irish: '1f954', // potato
	italian: '1f355', // pizza
	japanese: '1f363', // sushi
	korean: '1f35a', // bap: the rice bowl at the centre of the meal, bibimbap
	malaysian: '1f362', // satay
	mexican: '1f32e', // taco
	middle_eastern: '1f9c6', // falafel
	moroccan: '1f372', // tagine, a slow stew (Noto has no tagine)
	new_zealand: '1f95d', // kiwifruit
	norwegian: '1f41f', // salmon and cod; shared with swedish, Nordic fish cookery
	peruvian: '1f33d', // Andean corn: choclo, chicha morada
	polish: '1f96f', // obwarzanek, the Kraków ring the bagel descends from
	romanian: '1f96c', // sarmale, cabbage rolls
	russian: '1f95e', // blini; shared with canadian pancakes
	spanish: '1f958', // paella, which is what Noto's shallow pan shows
	swedish: '1f41f', // gravlax and herring
	thai: '1f35c', // noodle soup (tom yum, khao soi)
	turkish: '1f959', // döner in flatbread
	venezuelan: '1fad4', // hallaca, a tamale-like parcel
	vietnamese: '1f96a' // bánh mì
};

export const ALLERGEN_ICON: Record<Allergen, EmojiKey> = {
	gluten: '1f33e',
	dairy: '1f95b',
	nut: '1f330',
	peanut: '1f95c',
	egg: '1f95a',
	soy: '1fad8',
	fish: '1f41f',
	shellfish: '1f990',
	// No sesame emoji; Noto's bagel is covered in sesame seeds, which reads
	// better than a generic seed jar and cannot be mistaken for the gluten sheaf.
	sesame: '1f96f'
};

function lookup<K extends string>(table: Record<K, EmojiKey>, slug: string): EmojiKey {
	return Object.hasOwn(table, slug) ? (table as Record<string, EmojiKey>)[slug] : FALLBACK_EMOJI;
}

export const mealIcon = (slug: string): EmojiKey => lookup(MEAL_ICON, slug);
export const dietIcon = (slug: string): EmojiKey => lookup(DIET_ICON, slug);
export const cuisineIcon = (slug: string): EmojiKey => lookup(CUISINE_ICON, slug);
export const allergenIcon = (slug: string): EmojiKey => lookup(ALLERGEN_ICON, slug);

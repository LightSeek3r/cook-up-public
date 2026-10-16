import type { IngredientCategory } from '$lib/config';
import { FALLBACK_EMOJI, type EmojiKey } from '$lib/emoji';

/**
 * ~1,000 ingredients cannot each have artwork, but they collapse into about a
 * hundred recognisable foods: a bulb is a bulb whether it is a shallot or a red
 * onion. Keys are files in `src/lib/emoji`.
 */
const E = {
	// Forms and pantry
	bottle: 'x-bottle',
	jar: '1fad9',
	salt: '1f9c2',
	honey: '1f36f',
	flour: 'x-flour',
	sugar: 'x-sugar',
	pot: '1f372',
	canned: '1f96b',
	bowl: '1f963',
	// Drinks
	coffee: '2615',
	tea: '1f375',
	wine: '1f377',
	spirit: '1f943',
	beer: '1f37a',
	sake: '1f376',
	water: '1f4a7',
	ice: '1f9ca',
	// Sweets and dishes
	chocolate: '1f36b',
	candy: '1f36c',
	custard: '1f36e',
	iceCream: '1f368',
	cake: '1f370',
	cookie: '1f36a',
	pancake: '1f95e',
	pie: '1f967',
	pizza: '1f355',
	popcorn: '1f37f',
	fries: '1f35f',
	omelette: '1f373',
	falafel: '1f9c6',
	stirFry: '1f958',
	// Dairy and eggs
	cheese: '1f9c0',
	egg: '1f95a',
	butter: '1f9c8',
	milk: '1f95b',
	// Meat and seafood
	cutOfMeat: '1f969',
	meatOnBone: '1f356',
	bacon: '1f953',
	sausage: '1f32d',
	poultry: '1f357',
	fish: '1f41f',
	squid: '1f991',
	shrimp: '1f990',
	lobster: '1f99e',
	crab: '1f980',
	shellfish: '1f9aa',
	// Grains
	noodles: '1f35c',
	pasta: '1f35d',
	rice: '1f35a',
	bread: '1f35e',
	baguette: '1f956',
	flatbread: '1fad3',
	croissant: '1f950',
	corn: '1f33d',
	grain: '1f33e',
	// Legumes and nuts
	tofu: 'x-tofu',
	pod: '1fadb',
	beans: '1fad8',
	seedling: '1f331',
	peanut: '1f95c',
	chestnut: '1f330',
	nut: 'x-nut',
	// Fruit
	coconut: '1f965',
	lemon: '1f34b',
	orange: '1f34a',
	apple: '1f34e',
	greenApple: '1f34f',
	pear: '1f350',
	peach: '1f351',
	cherry: '1f352',
	strawberry: '1f353',
	blueberry: '1fad0',
	banana: '1f34c',
	grape: '1f347',
	avocado: '1f951',
	olive: '1fad2',
	kiwi: '1f95d',
	mango: '1f96d',
	pineapple: '1f34d',
	melon: '1f348',
	watermelon: '1f349',
	// Vegetables, herbs, spices
	mushroom: '1f344',
	tomato: '1f345',
	chili: '1f336',
	bellPepper: '1fad1',
	onion: '1f9c5',
	leek: 'x-leek',
	garlic: '1f9c4',
	carrot: '1f955',
	potato: '1f954',
	sweetPotato: '1f360',
	beet: '1fadc',
	radish: 'x-radish',
	celery: 'x-celery',
	pumpkin: 'x-pumpkin',
	leafy: '1f96c',
	broccoli: '1f966',
	cucumber: '1f952',
	aubergine: '1f346',
	ginger: '1fada',
	herb: '1f33f',
	leaf: '1f343',
	cinnamon: 'x-cinnamon'
} as const satisfies Record<string, EmojiKey>;

/** Drawn for this app because Unicode has no emoji for them. */
export const REQUIRED_CUSTOM = [
	'x-bottle',
	'x-celery',
	'x-cinnamon',
	'x-flour',
	'x-leek',
	'x-nut',
	'x-pumpkin',
	'x-radish',
	'x-sugar',
	'x-tofu'
] as const;

/** Nothing matched: something true of the whole category. Also the group badge. */
export const CATEGORY_ICON: Record<IngredientCategory, EmojiKey> = {
	vegetable: E.leafy,
	fruit: E.apple,
	protein: E.poultry,
	dairy: E.milk,
	grain: E.grain,
	legume: E.beans,
	nut: E.peanut,
	spice: E.jar,
	other: E.bowl
};

/** Whole keys the token rules cannot get right. */
const OVERRIDES = new Map<string, EmojiKey>([
	// The bare key is ground black pepper (spice), but the token is a bell pepper elsewhere.
	['pepper', E.jar],
	['tomato_concentrate', E.canned]
]);

/**
 * Highest priority first. A term is one whole token of the canonical key (a
 * plural token also matches its singular), or a `_` phrase of consecutive
 * tokens. Every phrase beats every single word, longest phrase first; among
 * single words the earliest rule wins.
 *
 * So the order encodes "the form beats the source": `garlic_powder` is a jar,
 * `chicken_broth` a pot, `olive_oil` a bottle, `corn_starch` flour. Sources
 * that must beat a form are phrases (`peanut_butter`, `coconut_milk` via the
 * coconut rule sitting above milk, `egg_plant`, `banana_pepper`).
 */
const RULES: [EmojiKey, string][] = [
	[E.coffee, 'coffee espresso caffeine'],
	[E.tea, 'tea matcha mate chai'],
	[E.chocolate, 'chocolate cocoa cacao'],
	[E.candy, 'caramel marshmallow nougat marzipan liquorice licorice toffee fudge candy praline butterscotch'],
	[E.custard, 'custard flan'],
	[E.cinnamon, 'cinnamon cassia'],

	// Forms
	[E.bottle, 'oil frying vinegar sauce ketchup mirin tamari marinade dressing flavouring flavoring essence extract liquid_smoke nuoc_mam rose_water orange_blossom_water'],
	[E.salt, 'salt'],
	[E.flour, 'flour coating starch cornflour cornstarch semolina arrowroot tapioca gluten'],
	[E.sugar, 'sugar jaggery muscovado demerara turbinado fructose glucose dextrose sweetener'],
	[E.honey, 'honey syrup molasses treacle'],
	[E.pot, 'broth stock bouillon consomme'],
	[E.jar, 'seed sunflower caper poppyseed linseed flaxseed aniseed cottonseed peppercorn yeast tahini miso mustard mayonnaise jam marmalade jelly preserve chutney pesto salsa relish tamarind wasabi yeast_extract baking_soda bicarbonate cream_of_tartar citric_acid black_pepper white_pepper green_pepper pepper_mix lemon_pepper dulce_de_leche juniper_berry'],
	[E.sake, 'sake rice_wine'],
	[E.wine, 'wine sherry port madeira marsala vermouth'],
	[E.spirit, 'rum brandy cognac whiskey whisky vodka gin tequila kirsch liqueur limoncello alcohol schnapps grappa armagnac calvados'],
	[E.beer, 'beer ale stout lager cider hops'],
	[E.water, 'water'],
	[E.ice, 'ice'],
	[E.canned, 'canned_tuna'],

	// Baked goods and dishes
	[E.cake, 'cake'],
	[E.cookie, 'biscuit cookie shortbread wafer'],
	[E.pancake, 'crepe pancake blini'],
	[E.pie, 'pastry pie tart filo phyllo'],
	[E.pizza, 'pizza'],
	[E.popcorn, 'popcorn'],
	[E.fries, 'french_fries'],
	[E.omelette, 'omelette omelet'],
	[E.falafel, 'falafel'],
	[E.stirFry, 'stir_fry'],
	[E.mushroom, 'mushroom champignon shiitake porcini cep enoki chanterelle morel truffle'],

	// Dairy and eggs
	[E.cheese, 'cheese cheddar mozzarella parmesan parmigiano pecorino feta ricotta mascarpone gruyere brie camembert emmental emmentaler provolone gorgonzola fontina paneer halloumi jack bryndza cotija muenster romano gouda edam manchego stilton roquefort burrata'],
	[E.egg, 'egg meringue'],
	[E.peanut, 'peanut groundnut peanut_butter'],
	[E.coconut, 'coconut coconut_water'],
	[E.iceCream, 'ice_cream gelato sorbet'],
	[E.bowl, 'hummus yogurt yoghurt sour_cream creme_fraiche quark skyr labneh cereal muesli granola porridge corn_flake'],
	[E.butter, 'butter ghee margarine lard suet shortening fat dripping butterfat'],
	[E.milk, 'milk buttermilk kefir cream'],
	[E.bottle, 'vanilla'],
	[E.jar, 'powder'],

	// Meat and seafood
	[E.cutOfMeat, 'liver kidney heart tongue tripe offal giblet sweetbread meatball patty'],
	[E.bacon, 'bacon pancetta prosciutto ham lardon guanciale speck pork_belly'],
	[E.sausage, 'sausage chorizo salami pepperoni mortadella frankfurter kielbasa bratwurst casing hot_dog'],
	[E.poultry, 'chicken turkey duck goose quail poultry hen pheasant frog_leg'],
	[E.meatOnBone, 'bone rib lamb mutton goat venison rabbit hare boar trotter oxtail'],
	[E.squid, 'squid octopus cuttlefish calamari'],
	[E.shrimp, 'shrimp prawn'],
	[E.lobster, 'lobster crayfish crawfish langoustine'],
	[E.crab, 'crab'],
	[E.shellfish, 'oyster clam mussel scallop cockle snail'],
	[E.fish, 'fish salmon tuna cod tilapia mackerel anchovy haddock halibut sardine trout carp herring flounder mahi monkfish perch hake saithe milkfish gurnard bream roe katsuobushi bonito swordfish sole pollock eel catfish snapper bass pike'],
	[E.cutOfMeat, 'beef veal pork steak meat chuck loin brisket sirloin'],

	// Grains
	[E.noodles, 'noodle udon ramen soba vermicelli'],
	[E.pasta, 'pasta spaghetti macaroni linguine penne lasagne lasagna ravioli tagliatelle fettuccine fusilli tortellini orzo gnocchi egg_pasta'],
	[E.baguette, 'baguette french_bread french_roll'],
	[E.flatbread, 'tortilla pita naan chapati roti flatbread lavash'],
	[E.bread, 'bread bun brioche sourdough crouton breadcrumb panko toast rusk roll'],
	[E.croissant, 'croissant'],
	[E.rice, 'rice risotto'],
	[E.corn, 'corn sweetcorn maize polenta hominy cornmeal'],
	[E.grain, 'wheat oat barley rye spelt millet sorghum quinoa bulgur couscous freekeh amaranth teff buckwheat einkorn farro malt bran sago kernel'],

	// Legumes and nuts
	[E.tofu, 'tofu tempeh seitan'],
	[E.seedling, 'sprout alfalfa bean_sprout'],
	[E.beans, 'black_eyed_pea pigeon_pea split_pea'],
	[E.pod, 'pea edamame okra mangetout green_bean wax_bean yardlong_bean runner_bean'],
	[E.beans, 'bean lentil chickpea kidney_bean gram dal dhal soya soy soybean cowpea lupin carob legume'],
	[E.chestnut, 'chestnut acorn'],
	[E.nut, 'nut almond walnut pecan cashew hazelnut pistachio macadamia pine_nut brazil_nut'],

	// Greens, herbs and leaves (above the vegetables, so `taro_leaves` is a leaf)
	[E.leafy, 'artichoke spinach lettuce cabbage kale chard collard greens choy rocket arugula watercress cress sorrel endive chicory radicchio rapini purslane nettle salad sauerkraut kimchi seaweed nori wakame kombu laver spirulina romaine frisee mizuna pak_choi bok_choy brussels_sprout water_spinach mustard_greens artichoke_heart'],
	[E.herb, 'parsley basil thyme oregano rosemary dill sage mint marjoram tarragon chervil lovage savory epazote herb herbes chive cilantro lemongrass spearmint peppermint lavender coriander_leaf lemon_balm lemon_verbena bouquet_garni'],
	[E.celery, 'celery celeriac fennel rhubarb'],
	[E.leaf, 'leaf leaves'],

	// Vegetables
	[E.tomato, 'tomato tomatillo'],
	[E.chili, 'chili chilli chile jalapeno habanero chipotle cayenne paprika serrano poblano harissa sambal gochugaru scotch_bonnet banana_pepper'],
	[E.bellPepper, 'pepper pimiento capsicum friggitello bell_pepper'],
	[E.leek, 'leek scallion asparagus spring_onion green_onion'],
	[E.onion, 'onion shallot'],
	[E.garlic, 'garlic'],
	[E.carrot, 'carrot parsnip mirepoix parsley_root'],
	[E.sweetPotato, 'yam cassava manioc sweet_potato'],
	[E.potato, 'potato taro tuber burdock yambean jicama lotus_root water_chestnut'],
	[E.beet, 'beet beetroot'],
	[E.radish, 'radish turnip daikon rutabaga swede horseradish kohlrabi'],
	[E.pumpkin, 'pumpkin squash butternut gourd acorn_squash'],
	[E.broccoli, 'broccoli cauliflower romanesco broccolini'],
	[E.cucumber, 'cucumber gherkin courgette zucchini chayote chayotte pickle bitter_melon'],
	[E.aubergine, 'aubergine eggplant brinjal egg_plant'],
	[E.ginger, 'ginger galangal turmeric ginseng liquorice_root'],

	// Fruit
	[E.lemon, 'lemon lime citron calamansi yuzu lemonade'],
	[E.orange, 'orange mandarin tangerine clementine satsuma grapefruit kumquat'],
	[E.greenApple, 'green_apple'],
	[E.apple, 'apple'],
	[E.pear, 'pear quince'],
	[E.peach, 'peach nectarine apricot plum prune'],
	[E.cherry, 'cherry'],
	[E.strawberry, 'strawberry raspberry cranberry lingonberry redcurrant'],
	[E.blueberry, 'blueberry blackberry bilberry blackcurrant berry currant elderberry mulberry'],
	[E.banana, 'banana plantain matoki'],
	[E.grape, 'grape raisin sultana'],
	[E.avocado, 'avocado guacamole'],
	[E.olive, 'olive'],
	[E.kiwi, 'kiwi kiwifruit'],
	[E.mango, 'mango papaya'],
	[E.pineapple, 'pineapple'],
	[E.watermelon, 'watermelon'],
	[E.melon, 'melon cantaloupe honeydew'],

	// Spice words that also turn up outside the spice category (`allspice` is filed as a vegetable).
	[E.jar, 'allspice nutmeg clove cardamom cumin saffron mace anise']
];

interface Phrase {
	parts: string[];
	icon: EmojiKey;
}

const PHRASES: Phrase[] = [];
const WORDS = new Map<string, EmojiKey>();
for (const [icon, terms] of RULES) {
	for (const term of terms.split(' ')) {
		if (term.includes('_')) PHRASES.push({ parts: term.split('_'), icon });
		else if (!WORDS.has(term)) WORDS.set(term, icon);
	}
}
// Stable sort: equal lengths keep rule order.
PHRASES.sort((a, b) => b.parts.length - a.parts.length);

/** Just enough English plural folding for this vocabulary; the raw token is always tried too. */
function singular(token: string): string {
	if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
	if (token.endsWith('oes')) return token.slice(0, -2);
	if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
	return token;
}

function sameWord(token: string, term: string): boolean {
	return token === term || singular(token) === term;
}

function containsPhrase(tokens: string[], parts: string[]): boolean {
	for (let start = 0; start + parts.length <= tokens.length; start++) {
		if (parts.every((part, i) => sameWord(tokens[start + i], part))) return true;
	}
	return false;
}

/** Rank = position in RULES, so the earliest rule wins among single words. */
const RANK = new Map([...WORDS.keys()].map((word, index) => [word, index]));

function match(canonicalKey: string): EmojiKey | undefined {
	const override = OVERRIDES.get(canonicalKey);
	if (override) return override;

	const tokens = canonicalKey.split('_').filter(Boolean);
	for (const phrase of PHRASES) {
		if (containsPhrase(tokens, phrase.parts)) return phrase.icon;
	}

	let best: string | undefined;
	for (const token of tokens) {
		for (const form of [token, singular(token)]) {
			const rank = RANK.get(form);
			if (rank !== undefined && (best === undefined || rank < RANK.get(best)!)) best = form;
		}
	}
	return best === undefined ? undefined : WORDS.get(best);
}

/** Every artwork key the ingredient tables can return. */
export const INGREDIENT_ICON_KEYS: readonly EmojiKey[] = [...new Set(Object.values(E))];

const cache = new Map<string, EmojiKey>();

/**
 * Resolve an ingredient to its emoji key. Keyed on `canonical_key`, never on
 * the displayed name, so a Japanese or Arabic mosaic gets the same artwork.
 * An empty key gives the category glyph (the mosaic's group badge).
 */
export function iconFor(canonicalKey: string, category: IngredientCategory): EmojiKey {
	const key = `${canonicalKey}\u0000${category}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const result = match(canonicalKey.toLowerCase()) ?? CATEGORY_ICON[category] ?? FALLBACK_EMOJI;
	cache.set(key, result);
	return result;
}

/** Whether `iconFor` fell through to the category glyph: for the mapping review only. */
export function matchesRule(canonicalKey: string): boolean {
	return match(canonicalKey.toLowerCase()) !== undefined;
}

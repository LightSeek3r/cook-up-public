/**
 * First-pass triage of ingredient keys for the seasons data (pure). Decides
 * only what needs no judgement: processed foods, pantry staples, farmed
 * animals, cultivated and generic keys become `{ ay: reason }`. Everything
 * else is routed to a writer family (`stage: 'write'`, a fresh food whose
 * windows an agent writes) or to classification (`stage: 'classify'`, an
 * agent first decides all year vs seasonal).
 *
 * The lists are deliberately explicit: category is unreliable for
 * seasonality (mushrooms and butter are `other`, parsley is `spice`), and an
 * unknown key falls through to classification, never to a silent "all year".
 */

import { GENERIC_PAIRS } from './generic_ingredients.mjs';

/** Keys named like a processed food (a superset of the gate's PROCESSED_MARKER). */
export const TRIAGE_PROCESSED =
	/dried_|ground_|_powder|_flour|_oil|_sauce|_paste|_juice|_jam|_broth|_stock|smoked_|cooked_|canned|frozen|vinegar|syrup|extract|puree|pickled|sauerkraut|jerky|cured/;

const set = (s) => new Set(s.trim().split(/\s+/));

const AY = {
	generic: set(`
		alcohol beans berries bone cereal coating fat fish fish_meat flavouring frying fruit glaze herb
		herbs_and_spices legume marinade meat mixed_beans mixed_condiments mixed_fruit mixed_spices nut
		oil_and_fat poultry pulp salad seaweed spice stir_fry tuber vegetable vegetable_blend white_fish_fillets
	`),
	farmed: set(`
		egg egg_white egg_yolk chicken_egg duck_egg quail_eggs whole_egg milk whole_milk skimmed_milk cow_s_milk goat_milk
		beef beef_bones beef_heart beef_kidney beef_meat beef_steak beef_tongue beef_tripe chuck_steak minced_beef oxtail
		chicken chicken_breast chicken_breast_fillet chicken_fillet chicken_liver chicken_meat chicken_thigh chicken_wing
		whole_chicken poultry_liver liver duck duck_meat turkey turkey_meat quail goat goat_meat horse_meat lamb mutton
		veal veal_meat pork lean_pork minced_pork pigs_trotters pork_belly pork_chops pork_fillet pork_loin pork_meat
		pork_shoulder pork_spare_ribs tilapia tilapia_fillet milkfish
	`),
	cultivated: set(`
		button_mushroom champignon enoki_mushrooms oyster_mushroom shiitake straw_mushroom bean_sprouts mung_bean_sprout spirulina
	`),
	processed: set(`
		hard_boiled_egg soft_boiled_egg meringue oil curry
		bacon chorizo ham meatball mortadella pepperoni salami sausage pork_sausage roast_chicken katsuobushi
		salted_dried_cod squid_ink casing
		chopped_tomato crushed_tomato peeled_tomatoes tomato_concentrate tomato_pulp mashed_potato dehydrated_onion
		dehydrated_broth fried_onion kimchi sambal_oelek chipotle olive black_olive green_olive kalamata_olive
		pitted_green_olives capers
		raisin golden_raisin seeded_raisin seedless_raisin sultana sultana_raisin prune desiccated_coconut coconut_flakes
		coconut_milk coconut_cream coconut_water raspberry_liqueur candied_orange_peel glace_cherry
		tofu firm_tofu soft_tofu fried_tofu tempeh soaked_chickpeas
		bouquet_garni garam_masala herbes_de_provence za_atar berbere_spice_blend lemon_pepper pepper_mix garlic_salt
		celery_salt paprika hot_paprika cayenne_pepper cracked_black_pepper
		chopped_hazelnuts roasted_peanut tahini peanut_butter toasted_hazelnuts
		puffed_rice rice_noodles rice_milk rice_wine orange_blossom_water rose_water kombu laver nori wakame
		jam creme_fraiche nutritional_yeast nutritional_yeast_flake liquid_smoke patty
	`),
	staple: set(`
		salt black_salt coarse_salt coarse_sea_salt iodised_salt kosher_salt non_iodised_salt rock_salt sea_salt sea_salt_flakes
		water mineral_water natural_mineral_water carbonated_water ice flour baking_soda yeast fresh_yeast brewer_s_yeast
		cream_of_tartar corn_starch potato_starch tapioca gelatin fructose glucose jaggery muscovado molasses soya black_quinoa
		adzuki_bean black_bean black_eyed_pea black_gram brown_lentils chickpea cowpea kidney_bean lentils mung_bean
		pinto_beans red_bean red_lentils split_pea green_split_pea yellow_split_pea white_beans soya_bean
	`),
	traded: set(`
		coffee coffee_beans black_tea black_tea_leaf green_tea tea tea_leaf matcha mate cocoa vanilla vanilla_pod
		juniper_berry liquorice_root ginseng tamarind poppyseed allspice celery_seed carob_bean
		almond brazil_nut cashew_nuts hazelnut macadamia_nut peanut pecan_nut pistachio_nuts shelled_peanut
		sesame_seeds white_sesame_seeds whole_almonds pine_nuts pumpkin_seed sunflower_seed chia_seed cottonseed
	`)
};

/** Fresh foods an agent writes windows for, by family, beyond what the category says. */
const WRITE = {
	herbs: set(`
		basil basil_leaf fresh_basil thai_basil celery_leaves chervil chives fresh_chives coriander_leaf curry_leaf dill
		fresh_dill epazote fenugreek_leaf rosemary fresh_rosemary sage fresh_sage fresh_spearmint thyme fresh_thyme
		kaffir_lime_leaf lavender lavender_flower lemon_balm lemon_verbena lemongrass lovage marjoram mint mint_leaf
		oregano pandan_leaf parsley summer_savory tarragon sorrel
	`),
	fungi_nuts: set('cep truffle mushroom chestnut acorn'),
	produce: set(`
		corn sweetcorn snow_pea pea garden_peas green_peas sweet_peas green_bean wax_bean yardlong_beans edamame
		pomegranate_seeds burdock plantain
	`)
};

/** Keys where all year vs seasonal is a judgement call; the value is the family if seasonal. */
const CLASSIFY = new Map(
	Object.entries({
		produce: `corn_kernel yellow_corn lima_bean large_lima_beans borlotti_bean pigeon_pea date coconut alfalfa
			sunflower roselle_flower hops grape_leaf bamboo bamboo_shoot`,
		herbs: 'ginger galangal turmeric coriander bay_leaf fenugreek',
		fungi_nuts: 'walnut white_walnut',
		animal: 'goose rabbit roe frog_legs snail muskrat_meat'
	}).flatMap(([family, keys]) => [...set(keys)].map((k) => [k, family]))
);

const GRAIN_PROCESSED =
	/pasta|bread|crumb|noodle|macaroni|spaghetti|linguine|penne|lasagne|ravioli|flakes|biscuit|couscous|bulgur|seitan|malt|puffed|semolina|bran|germ|popcorn|muesli/;
const OTHER_PROCESSED = new RegExp(
	[
		'butter', 'cream', 'yogurt', 'kefir', 'cheese', 'chocolate', 'cocoa_', 'custard', 'wine', 'beer', 'cider',
		'^rum$', '_rum$', '^gin$', 'vodka', 'whiskey', 'brandy', 'cognac', 'tequila', 'sherry', '^port$', 'madeira',
		'marsala', 'vermouth', 'kirsch', 'limoncello', 'liqueur', '^sake$', 'mirin', 'lemonade', 'marmalade', 'honey',
		'bread', 'brioche', 'baguette', '_roll$', 'tortilla', 'pita', 'crepe', 'wafer', 'biscuit', 'cake', 'shortbread',
		'pastry', 'dough', 'pizza', 'crust', 'crouton', 'panko', 'noodle', 'udon', 'vermicelli', 'miso', 'soy',
		'tamari', 'ketchup', 'mayonnaise', 'mustard', 'pesto', 'salsa', 'hummus', 'guacamole', 'falafel', 'harissa',
		'wasabi', 'nuoc_mam', '_fat$', 'lard', 'suet', 'ghee', 'margarine', 'shortening', 'caramel', 'marshmallow',
		'marzipan', 'nougat', 'fries', 'omelette', 'stock_cube', 'broth', 'muesli', '_milk$', 'protein', 'quorn',
		'rennet', 'starter', 'sourdough', 'psyllium', 'guar_gum', 'citric_acid', 'caffeine', 'essential', 'mirepoix',
		'gluten', 'malt', 'liquorice$', 'instant_', 'creaming', 'tea_extract', 'sugar_cube', 'flavouring'
	].join('|')
);
const SUGAR = /sugar|treacle/;
const RICE = /rice$/;

/**
 * @param {{ canonical_key: string, category: string }} row
 * @returns {{ ay: string } | { family: string, stage: 'write' | 'classify' }}
 */
export function triageKey(row) {
	const key = row.canonical_key;
	if (TRIAGE_PROCESSED.test(key)) return { ay: 'processed' };
	for (const [reason, keys] of Object.entries(AY)) if (keys.has(key)) return { ay: reason };
	if (CLASSIFY.has(key)) return { family: CLASSIFY.get(key), stage: 'classify' };
	for (const [family, keys] of Object.entries(WRITE)) if (keys.has(key)) return { family, stage: 'write' };
	switch (row.category) {
		case 'dairy':
			return { ay: 'processed' };
		case 'grain':
			return { ay: GRAIN_PROCESSED.test(key) ? 'processed' : 'staple' };
		case 'spice':
		case 'nut':
			return { ay: 'traded' };
		case 'vegetable':
		case 'fruit':
			return { family: 'produce', stage: 'write' };
		case 'protein':
			return { family: 'animal', stage: 'write' };
		case 'legume':
			return { family: 'produce', stage: 'classify' };
		case 'other':
			if (OTHER_PROCESSED.test(key)) return { ay: 'processed' };
			if (SUGAR.test(key)) return { ay: 'staple' };
			if (RICE.test(key)) return { ay: 'staple' };
			return { family: 'produce', stage: 'classify' };
		default:
			return { family: 'produce', stage: 'classify' };
	}
}

const SUFFIXES = ['_leaf', '_leaves', '_fillet', '_fillets', '_floret', '_florets', '_segments', '_kernel', '_stalk', '_meat', '_heart', '_zest', '_peel'];
const PREFIXES = ['fresh_', 'baby_'];

/**
 * A plausible `like` target for an undecided key: its generic in GENERIC_PAIRS
 * (fresh_basil -> basil), else the key without a part-of-plant or cut affix
 * (salmon_fillet -> salmon). Only a suggestion for the writer, never applied:
 * tomato -> tomato_puree is a generic pair too, the wrong way round for seasons.
 * @param {string} key
 * @param {(key: string) => boolean} candidate whether a key could be a seasonal target
 */
export function suggestLike(key, candidate) {
	for (const [generic, specific] of GENERIC_PAIRS) {
		if (specific === key && generic !== key && candidate(generic)) return generic;
	}
	for (const s of SUFFIXES) if (key.endsWith(s) && candidate(key.slice(0, -s.length))) return key.slice(0, -s.length);
	for (const p of PREFIXES) if (key.startsWith(p) && candidate(key.slice(p.length))) return key.slice(p.length);
	return undefined;
}

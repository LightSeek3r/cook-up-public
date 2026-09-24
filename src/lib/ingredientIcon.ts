import type { IngredientCategory } from '$lib/config';

/**
 * A hand-drawn archetype set rather than one icon per ingredient: ~900
 * ingredients cannot each have artwork, but they collapse into a few dozen
 * recognisable shapes. A bulb is a bulb whether it is a shallot or a red onion.
 *
 * Every path lives on a 24x24 grid. `fill` is painted at low opacity *and*
 * stroked, which gives a two-tone body for free; `line` is stroke-only detail.
 */
export interface IconArt {
	fill?: string;
	line?: string;
}

export const ICONS = {
	// — vegetables ————————————————————————————————————————————————
	onion: {
		fill: 'M12 5.5c4 3.2 6 6.2 6 9.2a6 6 0 0 1-12 0c0-3 2-6 6-9.2Z',
		line: 'M12 5.5V2.5M10 8.5c-.8 2.4-1 4.4-1 6.2M14 8.5c.8 2.4 1 4.4 1 6.2'
	},
	garlic: {
		fill: 'M12 4.5c2.6 2.8 4.6 6.2 4.6 9.4A4.6 4.6 0 0 1 12 18.5a4.6 4.6 0 0 1-4.6-4.6c0-3.2 2-6.6 4.6-9.4Z',
		line: 'M12 4.5V2.5M9.6 10.5c-.5 2.4-.5 5.4.4 8M14.4 10.5c.5 2.4.5 5.4-.4 8'
	},
	carrot: {
		fill: 'M14.8 9.2 6.4 17.6a2.3 2.3 0 0 0 3.2 3.2L18 12.6Z',
		line: 'M14.8 9.2c.6-2.4 2.6-4.2 5.2-4.2-.2 2.2-1.2 3.8-2.6 4.8M14.8 9.2c-2-.8-3.2-2.8-3.2-5.4 2.2.4 3.8 1.4 4.6 2.8M10.5 13.5l2 2M13.5 10.5l2 2'
	},
	potato: {
		fill: 'M4.4 12.4c0-4.2 3.6-6.8 8-6.8s7.4 2.6 7.4 5.8-3.2 7.6-8.2 7.6-7.2-3-7.2-6.6Z',
		line: 'M9 11h.01M12.6 14.4h.01M15 10.2h.01'
	},
	tomato: {
		fill: 'M12 7.6a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2Z',
		line: 'M12 7.6V5.6M12 5.6 8.6 3.8M12 5.6 15.4 3.8M9.4 6.2 12 5.6l2.6.6'
	},
	chilli: {
		fill: 'M17.4 5.4c1 4.2-1.4 9.4-5.2 11.4-2.6 1.4-5.2.4-5.8-1.8s1.6-4.6 4.6-6.2 5.4-2.6 6.4-3.4Z',
		line: 'M17.4 5.4c.2-1.6-.6-2.8-2.2-3'
	},
	leafy: {
		fill: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z',
		line: 'M12 20c-2.4-3-3.4-6-3-9M12 20c2.4-3 3.4-6 3-9M6.2 9.2c1.8 1 3.8 1.5 5.8 1.5s4-.5 5.8-1.5'
	},
	mushroom: {
		fill: 'M4.6 11.4a7.4 7.4 0 0 1 14.8 0Z',
		line: 'M9.8 11.4v5.4a2.2 2.2 0 0 0 4.4 0v-5.4M8.6 8.4h.01M13.4 7.6h.01'
	},
	corn: {
		fill: 'M12 3.2c3 2.2 4 5.6 4 8.6s-2 8.8-4 9.8c-2-1-4-6.2-4-9.8s1-6.4 4-8.6Z',
		line: 'M12 4v16.4M9 8.2h6M8.6 12.2h6.8M9 16.2h6'
	},
	broccoli: {
		fill: 'M6.2 10.6a3.1 3.1 0 0 1 1.4-5.6A3.3 3.3 0 0 1 12 3.4a3.3 3.3 0 0 1 4.4 1.6 3.1 3.1 0 0 1 1.4 5.6Z',
		line: 'M9.8 10.6v6a2.2 2.2 0 0 0 4.4 0v-6'
	},
	cucumber: {
		fill: 'M18.6 5.4c2 2 .6 7-3.4 11s-9 5.6-10.6 4-.2-6.8 3.8-10.8 8.2-6.2 10.2-4.2Z',
		line: 'M9.4 12h.01M12 9.4h.01M12 14.6h.01M14.6 12h.01'
	},
	aubergine: {
		fill: 'M17.6 8.2c2.6 3-.2 9.2-4.8 11.2S4 19.2 4.4 15 9 8.2 12.6 7.2s3.6-.6 5 1Z',
		line: 'M15 6.4c.4-2 2-3.2 4-3.2 0 2-1 3.6-2.6 4.2'
	},
	beet: {
		fill: 'M12 20.8c-3.5 0-6-2.6-6-6s2.6-6.4 6-6.4 6 3 6 6.4-2.5 6-6 6Z',
		line: 'M12 8.4V3.6M12 3.6c-1.5-1-3-1.4-4-1.4.2 1.6 1 2.8 2.2 3.4M12 3.6c1.5-1 3-1.4 4-1.4-.2 1.6-1 2.8-2.2 3.4'
	},
	pumpkin: {
		fill: 'M12 6.4c4 0 7 3.2 7 7.4s-3 7.2-7 7.2-7-3-7-7.2 3-7.4 7-7.4Z',
		line: 'M12 6.4v14.6M9 7.6c-1.2 1.8-1.8 3.8-1.8 6.2s.6 4.4 1.8 6.2M15 7.6c1.2 1.8 1.8 3.8 1.8 6.2s-.6 4.4-1.8 6.2M12 6.4V3.4'
	},
	pod: {
		fill: 'M20.4 4.6c-1.8 8.2-7 13.4-13.4 15.2C5.2 13.6 10.2 6.4 20.4 4.6Z',
		line: 'M9.6 15h.01M12.4 12.2h.01M15.2 9.4h.01'
	},

	// — fruit ————————————————————————————————————————————————————
	citrus: {
		fill: 'M12 5.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2Z',
		line: 'M12 5.4v13.2M5.4 12h13.2M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2'
	},
	apple: {
		fill: 'M12 7.4c2-1.6 5.2-1 6.2 1.6s-.6 8.2-3.2 10.2c-1 .8-2 .2-3 .2s-2 .6-3-.2C6.4 17.2 4.8 11.6 5.8 9s4.2-3.2 6.2-1.6Z',
		line: 'M12 7.4V4.2M12 4.2c2 0 3.6-1 4.2-2.2-2 0-3.6.8-4.2 2.2'
	},
	berry: {
		fill: 'M8 12.2a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4ZM16 12.2a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4ZM12 7a3.2 3.2 0 1 1 0 6.4A3.2 3.2 0 0 1 12 7Z',
		line: 'M12 7V3.4'
	},
	banana: {
		fill: 'M4 9.6c1 6.2 6.2 9.4 12.4 8.4 3-.5 4.2-2 4.2-3.6-3.2 1-6.4.4-9-1.8S6.6 7.4 6 4.4C4.4 5.6 3.6 7.2 4 9.6Z',
		line: 'M20.6 14.4 22 12.6'
	},
	grape: {
		fill: 'M8.8 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2ZM15.2 9.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2ZM12 14.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z',
		line: 'M12 9.4V4.2M12 4.2c1.8-.6 3-1.8 3.4-3'
	},
	coconut: {
		fill: 'M12 5.4a7.2 7.2 0 1 1 0 14.4 7.2 7.2 0 0 1 0-14.4Z',
		line: 'M9.4 10.6h.01M14.6 10.6h.01M12 14.8h.01M12 5.4V3'
	},
	avocado: {
		fill: 'M12 3.6c4 0 7 4 7 8.6s-3 8.6-7 8.6-7-4-7-8.6 3-8.6 7-8.6Z',
		line: 'M12 10a3.2 3.2 0 1 1 0 6.4A3.2 3.2 0 0 1 12 10Z'
	},
	olive: {
		fill: 'M12 5.8c3.3 0 5.6 3.2 5.6 7.2s-2.3 7.2-5.6 7.2-5.6-3.2-5.6-7.2 2.3-7.2 5.6-7.2Z',
		line: 'M12 10.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z'
	},

	// — protein ————————————————————————————————————————————————
	// Was a drumstick drawn as a round lobe on a straight diagonal shaft — per
	// user feedback that silhouette (round head + thin handle) reads as
	// anatomy before it reads as food, and no amount of resizing the lobes
	// fixed that; it's the same shape family as a magnifying glass or lollipop.
	// A bird head in profile (comb, beak, wattle) is a different silhouette
	// family entirely, and doubles as the icon for turkey/duck/poultry too.
	chicken: {
		fill: 'M12 5.4a6.2 5.6 0 1 1 0 11.2 6.2 5.6 0 1 1 0-11.2ZM16.8 9.6 20.6 10.8 16.8 12.4ZM15.4 13.8c.9.2 1.6 1 1.6 2 0 1.2-.9 2.2-2 2.2-.6 0-1.1-.2-1.5-.6Z',
		line: 'M9 4.4a1.3 1.3 0 1 1 2.6 0M11.6 3.6a1.3 1.3 0 1 1 2.6 0M14.2 4.4a1.3 1.3 0 1 1 2.6 0M9.6 10.4h.01'
	},
	beef: {
		fill: 'M4.6 11.6C4.6 7.4 8.6 4.6 13.2 4.6c4.4 0 7.6 2.6 7.6 6.2 0 4.6-3.6 8.6-8.6 8.6-4.6 0-7.6-3-7.6-7.8Z',
		line: 'M9.2 9.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM14.6 9.4c1.2.8 1.9 2 1.9 3.4'
	},
	bacon: {
		fill: 'M3 8.4c4-3 7 3 11 0s7 3 7 3v5.2s-3-6-7-3-7-3-11 0Z',
		line: 'M3 11.6c4-3 7 3 11 0s7 3 7 3'
	},
	fish: {
		fill: 'M20.2 12c-2.6 3.4-5.8 5.2-9.2 5.2S4.6 15.4 3 12c1.6-3.4 4.6-5.2 8-5.2s6.6 1.8 9.2 5.2ZM20.2 12 23 8.4v7.2Z',
		line: 'M8 10.6h.01M13 8.2c.6 2.6.6 5 0 7.6'
	},
	shrimp: {
		fill: 'M20 6.6c-6.4.6-10.6 4-10.6 8.2 0 2.4 1.8 4.2 4.2 4.2 2.2 0 3.8-1.4 3.8-3.4 0-1.4-.9-2.4-2.2-2.4-1 0-1.7.6-1.7 1.5 0 .7.4 1.2 1.1 1.2-1.4 0-2.4-1.1-2.4-2.6 0-2.8 3.2-5.4 7.8-6.7Z',
		line: 'M20 6.6c1.4 0 2.2.8 2.2 2M9.6 11.4 5.8 9.4M9 14.2H4.8M10 16.8l-3.4 2'
	},
	sausage: {
		fill: 'M5.6 6.4a2.6 2.6 0 0 1 2.8-2.6c6 .6 10.8 5.4 11.4 11.4a2.6 2.6 0 0 1-5.2.4c-.4-3.4-3.2-6.2-6.6-6.6a2.6 2.6 0 0 1-2.4-2.6Z'
	},
	egg: {
		fill: 'M12 3c3.4 0 6.2 4.8 6.2 9.2a6.2 6.2 0 0 1-12.4 0C5.8 7.8 8.6 3 12 3Z',
		line: 'M9 12.6c0-1.8.8-3.2 2-4'
	},

	// — dairy ————————————————————————————————————————————————————
	milk: {
		fill: 'M9 3.4h6v3l2.6 3.6v10.6a1 1 0 0 1-1 1H7.4a1 1 0 0 1-1-1V10l2.6-3.6Z',
		line: 'M6.4 13.4h11.2'
	},
	cheese: {
		fill: 'M3 16.4 12.6 6.4H21v10Z',
		line: 'M9 13.4h.01M13.4 15h.01M17.4 12h.01M12.6 6.4V16.4'
	},
	butter: {
		fill: 'M3.4 10.4 8.6 6.4H20.6v7.4L15.4 18H3.4Z',
		line: 'M3.4 10.4h12v7.6M15.4 10.4 20.6 6.4'
	},
	cream: {
		fill: 'M6 8h9.2v9.6a3.4 3.4 0 0 1-3.4 3.4H9.4A3.4 3.4 0 0 1 6 17.6Z',
		line: 'M15.2 10.4h2.2a2.2 2.2 0 0 1 0 4.4h-2.2M6 8c0-2.2 2-3.8 4.6-3.8s4.6 1.6 4.6 3.8'
	},
	yogurt: {
		fill: 'M6.6 8.4h10.8l-1.2 11a2 2 0 0 1-2 1.8H9.8a2 2 0 0 1-2-1.8Z',
		line: 'M5.4 8.4h13.2M9.2 5.2h5.6M8.6 13h6.8'
	},

	// — grain ————————————————————————————————————————————————————
	wheat: {
		fill: 'M12 9.4c-2 0-3.6-1.6-3.6-3.6C10.4 5.8 12 7.4 12 9.4ZM12 9.4c2 0 3.6-1.6 3.6-3.6C13.6 5.8 12 7.4 12 9.4ZM12 14.4c-2 0-3.6-1.6-3.6-3.6 2 0 3.6 1.6 3.6 3.6ZM12 14.4c2 0 3.6-1.6 3.6-3.6-2 0-3.6 1.6-3.6 3.6ZM12 19.4c-2 0-3.6-1.6-3.6-3.6 2 0 3.6 1.6 3.6 3.6ZM12 19.4c2 0 3.6-1.6 3.6-3.6-2 0-3.6 1.6-3.6 3.6Z',
		line: 'M12 21.4V7'
	},
	bread: {
		fill: 'M4 12.6c0-3.6 3.6-6.2 8-6.2s8 2.6 8 6.2v5.8H4Z',
		line: 'M8 18.4v-5.6M12 18.4v-5.6M16 18.4v-5.6'
	},
	riceBowl: {
		fill: 'M3.4 12.4h17.2c0 4.8-3.8 8.6-8.6 8.6s-8.6-3.8-8.6-8.6Z',
		line: 'M2.2 12.4h19.6M9 9.6c0-1.6 1.4-2.6 3-2.6s3 1 3 2.6M12 4.6V7'
	},
	noodles: {
		fill: 'M3.4 12.4h17.2c0 4.8-3.8 8.6-8.6 8.6s-8.6-3.8-8.6-8.6Z',
		line: 'M2.2 12.4h19.6M8.2 12c-.4-2.4.4-4.4 2.2-5.8M12 12c-.4-2.8.6-5 2.6-6.6M15.8 12c-.2-1.8.6-3.4 2.2-4.4'
	},
	flour: {
		fill: 'M7 8.4h10l1.4 12.2a1 1 0 0 1-1 1.1H6.6a1 1 0 0 1-1-1.1Z',
		line: 'M9 8.4V5.8C9 4.2 10.3 3.2 12 3.2s3 1 3 2.6v2.6M8.4 13.4h7.2'
	},
	pastry: {
		fill: 'M3.6 13.6h16.8c0 3.2-3.8 5.8-8.4 5.8s-8.4-2.6-8.4-5.8Z',
		line: 'M6.2 13.6c0-3.2 2.6-5.4 5.8-5.4s5.8 2.2 5.8 5.4M9.4 9 8.4 5.6M14.6 9l1-3.4'
	},

	// — legume ————————————————————————————————————————————————
	beans: {
		fill: 'M8.4 5.4c3.6 0 6.4 3 6.4 6.6s-2.8 6.6-6.4 6.6S4 15.6 4 12s2-6.6 4.4-6.6ZM16.4 8.2c2.4 0 3.6 2 3.6 4.4s-1.2 4.4-3.6 4.4-3.2-2-3.2-4.4 1.2-4.4 3.2-4.4Z'
	},
	tofu: {
		fill: 'M5 9 12 5.4 19 9v6.2L12 18.8 5 15.2Z',
		line: 'M5 9l7 3.6L19 9M12 12.6v6.2'
	},

	// — nut ————————————————————————————————————————————————————
	almond: {
		fill: 'M12 3c4 3.2 6 6.8 6 10.4 0 4.6-2.7 7.6-6 7.6s-6-3-6-7.6C6 9.8 8 6.2 12 3Z',
		line: 'M12 6v12'
	},
	peanut: {
		fill: 'M9 4.4c2.6 0 3.9 2 3.9 4.1s1 2.6 2.7 3.6 2.7 2.7 2.7 4.6c0 2.1-1.8 3.6-4.1 3.6-2.7 0-4.3-2-4.3-4.1s-1-2.6-2.7-3.6S4.5 10.6 4.5 8.5 6.4 4.4 9 4.4Z',
		line: 'M9.5 11.4c1.6.8 3.4.8 5 0'
	},
	seeds: {
		fill: 'M8 8.4c1.4 0 2.5 1.2 2.5 2.6S9.4 13.6 8 13.6 5.5 12.4 5.5 11 6.6 8.4 8 8.4ZM15.2 5.4c1.4 0 2.5 1.2 2.5 2.6s-1.1 2.6-2.5 2.6-2.5-1.2-2.5-2.6 1.1-2.6 2.5-2.6ZM13 14c1.4 0 2.5 1.2 2.5 2.6S14.4 19.2 13 19.2s-2.5-1.2-2.5-2.6S11.6 14 13 14Z'
	},

	// — spice ————————————————————————————————————————————————————
	leaf: {
		fill: 'M20 3.6c-9 .6-14 5-14 10.6 0 2 .7 3.6 1.8 4.8 7-1.2 12.2-7.4 12.2-15.4Z',
		line: 'M6.4 21c1-5.2 4.6-10.2 9.6-13.2'
	},
	jar: {
		fill: 'M7 8.8h10v10.4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z',
		line: 'M8.6 8.8V6.2h6.8v2.6M10.2 3.4h3.6v2.8h-3.6zM7 13h10'
	},
	cinnamon: {
		fill: 'M6 5.6h9.4c-2 0-3.6 2.8-3.6 6.4s1.6 6.4 3.6 6.4H6c2 0 3.6-2.8 3.6-6.4S8 5.6 6 5.6Z',
		line: 'M18.4 5.6c-2 0-3.6 2.8-3.6 6.4s1.6 6.4 3.6 6.4'
	},

	// — other ————————————————————————————————————————————————————
	sugar: {
		fill: 'M3.6 9.4h8v8h-8ZM12.6 6.6h8v8h-8Z',
		line: 'M3.6 9.4 6.2 6.8h8M12.6 6.6 15.2 4h8v8l-2.6 2.6M11.6 17.4l2.6-2.6'
	},
	drop: {
		fill: 'M12 21c-3.1 0-5.6-2.5-5.6-5.6C6.4 11.8 12 3 12 3s5.6 8.8 5.6 12.4C17.6 18.5 15.1 21 12 21Z',
		line: 'M9.6 15.8c0 1.6 1 2.8 2.4 3.2'
	},
	bottle: {
		fill: 'M10 3.4h4v2.8l3.4 4.6v9.6a1.6 1.6 0 0 1-1.6 1.6H8.2a1.6 1.6 0 0 1-1.6-1.6v-9.6L10 6.2Z',
		line: 'M6.6 14h10.8'
	},
	chocolate: {
		fill: 'M4.4 5.4h15.2v13.2H4.4Z',
		line: 'M4.4 10h15.2M4.4 14h15.2M9.6 5.4v13.2M14.4 5.4v13.2'
	},
	pot: {
		fill: 'M5 9.4h14v6.8a4.4 4.4 0 0 1-4.4 4.4H9.4A4.4 4.4 0 0 1 5 16.2Z',
		line: 'M2.8 9.4h18.4M8.6 6.4c0-1.2.9-2.2 2-2.2M13.4 6.4c0-1.2.9-2.2 2-2.2'
	},
	bowl: {
		fill: 'M3.4 11.4h17.2c0 4.8-3.8 8.6-8.6 8.6s-8.6-3.8-8.6-8.6Z',
		line: 'M12 8.4V5M9.4 6.6 12 5l2.6 1.6'
	}
} satisfies Record<string, IconArt>;

export type IconKey = keyof typeof ICONS;

/** Nothing matched a keyword: fall back to something true of the whole category. */
const BY_CATEGORY: Record<IngredientCategory, IconKey> = {
	vegetable: 'leafy',
	fruit: 'apple',
	protein: 'beef',
	dairy: 'milk',
	grain: 'wheat',
	legume: 'beans',
	nut: 'almond',
	spice: 'jar',
	other: 'bowl'
};

/**
 * Ordered substring rules against the canonical (English, snake_case) key.
 * Order matters: `sweet_potato` must reach `potato` before `sugar` claims
 * "sweet", and `coconut_milk` must be fruit before `milk` makes it dairy.
 */
const RULES: [readonly string[], IconKey][] = [
	// Compounds that would otherwise be mis-claimed by a shorter rule.
	[['coconut'], 'coconut'],
	[['peanut_butter', 'peanut'], 'peanut'],
	[['sesame_oil', 'olive_oil', 'vegetable_oil', 'sunflower_oil', 'rapeseed_oil', 'oil'], 'bottle'],
	[['tomato_puree', 'tomato_sauce', 'ketchup', 'passata'], 'bottle'],
	// "oyster sauce" and "fish sauce" are bottles, not seafood; "egg plant" is not an egg.
	[['sauce', 'paste', 'vinegar', 'mustard', 'mayonnaise', 'ketchup'], 'bottle'],
	[['egg_plant', 'eggplant', 'aubergine'], 'aubergine'],
	[['sweet_potato', 'potato'], 'potato'],
	[['spring_onion', 'scallion', 'shallot', 'onion'], 'onion'],

	// Vegetables
	[['garlic'], 'garlic'],
	[['carrot'], 'carrot'],
	[['tomato'], 'tomato'],
	[['chilli', 'chili', 'chile', 'jalapeno', 'scotch_bonnet', 'harissa', 'cayenne', 'paprika'], 'chilli'],
	[['pepper_bell', 'bell_pepper', 'red_pepper', 'green_pepper', 'yellow_pepper', 'capsicum'], 'chilli'],
	[['cabbage', 'lettuce', 'sprout', 'pak_choi', 'bok_choy', 'kale', 'chard', 'spinach', 'rocket', 'arugula'], 'leafy'],
	[['mushroom', 'shiitake', 'porcini'], 'mushroom'],
	[['corn', 'maize', 'polenta'], 'corn'],
	[['broccoli', 'cauliflower', 'romanesco'], 'broccoli'],
	[['cucumber', 'courgette', 'zucchini', 'gherkin', 'pickle'], 'cucumber'],
	[['aubergine', 'eggplant'], 'aubergine'],
	[['beetroot', 'beet', 'turnip', 'radish', 'ginger', 'turmeric', 'parsnip', 'swede'], 'beet'],
	[['pumpkin', 'squash', 'butternut', 'melon'], 'pumpkin'],
	[['celery', 'asparagus', 'leek', 'rhubarb', 'fennel'], 'pod'],

	// Fruit
	[['lemon', 'lime', 'orange', 'citrus', 'grapefruit', 'clementine', 'mandarin', 'yuzu'], 'citrus'],
	[['apple', 'pear', 'quince'], 'apple'],
	[['berry', 'berries', 'currant', 'cherry'], 'berry'],
	[['banana', 'plantain'], 'banana'],
	[['grape', 'raisin', 'sultana'], 'grape'],
	[['avocado'], 'avocado'],
	[['olive'], 'olive'],
	[['peach', 'apricot', 'plum', 'mango', 'nectarine', 'fig', 'date', 'prune'], 'apple'],

	// Protein
	[['chicken', 'turkey', 'duck', 'poultry'], 'chicken'],
	[['bacon', 'pancetta', 'prosciutto', 'ham', 'lardon'], 'bacon'],
	[['sausage', 'chorizo', 'salami', 'pepperoni', 'frankfurter'], 'sausage'],
	[['prawn', 'shrimp', 'lobster', 'crab', 'crayfish'], 'shrimp'],
	[['fish', 'salmon', 'tuna', 'cod', 'haddock', 'anchov', 'mackerel', 'sardine', 'trout', 'squid', 'octopus', 'mussel', 'clam', 'oyster', 'scallop'], 'fish'],
	[['beef', 'steak', 'pork', 'lamb', 'mince', 'veal', 'venison', 'brisket', 'ribs', 'meat'], 'beef'],
	[['stock', 'broth', 'bouillon'], 'pot'],

	// Dairy & egg
	[['egg'], 'egg'],
	[['cheese', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'gruyere', 'ricotta', 'halloumi', 'mascarpone', 'brie'], 'cheese'],
	[['butter', 'ghee', 'margarine'], 'butter'],
	[['cream', 'creme'], 'cream'],
	[['yogurt', 'yoghurt', 'curd'], 'yogurt'],
	[['milk'], 'milk'],

	// Grain
	[['bread', 'baguette', 'pita', 'brioche', 'crumpet', 'tortilla', 'naan', 'bun'], 'bread'],
	[['rice', 'quinoa', 'couscous', 'bulgur', 'barley', 'oat', 'semolina'], 'riceBowl'],
	[['noodle', 'pasta', 'spaghetti', 'macaroni', 'lasagne', 'penne', 'tagliatelle', 'linguine', 'vermicelli', 'udon'], 'noodles'],
	[['flour', 'cornstarch', 'cornflour', 'starch', 'yeast', 'baking_powder', 'baking_soda'], 'flour'],
	[['pastry', 'filo', 'phyllo', 'crust', 'biscuit', 'cracker', 'crumb'], 'pastry'],
	[['wheat', 'bran', 'grain', 'cereal'], 'wheat'],

	// Legume
	[['tofu', 'tempeh', 'soy', 'miso', 'edamame'], 'tofu'],
	[['bean', 'lentil', 'chickpea', 'pea', 'dal', 'dhal'], 'beans'],

	// Nut & seed
	[['seed', 'sesame', 'poppy', 'linseed', 'flax'], 'seeds'],
	[['almond', 'walnut', 'cashew', 'pistachio', 'hazelnut', 'pecan', 'macadamia', 'nut'], 'almond'],

	// Spice
	[['cinnamon', 'bark'], 'cinnamon'],
	[['parsley', 'basil', 'mint', 'thyme', 'oregano', 'rosemary', 'coriander', 'cilantro', 'dill', 'sage', 'bay', 'tarragon', 'chive', 'herb', 'lemongrass'], 'leaf'],
	[['pepper', 'salt', 'cumin', 'nutmeg', 'clove', 'cardamom', 'saffron', 'masala', 'curry', 'allspice', 'spice', 'seasoning', 'anise', 'fenugreek', 'sumac', 'za_atar'], 'jar'],

	// Pantry
	[['chocolate', 'cocoa', 'cacao'], 'chocolate'],
	[['sugar', 'syrup', 'molasses', 'caramel', 'sweetener'], 'sugar'],
	[['honey', 'water', 'juice', 'nectar'], 'drop'],
	[['vanilla', 'extract', 'essence'], 'drop'],
	[['wine', 'vinegar', 'sauce', 'rum', 'brandy', 'sherry', 'beer', 'cider', 'liqueur', 'mustard', 'mayonnaise', 'tabasco', 'sriracha'], 'bottle']
];

const cache = new Map<string, IconKey>();

/**
 * Resolve an ingredient to its icon. Keyed on `canonical_key`, never on the
 * displayed name, so a Japanese or Arabic mosaic gets the same artwork.
 */
export function iconFor(canonicalKey: string, category: IngredientCategory): IconKey {
	const key = `${canonicalKey}\u0000${category}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const needle = canonicalKey.toLowerCase();
	let found: IconKey | undefined;
	for (const [terms, icon] of RULES) {
		if (terms.some((term) => needle.includes(term))) {
			found = icon;
			break;
		}
	}

	const result = found ?? BY_CATEGORY[category] ?? 'bowl';
	cache.set(key, result);
	return result;
}

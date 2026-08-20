/**
 * Sources hand us one blob of prose whose steps are numbered inline, and they
 * do not agree on where to start — TheMealDB rows begin at "0.". Splitting on
 * the source's own markers and renumbering from 1 turns that into a method
 * list you can hold your place in while cooking.
 *
 * Extracted from the recipe page component so it can be unit-tested: the regex
 * carries a lookbehind, an optional `step` prefix, three terminator characters
 * and a two-digit cap, and the fallback heuristic is non-obvious.
 */
export function splitSteps(text: string): string[] {
	const normalised = text.replace(/\r\n?/g, '\n').trim();
	if (!normalised) return [];

	const marker = /(?:^|\n|(?<=[.!?])[ \t]+)(?:step[ \t]*)?\d{1,2}[ \t]*[.):][ \t]+/gi;
	const numbered = normalised
		.split(marker)
		.map((step) => step.trim())
		.filter(Boolean);
	// Two segments usually means a stray "2. " inside a sentence, not a list.
	if (numbered.length >= 3) return numbered;

	const lines = normalised
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.length > 1 ? lines : [normalised];
}

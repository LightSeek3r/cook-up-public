/**
 * Food artwork: Noto Emoji colour SVGs (Apache-2.0, see ./LICENSE), plus the
 * `x-*` glyphs drawn for foods Unicode has no emoji for. A key is the file
 * name without `.svg`: lowercase hex codepoints joined by `-`, or `x-<name>`.
 *
 * Eager `?url` glob, like the font imports: Vite hashes each file into an
 * immutable asset, so the browser loads only the emoji a page renders, and
 * only once. `no-inline` because an eager glob would otherwise put every file
 * under 4 KB into the JS chunk as a `data:` URL (measured: 78 files, a 232 KB
 * chunk on every page that shows an ingredient), used or not.
 */
const FILES = import.meta.glob<string>('./*.svg', {
	eager: true,
	query: '?url&no-inline',
	import: 'default'
});

export type EmojiKey = string;

/** The generic bowl, also the `other` category glyph. */
export const FALLBACK_EMOJI: EmojiKey = '1f963';

export const EMOJI_KEYS: readonly EmojiKey[] = Object.keys(FILES).map((path) =>
	path.slice(2, -'.svg'.length)
);

export function hasEmoji(key: EmojiKey): boolean {
	return `./${key}.svg` in FILES;
}

/** Never a broken image: an unknown key renders the generic bowl. */
export function emojiUrl(key: EmojiKey): string {
	return FILES[`./${key}.svg`] ?? FILES[`./${FALLBACK_EMOJI}.svg`];
}

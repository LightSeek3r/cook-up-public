/**
 * Responsive candidates for a hotlinked Wikimedia Commons photo.
 *
 * Commons only renders a fixed set of thumbnail widths (others answer 400 "Use
 * thumbnail sizes"), and never wider than the original, so the widths below are
 * the standard steps the stored URLs can safely go down to. Stage 08 asked
 * MediaWiki for 640px: it answered with a 960px thumbnail when the original was
 * large enough, and with the original file itself when it was not, which makes
 * that original at least 640px wide (the reported width), so 330 and 500 exist.
 */
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/';
const STEPS = [330, 500] as const;

const THUMB = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/([0-9a-f]\/[0-9a-f]{2}\/[^/]+)\/(\d+)px-([^/]+)$/;
const ORIGINAL = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+\.(?:jpe?g|png)))$/i;

const thumb = (path: string, file: string, width: number) => `${COMMONS}thumb/${path}/${width}px-${file}`;

/** `srcset` for a stored image URL, or undefined when it is not a shape known to be safe. */
export function commonsSrcset(url: string, width: number | null): string | undefined {
	const t = THUMB.exec(url);
	const o = t ? null : ORIGINAL.exec(url);
	if (!t && !o) return undefined;
	const [path, file, own] = t ? [t[1], t[3], Number(t[2])] : [o![1], o![2], width ?? 0];
	const smaller = STEPS.filter((w) => w < own);
	if (!smaller.length) return undefined;
	return [...smaller.map((w) => `${thumb(path, file, w)} ${w}w`), `${url} ${own}w`].join(', ');
}

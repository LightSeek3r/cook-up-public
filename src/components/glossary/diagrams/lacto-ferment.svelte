<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Open jar w wide, mouth at `top`, base at `bottom`; the neck is 8 narrower than the body. */
	const jar = (cx: number, top: number, bottom: number, w: number) => {
		const h = w / 2;
		const n = h - 4;
		return (
			`M${cx - n} ${top}V${top + 3}C${cx - n} ${top + 6} ${cx - h} ${top + 5} ${cx - h} ${top + 10}` +
			`V${bottom - 5}q0 5 5 5H${cx + h - 5}q5 0 5-5V${top + 10}` +
			`C${cx + h} ${top + 5} ${cx + n} ${top + 6} ${cx + n} ${top + 3}V${top}`
		);
	};
	/** Screw lid sitting on that jar's mouth. */
	const lid = (cx: number, top: number, w: number) => {
		const n = w / 2 - 4;
		return `M${cx - n - 1.5} ${top + 1}v-5.5q0-1.5 1.5-1.5h${2 * n}q1.5 0 1.5 1.5v5.5z`;
	};

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;
	/** Brine from that surface down to the bottom of a jar w = n*8 wide. */
	const brine = (cx: number, y: number, bottom: number, n: number) =>
		`${wave(cx - n * 4, y, n)}V${bottom - 5}q0 5-5 5H${cx - n * 4 + 5}q-5 0-5-5z`;

	/** Three upright spears packed side by side, each sw wide, from about `top` to just above `bottom`. */
	const spears = (cx: number, top: number, bottom: number, sw: number) =>
		[-1, 0, 1].map((k) => {
			const y = top + (k ? 2 : 0);
			return { x: cx + k * (sw + 1.5) - sw / 2, y, h: bottom - 1.5 - y };
		});

	const W = 32;
	const TOP = 78;
	const BOTTOM = 136;
	const SURFACE = 90;

	const salt: [number, number][] = [
		[22, 56],
		[26, 63],
		[20, 69],
		[25, 74],
		[22, 82]
	];
	/** Gas: bubbles rising in the brine of stage 3 and escaping past its lid. */
	const rising: [number, number, number][] = [
		[131.4, 125.5, 1.2],
		[160.6, 113.5, 1.2],
		[131.4, 103, 1.2],
		[154, 90, 1.5]
	];
	const escaping: [number, number, number][] = [
		[163, 72, 1.8],
		[167, 64, 1.4],
		[163, 56, 2.2]
	];
</script>

{#snippet slices(cx: number, top: number, bottom: number, sw: number)}
	<g class="c-primary">
		{#each spears(cx, top, bottom, sw) as s (s.x)}
			<rect x={s.x} y={s.y} width={sw} height={s.h} rx={sw / 2} class="tint" />
			<path d={`M${s.x + sw / 2} ${s.y + sw / 2 + 1}V${s.y + s.h - sw / 2 - 1}`} class="fine dashed" />
		{/each}
	</g>
{/snippet}

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[42, 20]} to={[76, 20]} />
		<Arrow from={[100, 20]} to={[134, 20]} />
		<Arrow from={[158, 20]} to={[194, 20]} />
	</g>

	<!-- 1: salted vegetables pressed down tight in the jar -->
	{@render slices(30, 98, BOTTOM, 8)}
	<path d={jar(30, TOP, BOTTOM, W)} />
	<g class="solid" stroke="none">
		{#each salt as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="1.3" />
		{/each}
	</g>
	<g class="c-accent">
		<rect x="22" y="91.5" width="16" height="4.5" rx="2" class="tint" />
		<path d="M31 91.5L35 52" class="bold" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[54, 70]} to={[54, 96]} />
	</g>

	<!-- 2: brine poured over, a weight holding everything under it -->
	<path d={brine(88, SURFACE, BOTTOM, 4)} class="c-accent tint" stroke="none" />
	{@render slices(88, 98, BOTTOM, 8)}
	<rect x="76" y="92.5" width="24" height="5" rx="2" class="tint" />
	<path d={wave(72, SURFACE, 4)} class="c-accent" />
	<path d={jar(88, TOP, BOTTOM, W)} />

	<!-- 3: left at room temperature, the lid loose so the gas can bubble out -->
	<path d={brine(146, SURFACE, BOTTOM, 4)} class="c-accent tint" stroke="none" />
	{@render slices(146, 98, BOTTOM, 8)}
	<rect x="134" y="92.5" width="24" height="5" rx="2" class="tint" />
	<path d={wave(130, SURFACE, 4)} class="c-accent" />
	<path d={jar(146, TOP, BOTTOM, W)} />
	<path d={lid(146, TOP, W)} transform="rotate(-12 132.5 79)" />
	<g class="c-accent fine">
		{#each [...rising, ...escaping] as [cx, cy, r] (`${cx} ${cy}`)}
			<circle {cx} {cy} {r} />
		{/each}
	</g>

	<!-- 4: closed and moved to the cold of the fridge -->
	<rect x="182" y="40" width="48" height="100" rx="4" />
	<rect x="186" y="44" width="40" height="92" rx="2" class="fine" />
	<path d="M186 66h40" />
	<g class="c-accent">
		<path d="M206 48v14M199.9 51.5l12.2 7M199.9 58.5l12.2-7" />
		<path d="M203.5 48.5l2.5 2 2.5-2M203.5 61.5l2.5-2 2.5 2" class="fine" />
	</g>
	<path d={brine(206, 108, 135, 3)} class="c-accent tint" stroke="none" />
	{@render slices(206, 114, 135, 6)}
	<rect x="197" y="109.5" width="18" height="4" rx="1.5" class="tint" />
	<path d={wave(194, 108, 3)} class="c-accent" />
	<path d={jar(206, 98, 135, 24)} />
	<path d={lid(206, 98, 24)} />

	<Mark x={30} y={20} n={1} />
	<Mark x={88} y={20} n={2} />
	<Mark x={146} y={20} n={3} />
	<Mark x={206} y={20} n={4} />
</DiagramFrame>

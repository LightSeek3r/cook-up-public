<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const r = (n: number) => Math.round(n * 100) / 100;

	/** Oblique depth, as in the other knife-cut drawings: going a into the picture moves (a/2, -a/2). */
	const D = 0.5;
	const m = (a: number, b = 0) => `${r(D * a)} ${r(-D * a - b)}`;

	/** Leaf lying flat, seen at a slant: tips at cx +- a, b the half-height of the lens. */
	const leaf = (cx: number, cy: number, a: number, b: number) =>
		`M${cx - a} ${cy}q${a + 3} ${-2 * b} ${2 * a} 0q${-a - 3} ${2 * b} ${-2 * a} 0z`;
	/** Midrib and three pairs of side veins. */
	const veins = (cx: number, cy: number, a: number) => {
		let d = `M${cx - a + 3} ${cy}h${2 * a - 6}`;
		for (const f of [-0.45, 0, 0.45]) {
			const x = r(cx + f * a);
			d += `M${x} ${cy}l3-2.2M${x} ${cy}l2.2 2.2`;
		}
		return d;
	};
	/** The stack, largest leaf at the bottom, opened up a little so every leaf shows. */
	const stack = [0, 1, 2, 3].map((i) => ({ cy: 124 - 7.5 * i, a: 23 - 3 * i }));

	/**
	 * Point on the round cross-section of a roll lying along x, centre (cx, cy), radius R, at angle t
	 * degrees in its own plane: 0 straight back, 90 up, 180 straight forward.
	 */
	const at = (cx: number, cy: number, R: number, t: number) => {
		const c = Math.cos((t * Math.PI) / 180);
		const s = Math.sin((t * Math.PI) / 180);
		return `${r(cx + D * R * c)} ${r(cy - D * R * c - R * s)}`;
	};
	/** Sampled arc of that cross-section from angle t0 to t1, continuing the current path. */
	const arc = (cx: number, cy: number, R: number, t0: number, t1: number) => {
		let d = '';
		for (let i = 0; i <= 24; i++) d += `L${at(cx, cy, R, t0 + ((t1 - t0) * i) / 24)}`;
		return d;
	};
	/** Where the roll's top and bottom outlines touch each cross-section (tan t = 1 / D). */
	const TOP = (Math.atan(1 / D) * 180) / Math.PI;
	const BOTTOM = TOP + 180;
	/** Roll outline from its left end (centre x0) to its right end (centre x1). */
	const roll = (x0: number, x1: number, cy: number, R: number) =>
		`M${at(x0, cy, R, BOTTOM)}${arc(x0, cy, R, BOTTOM, TOP)}${arc(x1, cy, R, TOP, BOTTOM - 360)}z`;
	/** A cut round the roll at x: its front half, the half in view. */
	const ring = (x: number, cy: number, R: number) => `M${at(x, cy, R, BOTTOM)}${arc(x, cy, R, BOTTOM, TOP)}`;
	/** The rolled leaves seen end on. */
	const end = (x: number, cy: number, R: number) => `M${at(x, cy, R, 0)}${arc(x, cy, R, 0, 360)}z`;
	const spiral = (x: number, cy: number, R: number) => {
		let d = `M${x} ${cy}`;
		for (let i = 1; i <= 96; i++) d += `L${at(x, cy, (R * 0.85 * i) / 96, i * 15)}`;
		return d;
	};

	/** Chef's knife lying along the depth, edge down and tip forward; (x, y) is the edge under the tip. */
	const blade = (x: number, y: number) => `M${x} ${y - 3}q${m(1.5, -3)} ${m(8, -3)}l${m(28)}v-9z`;
	const handle = (x: number, y: number) =>
		`M${r(x + D * 36)} ${r(y - D * 36 - 1.5)}l${m(15)}v-5.5l${m(-15)}z`;

	/** Dimension line across the front with end ticks. */
	const dimW = (x: number, y: number, w: number) => `M${x} ${y}h${w}M${x} ${y - 2}v4M${x + w} ${y - 2}v4`;

	const R = 9;
	const CY = 118;

	/** Short curled strips heaped into a loose mound. */
	const ribbons = [
		'M182 127c3-5 8-6 11-3',
		'M194 128c1-5 6-7 10-5',
		'M207 127c4-3 8-2 10 1',
		'M219 125c3-2 7 0 9 3',
		'M186 118c4-3 9-2 10 2',
		'M200 121c-1-5 3-9 8-8',
		'M212 115c4 0 8 3 8 7',
		'M193 110c3-3 8-3 10 1',
		'M206 107c3-2 7-1 8 3'
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[45, 28]} to={[78, 28]} />
		<Arrow from={[102, 28]} to={[136, 28]} />
		<Arrow from={[160, 28]} to={[194, 28]} />
	</g>

	<!-- the board -->
	<rect x="8" y="136" width="224" height="7" rx="3.5" class="c-muted" />

	<!-- 1: leaves stacked, the largest at the bottom, the tough stem cut off -->
	<g class="c-accent">
		{#each stack as l (l.a)}
			<path d={leaf(34, l.cy, l.a, 3.4)} class="tint" />
			<path d={veins(34, l.cy, l.a)} class="fine" />
		{/each}
		<path d="M58.5 123.5q2.5-.3 4.5-3" class="fine dashed" />
	</g>

	<!-- 2: the stack rolled up tight into a cigar -->
	<g class="c-accent">
		<path d={roll(76, 108, CY, R)} class="tint" />
		<path d={end(108, CY, R)} class="tint" />
		<path d={spiral(108, CY, R)} class="fine" />
	</g>
	<g class="c-muted fine">
		<Arrow d={`M${at(108, CY, 13, -50)}${arc(108, CY, 13, -50, 110)}`} />
	</g>

	<!-- 3: the roll held and sliced across into thin ribbons -->
	<g class="c-accent">
		<path d={roll(128, 166, CY, R)} class="tint" />
		<path d={end(166, CY, R)} class="tint" />
		<path d={spiral(166, CY, R)} class="fine" />
		<path d={`${ring(154, CY, R)}${ring(160, CY, R)}`} class="fine" />
	</g>
	<path d={blade(146, 108)} class="c-accent tint" />
	<path d={handle(146, 108)} class="solid" />
	<path d={dimW(152, 132, 6)} class="c-muted fine" />

	<!-- 4: the ribbons fluffed apart -->
	<g class="c-accent bold">
		{#each ribbons as d (d)}
			<path {d} />
		{/each}
	</g>
	<g class="c-muted fine">
		<Arrow from={[196, 98]} to={[188, 88]} bend={-3} />
		<Arrow from={[214, 96]} to={[223, 87]} bend={3} />
	</g>

	<Mark x={33} y={28} n={1} />
	<Mark x={90} y={28} n={2} />
	<Mark x={148} y={28} n={3} />
	<Mark x={206} y={28} n={4} />
</DiagramFrame>

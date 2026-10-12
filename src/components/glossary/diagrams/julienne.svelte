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

	/** Oblique depth: going a into the picture and b straight up moves (DX*a, -DY*a - b). */
	const DX = 0.5;
	const DY = 0.5;
	const m = (a: number, b = 0) => `${r(DX * a)} ${r(-DY * a - b)}`;

	/** Box outline: front face w wide and h tall, l deep, (x, y) its front bottom-left corner. */
	const box = (x: number, y: number, w: number, h: number, l: number) =>
		`M${x} ${y}h${w}l${m(l)}v${-h}h${-w}l${m(-l)}z`;
	/** The three edges inside that outline. */
	const edges = (x: number, y: number, w: number, h: number, l: number) =>
		`M${x} ${y - h}h${w}v${h}M${x + w} ${y - h}l${m(l)}`;
	/** Cuts: `cols` columns across the front and over the top, `rows` layers across the front and side. */
	const cuts = (x: number, y: number, w: number, h: number, l: number, cols: number, rows: number) => {
		let d = '';
		for (let i = 1; i < cols; i++) d += `M${r(x + (w * i) / cols)} ${y}v${-h}l${m(l)}`;
		for (let j = 1; j < rows; j++) d += `M${x} ${r(y - (h * j) / rows)}h${w}l${m(l)}`;
		return d;
	};
	/**
	 * Plank standing on edge, front end t wide and h tall, l deep, with the next plank a gap g to its
	 * right: that one hides its right face except a strip along the front and one along the top.
	 */
	const plank = (x: number, y: number, t: number, h: number, l: number, g: number) =>
		`M${x} ${y}h${t}l${m(g / DX)}V${y - h}l${m(l - g / DX)}v${r((-g * DY) / DX)}h${-t}l${m(-l)}z`;

	/** Dimension lines with end ticks: across the front (w), and along the depth (l). */
	const dimW = (x: number, y: number, w: number) => `M${x} ${y}h${w}M${x} ${y - 2}v4M${x + w} ${y - 2}v4`;
	/** Half of a 4-long end tick square to a depth line. */
	const TX = r((2 * DY) / Math.hypot(DX, DY));
	const TY = r((2 * DX) / Math.hypot(DX, DY));
	const tick = (x: number, y: number) => `M${r(x - TX)} ${r(y - TY)}l${2 * TX} ${2 * TY}`;
	const dimL = (x: number, y: number, l: number) =>
		`M${x} ${y}l${m(l)}${tick(x, y)}${tick(x + DX * l, y - DY * l)}`;

	/** Chef's knife lying along the depth, edge down and tip forward; (x, y) is the edge under the tip. */
	const blade = (x: number, y: number) => `M${x} ${y - 3}q${m(1.5, -3)} ${m(8, -3)}l${m(28)}v-9z`;
	const handle = (x: number, y: number) =>
		`M${r(x + DX * 36)} ${r(y - DY * 36 - 1.5)}l${m(15)}v-5.5l${m(-15)}z`;

	/** Carrot side on, thick end left, underside trimmed flat; (x, y) the left end of the flat. */
	const carrot = (x: number, y: number) =>
		`M${x + 4} ${y - 21}c16 0 36 8 48 19q1.5 2-1 2H${x + 4}q-4 0-4-4v-13q0-4 4-4z`;
	/** One narrow leaf of the carrot top, growing from (x, y), leaning by dx over its height h. */
	const frond = (x: number, y: number, dx: number, h: number) =>
		`M${x} ${y}c${r(dx * 0.2 - 3)} ${r(-h * 0.45)} ${r(dx - 2)} ${r(-h * 0.8)} ${dx} ${-h}c1 ${r(h * 0.35)} ${r(-dx * 0.3)} ${r(h * 0.75)} ${-dx} ${h}z`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[48, 28]} to={[79, 28]} />
		<Arrow from={[103, 28]} to={[134, 28]} />
		<Arrow from={[158, 28]} to={[190, 28]} />
	</g>

	<!-- the board -->
	<rect x="8" y="136" width="224" height="7" rx="3.5" class="c-muted" />

	<!-- 1: a carrot with a thin slice trimmed off its underside, so it lies flat -->
	<g class="c-accent">
		<path d={frond(15, 107, -6, 19)} class="tint" />
		<path d={frond(17, 107, 1, 23)} class="tint" />
		<path d={frond(19, 107, 8, 17)} class="tint" />
	</g>
	<g class="c-primary">
		<path d={carrot(10, 128)} class="tint" />
		<path d="M24 109.5q-1.5 3.5 0 7M35 112q-1.5 3 0 6M46 117.5q-1 2.5 0 5" class="fine" />
		<path d="M11 128c8 5 34 5 49-1" class="fine dashed" />
	</g>

	<!-- 2: cut into planks, as long as the carrot -->
	<g class="c-primary">
		<path d={plank(66, 128, 7, 21, 52, 3)} class="tint" />
		<path d={edges(66, 128, 7, 21, 52)} class="fine" />
		<path d={plank(76, 128, 7, 21, 52, 3)} class="tint" />
		<path d={edges(76, 128, 7, 21, 52)} class="fine" />
		<path d={box(86, 128, 7, 21, 52)} class="tint" />
		<path d={edges(86, 128, 7, 21, 52)} class="fine" />
	</g>
	<g class="c-muted fine">
		<path d={dimW(66, 132, 7)} />
		<path d={dimL(97, 131, 52)} />
	</g>

	<!-- 3: the planks stacked with their edges lined up -->
	<g class="c-primary">
		<path d={box(129, 128, 21, 14, 52)} class="tint" />
		<path d={edges(129, 128, 21, 14, 52)} class="fine" />
		<path d={cuts(129, 128, 21, 14, 52, 1, 2)} class="fine" />
		<path d={box(129, 91, 21, 7, 52)} class="tint" />
		<path d={edges(129, 91, 21, 7, 52)} class="fine" />
	</g>
	<path d="M129 92.5V112.5M150 92.5V112.5" class="c-muted fine dashed" />

	<!-- 4: the stack cut lengthwise into thin sticks -->
	<g class="c-primary">
		<path d={box(182, 128, 21, 21, 52)} class="tint" />
		<path d={edges(182, 128, 21, 21, 52)} class="fine" />
		<path d={cuts(182, 128, 21, 21, 52, 3, 3)} class="fine" />
	</g>
	<path d={blade(189, 93)} class="c-accent tint" />
	<path d={handle(189, 93)} class="solid" />
	<path d={dimW(182, 132, 7)} class="c-muted fine" />

	<Mark x={36} y={28} n={1} />
	<Mark x={91} y={28} n={2} />
	<Mark x={146} y={28} n={3} />
	<Mark x={202} y={28} n={4} />
</DiagramFrame>

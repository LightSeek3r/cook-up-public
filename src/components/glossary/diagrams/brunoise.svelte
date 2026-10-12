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
	/** Cuts parallel to the front: `n` slices over the top and down the side. */
	const slices = (x: number, y: number, w: number, h: number, l: number, n: number) => {
		let d = '';
		for (let i = 1; i < n; i++) {
			const a = (l * i) / n;
			d += `M${r(x + DX * a)} ${r(y - h - DY * a)}h${w}v${h}`;
		}
		return d;
	};
	/** Small cube of side s, (x, y) its front bottom-left corner. */
	const cube = (x: number, y: number, s: number) => box(x, y, s, s, s);

	/** Dimension lines with end ticks: across the front (w) and up the front (h). */
	const dimW = (x: number, y: number, w: number) => `M${x} ${y}h${w}M${x} ${y - 2}v4M${x + w} ${y - 2}v4`;
	const dimH = (x: number, y: number, h: number) => `M${x} ${y}v${-h}M${x - 2} ${y}h4M${x - 2} ${y - h}h4`;

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
		<Arrow from={[48, 28]} to={[81, 28]} />
		<Arrow from={[105, 28]} to={[137, 28]} />
		<Arrow from={[161, 28]} to={[193, 28]} />
	</g>

	<!-- the board -->
	<rect x="8" y="136" width="224" height="7" rx="3.5" class="c-muted" />

	<!-- 1: the carrot trimmed flat underneath and cut into thin planks -->
	<g class="c-accent">
		<path d={frond(19, 107, -6, 19)} class="tint" />
		<path d={frond(21, 107, 1, 23)} class="tint" />
		<path d={frond(23, 107, 8, 17)} class="tint" />
	</g>
	<g class="c-primary">
		<path d={carrot(14, 128)} class="tint" />
		<path d="M14 121H59.7M14 114H47.5" class="fine" />
		<path d="M15 128c8 5 34 5 49-1" class="fine dashed" />
	</g>
	<path d={dimH(10, 128, 7)} class="c-muted fine" />

	<!-- 2: the planks cut into square sticks -->
	<g class="c-primary">
		<path d={box(71, 128, 21, 21, 44)} class="tint" />
		<path d={edges(71, 128, 21, 21, 44)} class="fine" />
		<path d={cuts(71, 128, 21, 21, 44, 3, 3)} class="fine" />
	</g>
	<path d={blade(78, 93)} class="c-accent tint" />
	<path d={handle(78, 93)} class="solid" />
	<path d={dimW(71, 132, 7)} class="c-muted fine" />

	<!-- 3: the sticks gathered into a bundle and turned a quarter turn -->
	<g class="c-primary">
		<path d={box(124, 128, 38, 21, 21)} class="tint" />
		<path d={edges(124, 128, 38, 21, 21)} class="fine" />
		<path d={cuts(124, 128, 38, 21, 21, 1, 3)} class="fine" />
		<path d={slices(124, 128, 38, 21, 21, 3)} class="fine" />
	</g>
	<g class="c-muted fine">
		<Arrow d="M139.5 83A14 5.5 0 1 0 166.5 83" />
	</g>

	<!-- 4: the bundle sliced across into tiny cubes -->
	<g class="c-primary">
		<path d={box(178, 128, 21, 21, 21)} class="tint" />
		<path d={edges(178, 128, 21, 21, 21)} class="fine" />
		<path d={cuts(178, 128, 21, 21, 21, 3, 3)} class="fine" />
		<path d={slices(178, 128, 21, 21, 21, 3)} class="fine" />
		<path d={cube(212, 128, 7)} class="tint" />
		<path d={edges(212, 128, 7, 7, 7)} class="fine" />
		<path d={cube(220.5, 116.5, 7)} class="tint" />
		<path d={edges(220.5, 116.5, 7, 7, 7)} class="fine" />
	</g>
	<path d={blade(192, 90)} class="c-accent tint" />
	<path d={handle(192, 90)} class="solid" />
	<path d={dimW(178, 132, 7)} class="c-muted fine" />

	<Mark x={36} y={28} n={1} />
	<Mark x={93} y={28} n={2} />
	<Mark x={149} y={28} n={3} />
	<Mark x={205} y={28} n={4} />
</DiagramFrame>

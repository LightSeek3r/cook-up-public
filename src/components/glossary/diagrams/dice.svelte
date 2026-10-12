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
	/**
	 * Slab standing on edge, front end t wide and h tall, l deep, with the next slab a gap g to its
	 * right: that one hides its right face except a strip along the front and one along the top.
	 */
	const slab = (x: number, y: number, t: number, h: number, l: number, g: number) =>
		`M${x} ${y}h${t}l${m(g / DX)}V${y - h}l${m(l - g / DX)}v${r((-g * DY) / DX)}h${-t}l${m(-l)}z`;

	/** Dimension lines with end ticks: across the front (w) and up the front (h). */
	const dimW = (x: number, y: number, w: number) => `M${x} ${y}h${w}M${x} ${y - 2}v4M${x + w} ${y - 2}v4`;
	const dimH = (x: number, y: number, h: number) => `M${x} ${y}v${-h}M${x - 2} ${y}h4M${x - 2} ${y - h}h4`;

	/** Chef's knife lying along the depth, edge down and tip forward; (x, y) is the edge under the tip. */
	const blade = (x: number, y: number) => `M${x} ${y - 3}q${m(1.5, -3)} ${m(8, -3)}l${m(28)}v-9z`;
	const handle = (x: number, y: number) =>
		`M${r(x + DX * 36)} ${r(y - DY * 36 - 1.5)}l${m(15)}v-5.5l${m(-15)}z`;

	/** Dice side: one front unit; the block is 2 x 2 x 4 of them. */
	const U = 9;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[48, 28]} to={[78, 28]} />
		<Arrow from={[102, 28]} to={[129, 28]} />
		<Arrow from={[153, 28]} to={[185, 28]} />
	</g>

	<!-- the board -->
	<rect x="8" y="136" width="224" height="7" rx="3.5" class="c-muted" />

	<!-- 1: the rounded vegetable trimmed down to a block with flat sides -->
	<g class="c-primary">
		<path d="M33 85C50 81 64 91 64 106 64 122 55 132 39 132 21 132 9 124 9 111 9 97 18 88 33 85z" class="fine dashed" />
		<path d="M12.5 100q2-1.8 4 0M56 125q2-1.8 4 0" class="fine" />
		<path d={box(18, 128, 2 * U, 2 * U, 4 * U)} class="tint" />
		<path d={edges(18, 128, 2 * U, 2 * U, 4 * U)} class="fine" />
	</g>

	<!-- 2: the block cut into slabs, each as thick as a dice -->
	<g class="c-primary">
		<path d={slab(70, 128, U, 2 * U, 4 * U, 4)} class="tint" />
		<path d={edges(70, 128, U, 2 * U, 4 * U)} class="fine" />
		<path d={box(83, 128, U, 2 * U, 4 * U)} class="tint" />
		<path d={edges(83, 128, U, 2 * U, 4 * U)} class="fine" />
	</g>
	<path d={dimW(70, 132, U)} class="c-muted fine" />

	<!-- 3: the slabs stacked and cut into sticks of the same width -->
	<g class="c-primary">
		<path d={box(122, 128, 2 * U, 2 * U, 4 * U)} class="tint" />
		<path d={edges(122, 128, 2 * U, 2 * U, 4 * U)} class="fine" />
		<path d={cuts(122, 128, 2 * U, 2 * U, 4 * U, 2, 2)} class="fine" />
	</g>
	<path d={blade(131, 96)} class="c-accent tint" />
	<path d={handle(131, 96)} class="solid" />
	<g class="c-muted fine">
		<path d={dimW(122, 132, U)} />
		<path d={dimH(118, 128, U)} />
	</g>

	<!-- 4: the sticks turned and cut across into cubes -->
	<g class="c-primary">
		<path d={box(168, 128, 3 * U, 2 * U, 2 * U)} class="tint" />
		<path d={edges(168, 128, 3 * U, 2 * U, 2 * U)} class="fine" />
		<path d={cuts(168, 128, 3 * U, 2 * U, 2 * U, 3, 2)} class="fine" />
		<path d={slices(168, 128, 3 * U, 2 * U, 2 * U, 2)} class="fine" />
		<path d={box(206, 128, U, U, U)} class="tint" />
		<path d={edges(206, 128, U, U, U)} class="fine" />
		<path d={box(215, 113, U, U, U)} class="tint" />
		<path d={edges(215, 113, U, U, U)} class="fine" />
	</g>
	<g class="c-muted fine">
		<Arrow d="M174.74 89.5A13 5 0 1 0 197.26 89.5" />
	</g>

	<Mark x={36} y={28} n={1} />
	<Mark x={90} y={28} n={2} />
	<Mark x={141} y={28} n={3} />
	<Mark x={197} y={28} n={4} />
</DiagramFrame>

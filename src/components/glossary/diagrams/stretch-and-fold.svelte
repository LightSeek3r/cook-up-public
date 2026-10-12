<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const RIM = 110;
	const R = 21;
	const D = 28;
	/** Dough meets the bowl wall this far below the rim. */
	const L = 12;
	const HW = +(R * Math.sqrt(1 - (L / D) ** 2)).toFixed(1);
	/** Height the stretched edge reaches in stage 1, and its ghost in stage 2. */
	const TIP = RIM - 42;

	/** Bowl cross-section: a rim line overhanging the wall and a half-ellipse body. */
	const bowl = (cx: number) => `M${cx - R - 3} ${RIM}h${2 * R + 6}M${cx - R} ${RIM}a${R} ${D} 0 0 0 ${2 * R} 0`;
	/** Dough top, wall to wall, domed up towards `peak` (the Bezier control point). */
	const dome = (cx: number, peak: number) => `M${cx - HW} ${RIM + L}Q${cx} ${peak} ${cx + HW} ${RIM + L}`;
	/** Closes a dough top that ends on the right wall back along the bowl, for the fill. */
	const under = (cx: number) => `A${R} ${D} 0 0 1 ${cx - HW} ${RIM + L}z`;

	/** Dough top with its right edge pulled up into a strand, tip at (cx + 12, TIP). */
	const stretched = (cx: number) =>
		`M${cx - HW} ${RIM + L}Q${cx - 10} ${RIM + 2} ${cx + 2} ${RIM + 5}` +
		`C${cx + 7} ${RIM - 6} ${cx + 8} ${RIM - 28} ${cx + 9} ${TIP}H${cx + 15}` +
		`C${cx + 16} ${RIM - 26} ${cx + 18} ${RIM - 6} ${cx + HW} ${RIM + L}`;

	/** Hand from above, two fingertips pinching at (x, y) with a 6-wide gap between them. */
	const pinch = (x: number, y: number) =>
		`M${x - 9} ${y - 12}V${y - 3}a3 3 0 0 0 6 0V${y - 12}M${x + 3} ${y - 12}V${y - 3}a3 3 0 0 0 6 0V${y - 12}` +
		`M${x - 9} ${y - 12}C${x - 10} ${y - 24} ${x + 10} ${y - 24} ${x + 9} ${y - 12}M${x - 4} ${y - 21}l6-11M${x + 7} ${y - 18}l6-11`;

	/** Water droplet, point up, 5 wide, anchored at its tip. */
	const drip = (x: number, y: number) => `M${x} ${y}c-.8 1.8-2.5 3.2-2.5 5a2.5 2.5 0 0 0 5 0c0-1.8-1.7-3.2-2.5-5z`;

	/** Hourglass glass 9x20 centred on (x, y); symmetric, so it survives the RTL mirror. */
	const glass = (x: number, y: number) =>
		`M${x - 4.5} ${y - 10}c0 6 4.5 6 4.5 10s-4.5 4-4.5 10M${x + 4.5} ${y - 10}c0 6-4.5 6-4.5 10s4.5 4 4.5 10`;

	const TOP = { cx: 150, cy: RIM + 4 };
	/** The four fold directions in the top-down view: from each side towards the middle. */
	const folds: [number, number, number, number][] = [
		[0, -14, 0, -5],
		[14, 0, 5, 0],
		[0, 14, 0, 5],
		[-14, 0, -5, 0]
	];

	const C4 = 205;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[36, 20]} to={[76, 20]} />
		<Arrow from={[102, 20]} to={[136, 20]} />
		<Arrow from={[162, 20]} to={[192, 20]} />
	</g>

	<!-- 1: a wet hand lifts one edge of the dough straight up -->
	<path d={`${stretched(32)}${under(32)}`} class="c-primary tint" stroke="none" />
	<path d={stretched(32)} class="c-primary" />
	<path d={bowl(32)} />
	<path d={pinch(44, TIP + 4)} />
	<g class="c-accent">
		<path d={drip(29, TIP - 12)} class="tint" />
		<path d={drip(25, TIP)} class="tint" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[60, RIM - 8]} to={[60, TIP + 2]} />
	</g>

	<!-- 2: the stretched edge folded over onto the middle -->
	<path d={`${dome(90, RIM)}${under(90)}`} class="c-primary tint" stroke="none" />
	<path d={dome(90, RIM)} class="c-primary" />
	<path
		d={`M108 ${RIM + 10}C105 ${RIM + 2} 94 ${RIM - 1} 82 ${RIM + 4}C80 ${RIM + 6} 82 ${RIM + 8} 85 ${RIM + 8}C93 ${RIM + 7} 103 ${RIM + 7} 108 ${RIM + 10}Z`}
		class="c-primary tint"
	/>
	<path d={bowl(90)} />
	<path
		d={`M92 ${RIM}C97 ${RIM - 8} 98 ${RIM - 28} 99 ${TIP}H105C106 ${RIM - 26} 108 ${RIM - 6} 110 ${RIM + 6}`}
		class="c-muted fine dashed"
	/>
	<g class="c-muted fine">
		<Arrow from={[102, TIP - 4]} to={[84, RIM - 1]} bend={10} />
	</g>

	<!-- 3: seen from above, the bowl turned a quarter and the next side folded, all four in turn -->
	<circle cx={TOP.cx} cy={TOP.cy} r="24" />
	<circle cx={TOP.cx} cy={TOP.cy} r="20.5" class="fine" />
	<path
		d={`M${TOP.cx - 15} ${TOP.cy}c0-9 6-15 15-15s15 6 15 15-6 15-15 15-15-6-15-15z`}
		class="c-primary tint"
	/>
	<g class="c-muted fine">
		{#each folds as [x1, y1, x2, y2] (`${x1} ${y1}`)}
			<Arrow from={[TOP.cx + x1, TOP.cy + y1]} to={[TOP.cx + x2, TOP.cy + y2]} />
		{/each}
		<Arrow d={`M140.1 ${TOP.cy - 27.3}A29 29 0 0 1 175.1 ${TOP.cy - 14.5}`} />
	</g>

	<!-- 4: smoother and rounder, resting under a cloth -->
	<path d={`${dome(C4, RIM - 8)}${under(C4)}`} class="c-primary tint" stroke="none" />
	<path d={dome(C4, RIM - 8)} class="c-primary" />
	<path d={bowl(C4)} />
	<path
		d={`M${C4 - 27} ${RIM + 12}C${C4 - 27} ${RIM + 3} ${C4 - 26} ${RIM - 3} ${C4 - 22} ${RIM - 4}Q${C4} ${RIM - 8} ${C4 + 22} ${RIM - 4}C${C4 + 26} ${RIM - 3} ${C4 + 27} ${RIM + 3} ${C4 + 27} ${RIM + 12}H${C4 + 25}C${C4 + 25} ${RIM + 4} ${C4 + 24} ${RIM} ${C4 + 21} ${RIM - 0.5}Q${C4} ${RIM - 4} ${C4 - 21} ${RIM - 0.5}C${C4 - 24} ${RIM} ${C4 - 25} ${RIM + 4} ${C4 - 25} ${RIM + 12}Z`}
		class="c-accent tint"
	/>
	<g class="c-muted">
		<path d={`M${C4 - 6} ${RIM - 46}h12M${C4 - 6} ${RIM - 22}h12`} class="bold" />
		<path d={glass(C4, RIM - 34)} />
		<path d={`M${C4} ${RIM - 29}l3.5 6h-7z`} class="solid" stroke="none" />
	</g>

	<Mark x={24} y={20} n={1} />
	<Mark x={90} y={20} n={2} />
	<Mark x={150} y={20} n={3} />
	<Mark x={C4} y={20} n={4} />
</DiagramFrame>

<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	// Every bird is seen from above with the neck end up and the legs toward the viewer (down).

	/** Breast-down bird: body 28 wide, (cx, cy) its centre. */
	const backBody = (cx: number, cy: number) =>
		`M${cx} ${cy - 26}c9 0 14 9 14 24s-5 26-14 26s-14-11-14-26s5-24 14-24z`;
	/** Wings folded along the sides of the back. */
	const backWings = (cx: number, cy: number) =>
		`M${cx - 12} ${cy - 16}c-5 1-8 6-8 12s2 10 4 12c0-5 1-10 4-13z` +
		`M${cx + 12} ${cy - 16}c5 1 8 6 8 12s-2 10-4 12c0-5-1-10-4-13z`;
	/** Drumsticks; `spread` pushes the knuckle ends out sideways. */
	const legs = (cx: number, cy: number, spread: number) =>
		`M${cx - 11} ${cy + 14}c-1 6 ${-2 - spread} 12 ${-2 - spread} 18a2.5 2.5 0 0 0 5 0c0-5 ${1 + spread}-11 ${3 + spread}-16z` +
		`M${cx + 11} ${cy + 14}c1 6 ${2 + spread} 12 ${2 + spread} 18a2.5 2.5 0 0 1-5 0c0-5 ${-1 - spread}-11 ${-3 - spread}-16z`;
	const neck = (cx: number, cy: number) => `M${cx - 4} ${cy - 25}c0-3 1-6 4-6s4 3 4 6`;
	const tail = (cx: number, cy: number) => `M${cx - 3} ${cy + 23}c0 3 1 5 3 5s3-2 3-5`;
	/** Backbone with vertebra ticks, 44 long, centred on (cx, cy). */
	const spine = (cx: number, cy: number) =>
		`M${cx} ${cy - 22}V${cy + 20}` +
		[-16, -10, -4, 2, 8, 14].map((d) => `M${cx - 2} ${cy + d}h4`).join('');

	/** Flattened breast-up bird: body 36 wide. */
	const flatBody = (cx: number, cy: number) =>
		`M${cx} ${cy - 24}c11 0 18 8 18 22s-7 24-18 24s-18-10-18-24s7-22 18-22z`;
	const breastLines = (cx: number, cy: number) =>
		`M${cx - 3} ${cy - 18}c-9 5-11 20-5 31M${cx + 3} ${cy - 18}c9 5 11 20 5 31`;
	/** Wings opened out sideways from the shoulders. */
	const openWings = (cx: number, cy: number) =>
		`M${cx - 17} ${cy - 14}c-4 0-8 4-9 9s1 6 3 4c2-2 4-4 6-5z` +
		`M${cx + 17} ${cy - 14}c4 0 8 4 9 9s-1 6-3 4c-2-2-4-4-6-5z`;
	/** Wings with the tips folded under: short stubs, the tucked tip dashed behind. */
	const tuckedWings = (cx: number, cy: number) =>
		`M${cx - 16} ${cy - 13}c-3 1-5 3-5 6s2 4 4 4zM${cx + 16} ${cy - 13}c3 1 5 3 5 6s-2 4-4 4z`;
	const tuckedTips = (cx: number, cy: number) =>
		`M${cx - 19} ${cy - 10}l3 8M${cx + 19} ${cy - 10}l-3 8`;
	/** Splayed drumsticks, knuckles `out` units beyond the thigh joint. */
	const flatLegs = (cx: number, cy: number, out: number) =>
		`M${cx - 15} ${cy + 9}c-3 5 ${3 - out} 11 ${-out} 16a2.5 2.5 0 0 0 4.5 2c2-5 5-10 8-13z` +
		`M${cx + 15} ${cy + 9}c3 5 ${out - 3} 11 ${out} 16a2.5 2.5 0 0 1-4.5 2c-2-5-5-10-8-13z`;

	/** Top view of a hand pressing down, fingers toward the neck, wrist off past the legs. */
	const hand = (cx: number, cy: number) =>
		`M${cx - 6} ${cy + 18}L${cx - 7} ${cy + 6}l-5-6a1.8 1.8 0 0 1 2.6-2.4l3 3.4V${cy - 11}` +
		`a1.6 1.6 0 0 1 3.2 0v-2a1.6 1.6 0 0 1 3.2 0v1a1.6 1.6 0 0 1 3.2 0v2.5a1.6 1.6 0 0 1 3.2 0` +
		`V${cy + 6}L${cx + 6} ${cy + 18}`;
	const knuckles = (cx: number, cy: number) =>
		`M${cx - 3.2} ${cy - 11}V${cy - 4}M${cx} ${cy - 12}V${cy - 4}M${cx + 3.2} ${cy - 9.5}V${cy - 4}`;

	const specks: [number, number][] = [
		[200, 80],
		[214, 78],
		[206, 88],
		[198, 98],
		[218, 96],
		[208, 106],
		[202, 112]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[48, 22]} to={[80, 22]} />
		<Arrow from={[104, 22]} to={[136, 22]} bend={-8} />
		<Arrow from={[160, 22]} to={[196, 22]} />
	</g>

	<!-- the board under the first three stages -->
	<rect x="12" y="44" width="164" height="104" rx="4" class="fine" />

	<!-- 1: breast side down, legs toward you, the backbone up the middle -->
	<g class="c-primary">
		<path d={backWings(36, 94)} class="tint" />
		<path d={legs(36, 94, 0)} class="tint" />
		<path d={backBody(36, 94)} class="tint" />
		<path d={`${neck(36, 94)}${tail(36, 94)}`} class="fine" />
		<path d={spine(36, 94)} class="fine" />
	</g>

	<!-- 2: shears cut down both sides of the backbone, which comes out whole -->
	<g class="c-primary">
		<path d={backWings(92, 94)} class="tint" />
		<path d={legs(92, 94, 0)} class="tint" />
		<path d={backBody(92, 94)} class="tint" />
		<path d={`${neck(92, 94)}${tail(92, 94)}`} class="fine" />
		<path d="M88.5 69V117M95.5 69V117" />
		<rect x="74" y="134" width="44" height="6" rx="3" class="tint" />
		<path d="M80 134v6M86 134v6M92 134v6M98 134v6M104 134v6M110 134v6" class="fine" />
	</g>
	<g class="c-accent" transform="translate(95.5 58)">
		<path d="M0 0-3 16-.6 1.5zM0 0 2.6 16 .6 1.5z" class="tint" />
		<path d="M-1-1-3-5M1-1 3-5" />
		<ellipse cx="-4.5" cy="-9" rx="3.5" ry="4.5" />
		<ellipse cx="4.5" cy="-9" rx="3.5" ry="4.5" />
	</g>

	<!-- 3: turned breast side up and pressed flat on the breastbone -->
	<g class="c-primary">
		<path d={openWings(148, 94)} class="tint" />
		<path d={flatLegs(148, 94, 9)} class="tint" />
		<path d={flatBody(148, 94)} class="tint" />
		<path d={breastLines(148, 94)} class="fine" />
	</g>
	<path d={hand(148, 98)} />
	<path d={knuckles(148, 98)} class="fine" />
	<g class="c-muted fine">
		<Arrow from={[129, 99]} to={[121, 99]} />
		<Arrow from={[167, 99]} to={[174, 99]} />
	</g>

	<!-- 4: wing tips tucked under, seasoned, roasting flat in the tray skin side up -->
	<rect x="184" y="50" width="48" height="90" rx="5" />
	<rect x="187.5" y="53.5" width="41" height="83" rx="3" class="fine" />
	<g class="c-primary">
		<path d={tuckedWings(208, 94)} class="tint" />
		<path d={tuckedTips(208, 94)} class="fine dashed" />
		<path d={flatLegs(208, 94, 6)} class="tint" />
		<path d={flatBody(208, 94)} class="tint" />
		<path d={`${breastLines(208, 94)}M208 76V108`} class="fine" />
	</g>
	<g class="solid" stroke="none">
		{#each specks as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="1.2" />
		{/each}
	</g>

	<Mark x={36} y={22} n={1} />
	<Mark x={92} y={22} n={2} />
	<Mark x={148} y={22} n={3} />
	<Mark x={208} y={22} n={4} />
</DiagramFrame>

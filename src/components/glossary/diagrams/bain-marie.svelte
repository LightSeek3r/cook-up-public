<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Ramekin 40 wide, rim at (x..x+40, y), walls tapering 2 in over 27 down. */
	const ramekin = (x: number, y: number) =>
		`M${x - 2} ${y}h44M${x} ${y}L${x + 2} ${y + 25}q.4 2 2.4 2H${x + 35.6}q2 0 2.4-2L${x + 40} ${y}`;
	/** The custard inside it, its fill tucked under the walls. */
	const custard = (x: number, y: number) =>
		`M${x + 0.5} ${y + 6}H${x + 39.5}L${x + 38} ${y + 25}q-.4 2-2.4 2H${x + 4.4}q-2 0-2.4-2z`;

	/** Wavy surface w wide with n crests, from (x0, y). */
	const wave = (x0: number, y: number, w: number, n: number) => {
		const s = Math.round((w / (2 * n)) * 100) / 100;
		return `M${x0} ${y}q${s / 2}-2.4 ${s} 0${` t${s} 0`.repeat(2 * n - 1)}`;
	};

	const flame = (x: number) => `M${x} 143c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;

	/** Folded oven cloth gripping a wall, (x, y) its top-left corner. */
	const cloth = (x: number, y: number) => `M${x + 4} ${y}h6q4 0 4 4v12q0 4-4 4h-6q-4 0-4-4V${y + 4}q0-4 4-4z`;

	// Water level at half the dishes' height; the water shows in the three gaps between them.
	const WATER = 116;
	const water = [
		`${wave(37, WATER, 26, 2)}L64.5 129.5H42q-5 0-5-5z`,
		`${wave(101, WATER, 38, 3)}L140.5 129.5H99.5z`,
		`${wave(177, WATER, 26, 2)}V124.5q0 5-5 5H175.5z`
	];
	const surfaces = [wave(37, WATER, 26, 2), wave(101, WATER, 38, 3), wave(177, WATER, 26, 2)];
</script>

<DiagramFrame {label} {rtl} directional={false}>
	<!-- 2: hot water around the dishes, halfway up their sides -->
	<g class="c-accent">
		{#each water as d (d)}
			<path {d} class="tint" stroke="none" />
		{/each}
		{#each surfaces as d (d)}
			<path {d} />
		{/each}
	</g>
	<g class="c-muted fine">
		<path d={steam(47, 84)} />
		<path d={steam(193, 84)} />
	</g>

	<!-- 1: the larger pan with a dish standing in it -->
	<path d="M30 88h6V124q0 6 6 6H198q6 0 6-6V88h6" />
	<g class="c-primary">
		<path d={custard(62, 102)} class="tint" stroke="none" />
		<path d={custard(138, 102)} class="tint" stroke="none" />
	</g>
	<path d={ramekin(62, 102)} />
	<path d={ramekin(138, 102)} />

	<!-- 3: gentle heat underneath -->
	<g class="c-primary">
		<path d={flame(84)} class="tint" />
		<path d={flame(102)} class="tint" />
		<path d={flame(120)} class="tint" />
		<path d={flame(138)} class="tint" />
		<path d={flame(156)} class="tint" />
	</g>
	<path d="M70 147H170" class="fine" />

	<!-- 4: a dish lifted out between two dry cloths -->
	<g class="c-muted fine">
		<Arrow from={[120, 106]} to={[120, 78]} />
	</g>
	<path d={custard(100, 44)} class="c-primary tint" stroke="none" />
	<path d={ramekin(100, 44)} />
	<g class="c-accent">
		<path d={cloth(92, 50)} class="tint" />
		<path d={cloth(134, 50)} class="tint" />
		<path d="M96 55v10M144 55v10" class="fine" />
	</g>

	<Mark x={82} y={87} n={1} />
	<Mark x={222} y={116} n={2} />
	<Mark x={56} y={144} n={3} />
	<Mark x={74} y={54} n={4} />
</DiagramFrame>

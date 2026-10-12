<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Spoonful-sized drop, point up, 10 wide and 13 tall, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-1.4 3.2-5 5.8-5 8.5a5 5 0 0 0 10 0c0-2.7-3.6-5.3-5-8.5z`;

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Short highlight arc inside a sphere of radius r, so it reads as round, not as a ring. */
	const gloss = (cx: number, cy: number, r: number) =>
		`M${cx - r * 0.58} ${cy - r * 0.07}a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 0.51} ${-r * 0.53}`;

	/*
	 * The alginate bath is thick, so its surface is a smooth meniscus rather than a wave, and its
	 * fill is laid twice to read denser than the plain rinsing water on the right.
	 */
	const BATH = 'M18 104q4 2.5 10 2.5H136q6 0 10-2.5C140 128 116 135 82 135S20 128 18 106z';
	const SURFACE = 'M18 104q4 2.5 10 2.5H136q6 0 10-2.5';

	/** Calcium specks: the salt is in the drop now, so it rides along inside every drop and sphere. */
	const specks = (cx: number, cy: number, r: number) => [
		[cx - r * 0.25, cy + r * 0.3],
		[cx + r * 0.35, cy - r * 0.05]
	];

	const bathSpheres: [number, number][] = [
		[92, 121],
		[106, 127],
		[110, 114],
		[123, 123],
		[130, 112]
	];
	const spoonSpheres: [number, number][] = [
		[189, 75],
		[199, 74],
		[209, 75]
	];
	const powder: [number, number][] = [
		[29, 39],
		[31, 45],
		[28, 50],
		[33, 52]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- the alginate bath -->
	<path d={BATH} class="c-accent tint" stroke="none" />
	<path d={BATH} class="c-accent tint" stroke="none" />
	<path d={SURFACE} class="c-accent" />
	<path d="M10 98H154M14 98c2 30 28 42 68 42s66-12 68-42" />

	<!-- 1: calcium salt stirred into the flavoured liquid -->
	<path d="M10 24l9 7" class="bold" />
	<ellipse cx="25" cy="34" rx="7" ry="3.5" transform="rotate(30 25 34)" />
	<g class="solid" stroke="none">
		{#each powder as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="1.1" />
		{/each}
		<circle cx="27" cy="62" r="1.1" />
		<circle cx="38" cy="64" r="1.1" />
		<circle cx="45" cy="61" r="1.1" />
	</g>
	<path d={`${wave(18, 58, 4)}C50 67 42 72 34 72S18 67 18 58z`} class="c-primary tint" stroke="none" />
	<path d={wave(18, 58, 4)} class="c-primary" />
	<path d="M13 54h42M16 54a18 18 0 0 0 36 0" />

	<!-- 2: spoonfuls of it dropped into the bath -->
	<path d="M86 55l14-13" class="bold" />
	<ellipse cx="74" cy="60" rx="13" ry="5" transform="rotate(-12 74 60)" />
	<ellipse cx="74" cy="60" rx="9" ry="2.6" transform="rotate(-12 74 60)" class="c-primary tint" />
	<g class="c-primary">
		<path d={drop(64, 70)} class="tint" />
		<path d="M59 104.5q5 4 10 0" class="fine" />
		<path d={drop(64, 92)} class="tint" />
	</g>
	<g class="solid" stroke="none">
		<circle cx="62.5" cy="80" r="0.9" />
		<circle cx="65.5" cy="78" r="0.9" />
		<circle cx="62.5" cy="102" r="0.9" />
		<circle cx="65.5" cy="100" r="0.9" />
	</g>

	<!-- 3: a gel skin grows outward from each drop into the bath -->
	<g class="c-primary">
		{#each bathSpheres as [cx, cy] (cx)}
			<circle {cx} {cy} r="5.5" class="tint" />
			<path d={gloss(cx, cy, 5.5)} class="fine" />
		{/each}
	</g>
	<g class="solid" stroke="none">
		{#each bathSpheres as [cx, cy] (cx)}
			{#each specks(cx, cy, 5.5) as [x, y] (x)}
				<circle cx={x} cy={y} r="0.8" />
			{/each}
		{/each}
	</g>
	<path d="M114 66 111 107" class="c-muted fine dashed" />
	<path d="M126 28a20 20 0 1 0 0 40a20 20 0 1 0 0-40zM126 37a11 11 0 1 1 0 22a11 11 0 1 1 0-22z" class="c-accent tint" stroke="none" fill-rule="evenodd" />
	<circle cx="126" cy="48" r="20" class="c-muted fine" />
	<circle cx="126" cy="48" r="11" class="c-primary tint" stroke="none" />
	<circle cx="126" cy="48" r="14" class="c-accent fine dashed" />
	<circle cx="126" cy="48" r="11" class="c-accent bold" />
	<g class="solid" stroke="none">
		<circle cx="122" cy="51" r="1.1" />
		<circle cx="129" cy="46" r="1.1" />
		<circle cx="125" cy="43" r="1.1" />
	</g>

	<!-- 4: lifted out with a slotted spoon and rinsed in clean water -->
	<g class="c-muted fine">
		<Arrow from={[144, 100]} to={[176, 80]} bend={-12} />
	</g>
	<g class="c-primary">
		{#each spoonSpheres as [cx, cy] (cx)}
			<circle {cx} {cy} r="4.8" class="tint" />
			<path d={gloss(cx, cy, 4.8)} class="fine" />
		{/each}
	</g>
	<ellipse cx="199" cy="82" rx="18" ry="6" />
	<path d="M190 82h4M197 82h4M204 82h4" class="fine" />
	<path d="M216 79l18-20" class="bold" />
	<g class="c-accent">
		<path d="M193 93c-.7 1.8-2.5 3.2-2.5 5a2.5 2.5 0 0 0 5 0c0-1.8-1.8-3.2-2.5-5z" class="tint" />
		<path d="M203 99c-.7 1.8-2.5 3.2-2.5 5a2.5 2.5 0 0 0 5 0c0-1.8-1.8-3.2-2.5-5z" class="tint" />
	</g>
	<path d={`${wave(178, 120, 6)}C222 132 212 136 202 136S180 132 178 120z`} class="c-accent tint" stroke="none" />
	<path d={wave(178, 120, 6)} class="c-accent" />
	<path d="M170 114H234M174 114c1 18 12 26 28 26s27-8 28-26" />

	<Mark x={44} y={30} n={1} />
	<Mark x={86} y={84} n={2} />
	<Mark x={98} y={28} n={3} />
	<Mark x={186} y={52} n={4} />
</DiagramFrame>

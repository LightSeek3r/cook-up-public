<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Falling drop, point up, 7 wide and 10 tall, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-1 2.5-3.5 4.5-3.5 7a3.5 3.5 0 0 0 7 0c0-2.5-2.5-4.5-3.5-7z`;

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Short highlight arc inside a 4.5-radius sphere, so it reads as round, not as a ring. */
	const gloss = (cx: number, cy: number) => `M${cx - 2.6} ${cy - 0.3}a2.7 2.7 0 0 1 2.3-2.4`;

	const bathSpheres: [number, number][] = [
		[80, 121],
		[92, 127],
		[100, 116],
		[112, 125],
		[124, 117]
	];
	const spoonSpheres: [number, number][] = [
		[190, 76],
		[199, 75],
		[208, 76]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- the calcium bath -->
	<path d={`${wave(18, 106, 16)}C140 128 116 135 82 135S20 128 18 106z`} class="c-accent tint" stroke="none" />
	<path d={wave(18, 106, 16)} class="c-accent" />
	<path d="M10 98H154M14 98c2 30 28 42 68 42s66-12 68-42" />

	<!-- 1: flavoured alginate liquid in a spoon -->
	<path d="M8 38l22 12" class="bold" />
	<ellipse cx="45" cy="54" rx="15" ry="6" transform="rotate(10 45 54)" />
	<ellipse cx="46" cy="54" rx="10" ry="3" transform="rotate(10 46 54)" class="c-primary tint" />

	<!-- 2: drops falling into the bath -->
	<g class="c-primary">
		<path d={drop(60, 64)} class="tint" />
		<path d={drop(60, 79)} class="tint" />
		<path d={drop(60, 93)} class="tint" />
	</g>
	<g class="c-accent fine">
		<ellipse cx="60" cy="110" rx="7" ry="1.6" />
		<ellipse cx="60" cy="111" rx="12" ry="2.6" />
	</g>

	<!-- 3: a thin gel skin closes round each drop -->
	<g class="c-primary">
		{#each bathSpheres as [cx, cy] (cx)}
			<circle {cx} {cy} r="4.5" class="tint" />
			<path d={gloss(cx, cy)} class="fine" />
		{/each}
	</g>
	<path d="M108 66 101 110" class="c-muted fine dashed" />
	<circle cx="122" cy="48" r="20" class="c-muted fine" />
	<circle cx="122" cy="48" r="12" class="c-primary tint" stroke="none" />
	<circle cx="122" cy="48" r="12" class="c-accent bold" />
	<circle cx="122" cy="48" r="9" class="c-accent fine dashed" />

	<!-- 4: lifted out with a slotted spoon and rinsed -->
	<g class="c-muted fine">
		<Arrow from={[140, 100]} to={[176, 80]} bend={-12} />
	</g>
	<g class="c-primary">
		{#each spoonSpheres as [cx, cy] (cx)}
			<circle {cx} {cy} r="4.5" class="tint" />
			<path d={gloss(cx, cy)} class="fine" />
		{/each}
	</g>
	<ellipse cx="199" cy="82" rx="18" ry="6" />
	<path d="M190 82h4M197 82h4M204 82h4" class="fine" />
	<path d="M216 79l18-20" class="bold" />
	<g class="c-accent">
		<path d={drop(193, 93)} class="tint" />
		<path d={drop(203, 99)} class="tint" />
	</g>
	<path d={`${wave(178, 120, 6)}C222 132 212 136 202 136S180 132 178 120z`} class="c-accent tint" stroke="none" />
	<path d={wave(178, 120, 6)} class="c-accent" />
	<path d="M170 114H234M174 114c1 18 12 26 28 26s27-8 28-26" />

	<Mark x={20} y={22} n={1} />
	<Mark x={76} y={72} n={2} />
	<Mark x={98} y={28} n={3} />
	<Mark x={186} y={52} n={4} />
</DiagramFrame>

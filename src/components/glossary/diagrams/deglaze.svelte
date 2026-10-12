<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const RIM = 104;

	/** Skillet in side view, w across the rim at (x, RIM), 13 deep; its handle is drawn bold beside it. */
	const skillet = (x: number, w: number) => `M${x} ${RIM}h${w}l-3 10q-1 3-4 3H${x + 7}q-3 0-4-3z`;
	const handle = (x: number) => `M${x} ${RIM + 1}l9-4`;

	/** The browned bits (fond) stuck to the bottom of a skillet at x. */
	const fond = (x: number): [number, number][] => [
		[x + 9, RIM + 11],
		[x + 15, RIM + 12],
		[x + 21, RIM + 11],
		[x + 27, RIM + 12],
		[x + 32, RIM + 11]
	];

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	const flame = (x: number) => `M${x} ${RIM + 26}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;

	/** Upright bottle centred on its own origin, neck tip at (0, -22). */
	const bottle = 'M-2 -22h4v9q4 2 4 6v24q0 2-2 2h-8q-2 0-2-2v-24q0-4 4-6z';
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[44, 22]} to={[80, 22]} />
		<Arrow from={[104, 22]} to={[138, 22]} />
		<Arrow from={[162, 22]} to={[194, 22]} />
	</g>

	<!-- 1: the seared food lifted out and kept warm under foil -->
	<g class="c-primary">
		<path d="M20 61q0-6 5-6h14q5 0 5 6z" class="tint" />
		<path d="M24 58h16" class="fine" />
	</g>
	<ellipse cx="32" cy="62" rx="18" ry="3.5" />
	<path d="M13 61l19-17 19 17" class="fine" />
	<path d="M27 48.5l3 3M35 46.5l-2 4" class="fine" />
	<g class="c-muted fine">
		<Arrow from={[32, 98]} to={[32, 72]} />
	</g>
	<g class="c-primary solid" stroke="none">
		{#each fond(12) as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.2" />
		{/each}
	</g>
	<path d={skillet(12, 40)} />
	<path d={handle(52)} class="bold" />

	<!-- 2: all but a thin film of fat poured off -->
	<g transform="rotate(-22 92 108)">
		<path d="M80 115.5h24" class="c-accent fine" />
		<g class="c-primary solid" stroke="none">
			{#each fond(72) as [cx, cy] (cx)}
				<circle {cx} {cy} r="1.2" />
			{/each}
		</g>
		<path d={skillet(72, 40)} />
		<path d={handle(112)} class="bold" />
	</g>
	<path d="M71 112q-3 4-4 15" class="c-accent" />
	<path d="M55 126h18l-2 9q-.5 2-2.5 2h-9q-2 0-2.5-2z" />
	<path d="M57.5 130h13l-1 4.5q-.3 1-1.3 1h-8.4q-1 0-1.3-1z" class="c-accent tint" stroke="none" />

	<!-- 3: back on the heat, the liquid poured in -->
	<g transform="translate(140 64) rotate(130)">
		<path d={bottle} />
		<path d="M-6 0h12M-6 9h12" class="fine" />
	</g>
	<path d="M157 79q1 14-3 33" class="c-accent" />
	<path d={`${wave(136, 112, 3.5)}L162 116H138z`} class="c-accent tint" stroke="none" />
	<g class="c-accent solid" stroke="none">
		<circle cx="145" cy="101" r="1.3" />
		<circle cx="149" cy="96" r="1.1" />
		<circle cx="161" cy="99" r="1.3" />
		<circle cx="165" cy="104" r="1.1" />
	</g>
	<g class="c-muted fine">
		<path d={steam(136, 100)} />
		<path d={steam(170, 100)} />
	</g>
	<g class="c-primary solid" stroke="none">
		{#each fond(130) as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.2" />
		{/each}
	</g>
	<path d={skillet(130, 40)} />
	<path d={handle(170)} class="bold" />
	<g class="c-primary">
		<path d={flame(141)} class="tint" />
		<path d={flame(150)} class="tint" />
		<path d={flame(159)} class="tint" />
	</g>

	<!-- 4: a wooden spoon scrapes the bits up into a simmering sauce -->
	<path d={`${wave(190, 109, 3.5)}L216 116H192z`} class="c-accent tint" stroke="none" />
	<path d={wave(190, 109, 3.5)} class="c-accent" />
	<g class="c-primary solid" stroke="none">
		<circle cx="193" cy="112.5" r="1.2" />
		<circle cx="199" cy="110.5" r="1.1" />
		<circle cx="206" cy="113" r="1.2" />
		<circle cx="213" cy="111" r="1.1" />
	</g>
	<g class="c-accent fine">
		<circle cx="196" cy="106" r="1.3" />
		<circle cx="210" cy="105.5" r="1.3" />
	</g>
	<g class="c-muted fine">
		<path d={steam(194, 98)} />
		<path d={steam(202, 98)} />
	</g>
	<path d="M228 66 207.5 107" class="bold" />
	<ellipse cx="205" cy="111.5" rx="3.2" ry="5.5" transform="rotate(26.6 205 111.5)" class="tint" />
	<path d={skillet(186, 36)} />
	<path d={handle(222)} class="bold" />
	<g class="c-primary">
		<path d={flame(195)} class="tint" />
		<path d={flame(204)} class="tint" />
		<path d={flame(213)} class="tint" />
	</g>

	<Mark x={32} y={22} n={1} />
	<Mark x={92} y={22} n={2} />
	<Mark x={150} y={22} n={3} />
	<Mark x={206} y={22} n={4} />
</DiagramFrame>

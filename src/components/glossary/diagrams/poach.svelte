<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Barely moving liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-1.2 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Poached egg white, 26 wide and 11 tall, (x, y) being its leftmost point. */
	const white = (x: number, y: number) => `M${x} ${y}c0-5 6-8 13-8s13 3 13 7c0 4-6 5-13 5s-13-1-13-4z`;
	/** Loose wisps of white trailing off both ends. */
	const wisps = (x: number, y: number) => `M${x + 1} ${y - 3}q-3-1-5 1M${x + 25} ${y - 2}q3-.5 5 1.5`;

	/** Falling drop, point up, 7 wide and 10 tall, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-1 2.5-3.5 4.5-3.5 7a3.5 3.5 0 0 0 7 0c0-2.5-2.5-4.5-3.5-7z`;

	const flame = (x: number, y: number) => `M${x} ${y}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const lowFlame = (x: number, y: number) => `M${x} ${y}c-2-1.3-2-4 0-6 0 2 2 2 2 4 0 1.3-.7 2-2 2z`;

	const bottomBubbles: [number, number][] = [
		[21, 120.5],
		[27, 121],
		[33, 120.5],
		[39, 121],
		[45, 120.5],
		[51, 121]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- the wide pan of liquid, its surface barely moving -->
	<path d={`${wave(16, 100, 19)}V120q0 2-2 2H18q-2 0-2-2z`} class="c-accent tint" stroke="none" />
	<path d={wave(16, 100, 19)} class="c-accent" />

	<!-- 1: heated until tiny bubbles form on the bottom -->
	<g class="c-accent fine">
		{#each bottomBubbles as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.3" />
		{/each}
		<circle cx="30" cy="114" r="1" />
		<circle cx="44" cy="112" r="1" />
	</g>
	<g class="c-primary">
		<path d={flame(26, 137)} class="tint" />
		<path d={flame(38, 137)} class="tint" />
		<path d={flame(50, 137)} class="tint" />
	</g>

	<!-- 2: the heat lowered, the liquid held at 70-80 degrees -->
	<g class="c-primary">
		<path d={lowFlame(74, 135)} class="tint" />
		<path d={lowFlame(94, 135)} class="tint" />
		<path d={lowFlame(114, 135)} class="tint" />
		<path d={lowFlame(134, 135)} class="tint" />
		<path d={lowFlame(154, 135)} class="tint" />
	</g>
	<g class="c-accent">
		<path d="M71.5 104V55a2.5 2.5 0 0 1 5 0v49" />
		<circle cx="74" cy="108" r="4.5" />
	</g>
	<g class="c-primary solid" stroke="none">
		<circle cx="74" cy="108" r="2.6" />
		<rect x="73" y="76" width="2" height="31" rx="1" />
	</g>
	<path d="M77 60h3M77 68h3M77 76h3M77 84h3M77 92h3" class="c-accent fine" />

	<!-- 3: the egg lowered in gently -->
	<g class="c-muted fine">
		<Arrow from={[106, 58]} to={[106, 82]} />
	</g>
	<path d="M122 94 130 50" class="bold" />
	<path d="M102.5 96.5q8.5 4 17 0" class="fine" />
	<circle cx="111" cy="97" r="3" class="c-primary tint" />
	<path d="M99 94a12 8 0 0 0 24 0z" />

	<!-- 4: cooked through without a simmer -->
	<path d={white(137, 113)} />
	<path d={wisps(137, 113)} class="fine" />
	<ellipse cx="150" cy="110" rx="4.5" ry="3.5" class="c-primary tint" />

	<path d="M10 90H174M12 90l3 30q.5 4 4.5 4h145q4 0 4.5-4l3-30" />

	<!-- 5: lifted out with a slotted spoon to drain -->
	<g class="c-muted fine">
		<Arrow from={[160, 96]} to={[184, 74]} bend={-8} />
	</g>
	<path d={white(190, 80)} />
	<ellipse cx="203" cy="77" rx="4.5" ry="3.5" class="c-primary tint" />
	<ellipse cx="203" cy="84" rx="15" ry="5" />
	<path d="M194 86.5h4M201 87h4M208 86.5h4" class="fine" />
	<path d="M217 81l13-20" class="bold" />
	<g class="c-accent">
		<path d={drop(198, 94)} class="tint" />
		<path d={drop(208, 101)} class="tint" />
	</g>
	<ellipse cx="204" cy="126" rx="20" ry="4" />
	<ellipse cx="204" cy="126" rx="12" ry="2" class="fine" />

	<Mark x={34} y={72} n={1} />
	<Mark x={88} y={66} n={2} />
	<Mark x={106} y={40} n={3} />
	<Mark x={150} y={76} n={4} />
	<Mark x={196} y={52} n={5} />
</DiagramFrame>

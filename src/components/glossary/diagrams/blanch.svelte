<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Broccoli floret 14 wide and 15 tall with a five-bump crown, (x, y) being the foot of its stem. */
	const floret = (x: number, y: number) =>
		`M${x - 2} ${y}v-5h-4a2.6 2.6 0 0 1-1-5a2.9 2.9 0 0 1 4-4a3 3 0 0 1 6 0a2.9 2.9 0 0 1 4 4a2.6 2.6 0 0 1-1 5h-4v5z`;
	/** The stem forking into the crown. */
	const fork = (x: number, y: number) => `M${x} ${y - 2}v-4l-2.5-3M${x} ${y - 6}l2.5-3`;

	/** Wavy water surface from x0 to x0 + n*8; a larger amp reads as a rolling boil. */
	const wave = (x0: number, y: number, n: number, amp = 2.4) =>
		`M${x0} ${y}q2-${amp} 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Falling drop, point up, 7 wide and 10 tall, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-1 2.5-3.5 4.5-3.5 7a3.5 3.5 0 0 0 7 0c0-2.5-2.5-4.5-3.5-7z`;

	const flame = (x: number, y: number) => `M${x} ${y}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;

	const bubbles: [number, number, number][] = [
		[24, 114, 2.5],
		[30, 104, 2],
		[26, 96, 1.5],
		[62, 116, 2.5],
		[68, 106, 2],
		[60, 97, 1.5]
	];
	const holes: [number, number][] = [
		[188, 70],
		[196, 73],
		[204, 74],
		[212, 73],
		[220, 70],
		[196, 79],
		[204, 80],
		[212, 79]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- 1: a pot of salted water at a rolling boil -->
	<path d={`${wave(18, 90, 7, 5)}V120q0 4-4 4H22q-4 0-4-4z`} class="c-accent tint" stroke="none" />
	<path d={wave(18, 90, 7, 5)} class="c-accent" />
	<g class="c-accent fine">
		{#each bubbles as [cx, cy, r] (cx + cy)}
			<circle {cx} {cy} {r} />
		{/each}
	</g>
	<path d="M16 78V120q0 6 6 6h48q6 0 6-6V78" />
	<path d="M16 84h-5v7h5M76 84h5v7h-5" />
	<g class="c-muted fine">
		<path d={steam(24, 74)} />
		<path d={steam(32, 74)} />
	</g>
	<g class="c-primary">
		<path d={flame(28, 140)} class="tint" />
		<path d={flame(40, 140)} class="tint" />
		<path d={flame(52, 140)} class="tint" />
		<path d={flame(64, 140)} class="tint" />
	</g>

	<!-- 2: the food lowered in, briefly -->
	<g class="c-primary">
		{#each [[42, 68], [56, 60], [46, 117]] as [x, y] (x)}
			<path d={floret(x, y)} class="tint" />
			<path d={fork(x, y)} class="fine" />
		{/each}
	</g>
	<g class="c-muted fine">
		<Arrow from={[69, 50]} to={[69, 72]} />
	</g>

	<!-- 3: straight into a bowl of ice water -->
	<g class="c-muted fine">
		<Arrow from={[82, 66]} to={[104, 82]} bend={-8} />
	</g>
	<path d={`${wave(102, 99, 7)}C158 114 146 120 130 120S102 114 102 99z`} class="c-accent tint" stroke="none" />
	<path d={wave(102, 99, 7)} class="c-accent" />
	<g class="c-primary">
		{#each [[121, 118], [140, 116]] as [x, y] (x)}
			<path d={floret(x, y)} class="tint" />
			<path d={fork(x, y)} class="fine" />
		{/each}
	</g>
	<g class="c-accent">
		<rect x="105" y="92" width="10" height="10" rx="2" transform="rotate(-12 110 97)" class="tint" />
		<rect x="125" y="91" width="9" height="9" rx="2" transform="rotate(10 129.5 95.5)" class="tint" />
		<rect x="146" y="93" width="10" height="10" rx="2" transform="rotate(18 151 98)" class="tint" />
	</g>
	<path d="M96 92H164M100 92c1 22 14 32 30 32s29-10 30-32" />

	<!-- 4: drained, then patted dry on a towel -->
	<g class="c-muted fine">
		<Arrow from={[158, 74]} to={[176, 50]} bend={-8} />
	</g>
	<g class="c-primary">
		{#each [[193, 62], [211, 62]] as [x, y] (x)}
			<path d={floret(x, y)} class="tint" />
			<path d={fork(x, y)} class="fine" />
		{/each}
	</g>
	<path d="M174 62H230M178 62c1 15 10 22 24 22s23-7 24-22" />
	<g class="solid" stroke="none">
		{#each holes as [cx, cy] (cx + cy)}
			<circle {cx} {cy} r="1.1" />
		{/each}
	</g>
	<g class="c-accent">
		<path d={drop(197, 88)} class="tint" />
		<path d={drop(208, 92)} class="tint" />
	</g>
	<!-- a folded towel pats the florets on a flat one -->
	<rect x="188" y="108" width="36" height="8" rx="2" />
	<path d="M193 108v8M219 108v8" class="c-accent fine" />
	<path d="M183 110v4M229 110v4" class="c-muted fine" />
	<g class="c-primary">
		{#each [[197, 132], [215, 132]] as [x, y] (x)}
			<path d={floret(x, y)} class="tint" />
			<path d={fork(x, y)} class="fine" />
		{/each}
	</g>
	<rect x="178" y="132" width="56" height="7" rx="2" />
	<path d="M184 132v7M228 132v7" class="c-accent fine" />

	<Mark x={28} y={44} n={1} />
	<Mark x={55} y={28} n={2} />
	<Mark x={132} y={72} n={3} />
	<Mark x={202} y={30} n={4} />
</DiagramFrame>

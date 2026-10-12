<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Hand-trimmed barrel, 28x40, straight-sided facets; (cx, top) is the centre of its top end. */
	const rough = (cx: number, top: number) =>
		`M${cx - 6} ${top}h12l6 9 2 11-2 11-6 9h-12l-6-9-2-11 2-11z`;
	/** Finished barrel, 28x40, smooth curved sides and blunt ends. */
	const barrel = (cx: number, top: number) =>
		`M${cx - 6} ${top}h12c9 10 9 30 0 40h-12c-9-10-9-30 0-40z`;
	/** The two facet edges seen on the front of a seven-sided barrel. */
	const facets = (cx: number, top: number) =>
		`M${cx - 2.6} ${top}c-4 10-4 30 0 40M${cx + 2.6} ${top}c4 10 4 30 0 40`;

	/** Fingertip pointing up, tip at (x, y), fading off below. */
	const finger = (x: number, y: number) => `M${x - 4} ${y + 20}V${y + 4}a4 4 0 0 1 8 0V${y + 20}`;
	const nail = (x: number, y: number) => `M${x - 2.4} ${y + 6}v-1.6a2.4 2.4 0 0 1 4.8 0v1.6z`;

	// Regular heptagon, radius 10, centred on (213, 54): the end-on view of the finished cut.
	const heptagon = Array.from({ length: 7 }, (_, k) => {
		const a = -Math.PI / 2 + (k * 2 * Math.PI) / 7;
		return `${(213 + 10 * Math.cos(a)).toFixed(2)} ${(54 + 10 * Math.sin(a)).toFixed(2)}`;
	});
</script>

{#snippet knife(x: number, y: number, angle: number)}
	<!-- paring knife, blade tip at (x, y), the handle running out along `angle` -->
	<g class="c-accent" transform="translate({x} {y}) rotate({angle})">
		<path d="M0 0q7-5 16-5v5z" class="tint" />
		<rect x="16" y="-6" width="15" height="7" rx="3" />
		<path d="M21 -2.5h5" class="fine" />
	</g>
{/snippet}

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[42, 22]} to={[63, 22]} />
		<Arrow from={[87, 22]} to={[109, 22]} />
		<Arrow from={[133, 22]} to={[155, 22]} />
		<Arrow from={[179, 22]} to={[201, 22]} />
	</g>

	<!-- 1: a potato cut across into short pieces, standing on the board -->
	<g class="c-primary">
		<path d="M19 73V61c0-8 5-12 11-12s11 4 11 12v12z" class="tint" />
		<path d="M19 78h22q1.5 12 0 24h-22q-1.5-12 0-24z" class="tint" />
		<path d="M19 107h22v12c0 8-5 12-11 12s-11-4-11-12z" class="tint" />
		<path d="M24 61q2-1.6 4 0M33 90q2-1.6 4 0M25 120q2-1.6 4 0" class="fine" />
	</g>
	<rect x="11" y="131" width="38" height="6" rx="2" />

	<!-- 2: peeled and trimmed to a rough barrel; the dashed block is what came off -->
	<rect x="61" y="75" width="28" height="40" rx="2" class="c-muted fine dashed" />
	<path d={rough(75, 75)} class="c-primary tint" />
	<path d="M64 125c4 3 9 2 10-1s-2-6-5-5-3 4 0 5c3 .5 6-1 7-3" class="c-primary fine" />

	<!-- 3: held between thumb and fingers, the knife set near the top -->
	<path d={rough(121, 75)} class="c-primary tint" />
	<g transform="rotate(25 107 99)">
		<path d={finger(107, 99)} />
		<path d={nail(107, 99)} class="fine" />
	</g>
	<g transform="rotate(-25 135 104)">
		<path d={finger(135, 104)} />
		<path d={nail(135, 104)} class="fine" />
	</g>
	{@render knife(128, 79, -50)}

	<!-- 4: a curved stroke down the side while the piece turns against the blade -->
	<path d={barrel(167, 75)} class="c-primary tint" />
	<path d="M169.6 75c4 10 4 30 0 40" class="c-primary fine" />
	{@render knife(178, 109, 60)}
	<g class="c-muted fine">
		<Arrow from={[183, 74]} to={[184, 101]} bend={-6} />
		<Arrow d="M150 124q12 7 24 0" />
	</g>

	<!-- 5: the finished barrel, seven even faces and blunt ends -->
	<path d={`M${heptagon.join('L')}z`} class="c-primary tint" />
	<path d="M213 66V72" class="c-muted fine dashed" />
	<path d={barrel(213, 75)} class="c-primary tint" />
	<path d={facets(213, 75)} class="c-primary fine" />

	<Mark x={30} y={22} n={1} />
	<Mark x={75} y={22} n={2} />
	<Mark x={121} y={22} n={3} />
	<Mark x={167} y={22} n={4} />
	<Mark x={213} y={22} n={5} />
</DiagramFrame>

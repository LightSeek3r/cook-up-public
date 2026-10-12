<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Top-down steak in a 32x24 box, (x, y) being its leftmost point at mid-height. */
	const steak = (x: number, y: number) =>
		`M${x} ${y}c0-7 6-11 13-11c6 0 9 2 14 1c4-.5 5 3 5 7c0 5-1 9-4 12c-4 3-12 3-19 2c-6-1-9-5-9-11z`;
	/** Fat cap along the top and right edge. */
	const fat = (x: number, y: number) =>
		`M${x + 4} ${y - 5}c3-3 7-3.5 10-3.5c5 0 8 1.5 13 1c2.5-.3 3 1.5 3 4.5`;

	/** Wavy water surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) =>
		`M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	const flame = (x: number) => `M${x} 139c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[45, 20]} to={[75, 20]} />
		<Arrow from={[99, 20]} to={[138, 20]} />
		<Arrow from={[162, 20]} to={[200, 20]} />
	</g>

	<!-- 1: seasoning falls into an open bag holding the steak and a herb sprig -->
	<g class="solid" stroke="none">
		<circle cx="26" cy="56" r="1.3" />
		<circle cx="33" cy="51" r="1.3" />
		<circle cx="40" cy="57" r="1.3" />
		<circle cx="30" cy="63" r="1.3" />
		<circle cx="37" cy="66" r="1.3" />
	</g>
	<path d="M12 78V127q0 6 6 6h30q6 0 6-6V78" />
	<path d="M12 78q21-10 42 0" class="fine" />
	<path d="M12 78q21 7 42 0" />
	<g class="c-accent">
		<path d="M22 98c6-7 16-9 22-6-6 7-16 9-22 6z" class="tint" />
		<path d="M25 97.5l16-5" class="fine" />
	</g>
	<g class="c-primary">
		<path d={steak(17, 117)} class="tint" />
		<path d={fat(17, 117)} class="fine" />
	</g>

	<!-- 2: the bag vacuum-sealed tight around it -->
	<path d="M67 93V122q0 7 7 7h26q7 0 7-7V93q0-4-4-4H71q-4 0-4 4z" />
	<path d="M67 95H107" class="fine" />
	<path d="M72 90.5v3M77 90.5v3M82 90.5v3M87 90.5v3M92 90.5v3M97 90.5v3M102 90.5v3" class="fine" />
	<g class="c-primary">
		<path d={steak(71, 112)} class="tint" />
		<path d={fat(71, 112)} class="fine" />
	</g>
	<path d="M69 98l3 3M105 98l-3 3M69 126l3-2.5M105 126l-3-2.5" class="fine" />
	<path d="M59 105l4 4-4 4M115 105l-4 4 4 4" class="c-muted" />

	<!-- 3: held in a water bath, the circulator clamped to the tub wall -->
	<path d={`${wave(122, 76, 7)}V129q0 5-5 5H127q-5 0-5-5z`} class="c-accent tint" stroke="none" />
	<path d={wave(122, 76, 7)} class="c-accent" />
	<path d="M120 62V128q0 8 8 8h44q8 0 8-8V62" />
	<g class="c-muted fine">
		<path d={steam(134, 60)} />
		<path d={steam(142, 60)} />
		<path d={steam(150, 60)} />
	</g>
	<path d="M126 93V126q0 4 4 4h28q4 0 4-4V93q0-3-3-3H129q-3 0-3 3z" />
	<path d="M126 94H162" class="fine" />
	<g class="c-primary">
		<path d={steak(128, 112)} class="tint" />
		<path d={fat(128, 112)} class="fine" />
	</g>
	<rect x="164" y="58" width="10" height="66" rx="2" />
	<path d="M167 106h4M167 111h4M167 116h4" class="fine" />
	<rect x="160" y="34" width="18" height="26" rx="3" />
	<rect x="163" y="38" width="12" height="7" rx="1" class="c-accent tint" />
	<circle cx="169" cy="52" r="2.5" />
	<path d="M178 44h6V74M182 74h4" />

	<!-- 4: seared in a hot pan to finish -->
	<g class="c-muted fine">
		<path d={steam(206, 94)} />
		<path d={steam(212, 94)} />
		<path d={steam(218, 94)} />
	</g>
	<g class="c-primary">
		<path d="M200 112V106q0-5 5-5h14q5 0 5 5v6z" class="tint" />
		<path d="M201.5 103.5q2-1.5 4-1.5h13q2 0 4 1.5M200 110.5h24" class="bold" />
	</g>
	<path d="M192 112h36l-3 10q-1 3-4 3H199q-3 0-4-3z" />
	<path d="M228 113l8-4" class="bold" />
	<g class="c-primary">
		<path d={flame(203)} class="tint" />
		<path d={flame(212)} class="tint" />
		<path d={flame(221)} class="tint" />
	</g>

	<Mark x={33} y={20} n={1} />
	<Mark x={87} y={20} n={2} />
	<Mark x={150} y={20} n={3} />
	<Mark x={212} y={20} n={4} />
</DiagramFrame>

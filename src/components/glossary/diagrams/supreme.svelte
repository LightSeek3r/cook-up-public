<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Side view of a citrus, radius r, its top and bottom sliced off 10 units from the centre. */
	const trimmed = (cx: number, cy: number, r: number) => {
		const h = Math.sqrt(r * r - 100).toFixed(2);
		return `M${cx} ${cy - 10}h${h}a${r} ${r} 0 0 1 0 20H${cx}h-${h}a${r} ${r} 0 0 1 0-20z`;
	};
	/** Segment seams on the peeled side of a fruit. */
	const seams = (cx: number, cy: number) =>
		`M${cx} ${cy - 10}v20M${cx - 5} ${cy - 10}c-3 6-3 14 0 20M${cx + 5} ${cy - 10}c3 6 3 14 0 20`;

	/** Falling drop, point up, 7 wide and 10 tall, anchored at its tip. */
	const drop = (x: number, y: number) =>
		`M${x} ${y}c-1 2.5-3.5 4.5-3.5 7a3.5 3.5 0 0 0 7 0c0-2.5-2.5-4.5-3.5-7z`;
	const wave = (x0: number, y: number, n: number) =>
		`M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Cross-section in the callout: ten segments round (200, 50), radius 16. */
	const CX = 200;
	const CY = 50;
	const polar = (deg: number, r: number, dx = 0, dy = 0) => {
		const a = (deg * Math.PI) / 180;
		return `${(CX + dx + r * Math.cos(a)).toFixed(2)} ${(CY + dy + r * Math.sin(a)).toFixed(2)}`;
	};
	const membranes = Array.from({ length: 10 }, (_, k) => -90 + k * 36)
		.filter((deg) => deg !== -54)
		.map((deg) => `M${polar(deg, 2.5)}L${polar(deg, 16)}`)
		.join('');
	/** The freed segment, between -54 and -18 degrees, lifted out along its own axis. */
	const lift = { dx: 6 * Math.cos((-36 * Math.PI) / 180), dy: 6 * Math.sin((-36 * Math.PI) / 180) };
	const wedge = (dx: number, dy: number) =>
		`M${polar(-54, 2.5, dx, dy)}L${polar(-54, 16, dx, dy)}A16 16 0 0 1 ${polar(-18, 16, dx, dy)}L${polar(-18, 2.5, dx, dy)}z`;

	/** Loose supreme lying in the bowl: a flattened crescent 14 wide. */
	const segment = (x: number, y: number) => `M${x} ${y}q7-6 14 0q-7 3-14 0z`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- the board -->
	<rect x="10" y="128" width="104" height="6" rx="2" />

	<!-- 1: top and bottom sliced off so the fruit stands flat -->
	<g class="c-primary">
		<path d={trimmed(26, 118, 15)} class="tint" />
		<ellipse cx="26" cy="108" rx="11.2" ry="2.6" class="fine" />
		<path d="M14.8 101a15 15 0 0 1 22.4 0z" class="tint" />
		<path d="M45 128a15 15 0 0 1 22.4 0z" class="tint" />
	</g>

	<!-- 2: the peel and pith cut away in strips, following the curve -->
	<g class="c-primary">
		<path d="M89 108H76.82a15 15 0 0 0 0 20H89c3-6 3-14 0-20z" class="tint" />
		<path d="M89 108h9.07a13.5 13.5 0 0 1 0 20H89" />
		<path d="M94 108c3 6 3 14 0 20" class="fine" />
		<path d="M107 104c6 3 9 11 7 21l-3-.5c1.5-8-1-15-5.5-18z" class="tint" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[103.5, 102]} to={[105.5, 124]} bend={-3} />
	</g>

	<!-- the bowl catching the juice -->
	<path d={`${wave(126, 124, 13)}C230 134 210 141 178 141S128 136 126 124z`} class="c-accent tint" stroke="none" />
	<path d={wave(126, 124, 13)} class="c-accent" />
	<path d="M120 112H234M124 112c2 20 22 30 54 30s52-10 54-30" />

	<!-- 3: the peeled fruit held in the palm over the bowl -->
	<g class="c-primary">
		<path d={trimmed(150, 80, 13.5)} class="tint" />
		<path d={seams(150, 80)} class="fine" />
	</g>
	<!-- cupped hand: thumb up the near side, fingers curled up the far side, wrist off to the left -->
	<path
		d="M122 102 134 92c0-4 1-8 2-10a2 2 0 0 1 4 .5c-.5 4 0 8 2 10c4 3 13 3 17-1c4-3 6-9 5-16a2.5 2.5 0 0 1 5-.5c1.5 9 0 18-5 22c-5 4-12 5-18 4L132 110"
	/>
	<path d="M165 84h4.5M164 90h5" class="fine" />
	<g class="c-accent">
		<path d={drop(156, 103)} class="tint" />
		<path d={drop(151, 113)} class="tint" />
	</g>

	<!-- 4: (callout) the knife cuts down both membranes and the segment lifts out -->
	<path d="M162 68 180 60" class="c-muted fine dashed" />
	<circle cx={CX} cy={CY} r="24" class="c-muted fine" />
	<g class="c-primary">
		<circle cx={CX} cy={CY} r="16" class="tint" />
		<path d={membranes} class="fine" />
		<path d={wedge(0, 0)} class="fine dashed" />
		<path d={wedge(lift.dx, lift.dy)} class="tint" />
	</g>
	<g class="c-accent" transform="rotate(-54 {CX} {CY})">
		<path d="M{CX + 4} {CY}l14-2.5v4z" class="tint" />
		<path d="M{CX + 19.5} {CY - 0.5}h3.5" class="bold" />
	</g>

	<!-- 5: the loose segments in the bowl, the spent membrane squeezed over it -->
	<g class="c-primary">
		<path d={segment(184, 123)} class="tint" />
		<path d={segment(200, 126)} class="tint" />
		<path d={segment(192, 131)} class="tint" />
		<ellipse cx="214" cy="91" rx="5.5" ry="9" class="tint" />
		<path d="M214 82v18M209 87l10 8M209 95l10-8" class="fine" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[196, 91]} to={[205, 91]} />
		<Arrow from={[232, 91]} to={[223, 91]} />
	</g>
	<path d={drop(214, 102)} class="c-accent tint" />

	<Mark x={26} y={86} n={1} />
	<Mark x={89} y={90} n={2} />
	<Mark x={126} y={64} n={3} />
	<Mark x={172} y={28} n={4} />
	<Mark x={184} y={91} n={5} />
</DiagramFrame>

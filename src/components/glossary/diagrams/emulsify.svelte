<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const RIM = 112;
	const R = 20;
	const D = 28;
	const round = (v: number) => Math.round(v * 100) / 100;

	/** Bowl cross-section: a rim line overhanging cx±R at RIM and a half-ellipse body D deep. */
	const bowl = (cx: number) => `M${cx - R - 3} ${RIM}h${2 * R + 6}M${cx - R} ${RIM}a${R} ${D} 0 0 0 ${2 * R} 0`;
	/** Half-width of the bowl at `l` below the rim. */
	const half = (l: number) => round(R * Math.sqrt(1 - (l / D) ** 2));
	/** Wavy surface w wide with n crests, from (x0, y). */
	const wave = (x0: number, y: number, w: number, n: number) => {
		const s = round(w / (2 * n));
		return `M${x0} ${y}q${s / 2}-2.4 ${s} 0${` t${s} 0`.repeat(2 * n - 1)}`;
	};
	const surface = (cx: number, l: number) => wave(round(cx - half(l)), RIM + l, 2 * half(l), 3);
	/** Liquid filling the bowl up to a wavy surface `l` below the rim. */
	const liquid = (cx: number, l: number) => `${surface(cx, l)}A${R} ${D} 0 0 1 ${round(cx - half(l))} ${RIM + l}z`;
	/** Thick sauce mounded into a smooth dome. */
	const sauce = (cx: number, l: number) => {
		const a = half(l);
		return `M${round(cx - a)} ${RIM + l}q${a} -12 ${2 * a} 0A${R} ${D} 0 0 1 ${round(cx - a)} ${RIM + l}z`;
	};

	/** Falling drop, point up, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-1 2.5-3.5 4.5-3.5 7a3.5 3.5 0 0 0 7 0c0-2.5-2.5-4.5-3.5-7z`;

	/** Balloon whisk drawn upright with its tip at the origin; place it with a transform. */
	const wires = 'M0 -24c-9 6-9 24 0 24s9-18 0-24zM0 -24c-3.5 6-3.5 24 0 24s3.5-18 0-24z';

	/** Emulsifier molecule: a water-loving head and an oil-loving tail pointing at angle a. */
	const tail = (x: number, y: number, a: number, len = 4.5) =>
		`M${x} ${y}l${round(Math.cos(a) * len)} ${round(Math.sin(a) * len)}`;

	const loose: [number, number, number][] = [
		[21, 128, -0.5],
		[33, 136, -2.6],
		[41, 127, 2.4],
		[34, 124, 0.9],
		[23, 131, -1]
	];

	/** Oil droplets in the magnified view, each coated by a ring of molecules, tails inward. */
	const ZOOM: [number, number] = [150, 64];
	const droplets = [-90, 30, 150].map((deg) => {
		const t = (deg * Math.PI) / 180;
		return [round(ZOOM[0] + Math.cos(t) * 12), round(ZOOM[1] + Math.sin(t) * 12)] as [number, number];
	});
	const COAT = 7;
	const coat = ([cx, cy]: [number, number]) =>
		Array.from({ length: COAT }, (_, i) => {
			const t = (i / COAT) * 2 * Math.PI;
			return [round(cx + Math.cos(t) * 9.2), round(cy + Math.sin(t) * 9.2), t + Math.PI] as [number, number, number];
		});

	const specks: [number, number][] = [
		[140, 125],
		[148, 130],
		[157, 126],
		[144, 135],
		[154, 136],
		[161, 131],
		[150, 124]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[43, 20]} to={[77, 20]} />
		<Arrow from={[101, 20]} to={[138, 20]} />
		<Arrow from={[162, 20]} to={[197, 20]} />
	</g>

	<!-- 1: water with the emulsifier dispersed in it -->
	<path d={liquid(31, 8)} class="c-accent tint" stroke="none" />
	<path d={surface(31, 8)} class="c-accent" />
	{#each loose as [x, y, a] (x)}
		<path d={tail(x, y, a)} class="fine" />
		<circle cx={x} cy={y} r="1.8" class="solid" stroke="none" />
	{/each}
	<path d={bowl(31)} />

	<!-- 2: oil added drop by drop while the whisk moves -->
	<path d={liquid(89, 8)} class="c-accent tint" stroke="none" />
	<path d={surface(89, 8)} class="c-accent" />
	<g class="c-primary">
		<path d={drop(78, 70)} class="tint" />
		<path d={drop(78, 88)} class="tint" />
		<circle cx="79" cy="119" r="3" class="tint" />
	</g>
	<g transform="translate(95 135) rotate(24)">
		<path d={wires} />
		<path d="M0 -24v-20" class="bold" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[100, 82]} to={[116, 92]} bend={-5} />
		<Arrow from={[116, 98]} to={[102, 90]} bend={-5} />
	</g>
	<path d={bowl(89)} />

	<!-- 3: tiny oil droplets spread through the water, each coated in emulsifier -->
	<path d={liquid(150, 8)} class="c-accent tint" stroke="none" />
	<path d={surface(150, 8)} class="c-accent" />
	<g class="c-primary solid" stroke="none">
		{#each specks as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.3" />
		{/each}
	</g>
	<path d={bowl(150)} />
	<path d="M150 116V91" class="c-muted fine dashed" />
	<circle cx={ZOOM[0]} cy={ZOOM[1]} r="25" class="c-accent tint" stroke="none" />
	<circle cx={ZOOM[0]} cy={ZOOM[1]} r="25" class="c-muted fine" />
	{#each droplets as [cx, cy] (cx)}
		<circle {cx} {cy} r="5" class="c-primary tint" />
		{#each coat([cx, cy]) as [x, y, a] (a)}
			<path d={tail(x, y, a, 3.4)} class="fine" />
			<circle cx={x} cy={y} r="1.4" class="solid" stroke="none" />
		{/each}
	{/each}

	<!-- 4: a thin stream of oil into the thick, smooth sauce -->
	<g transform="translate(193 58) rotate(40)" class="c-primary">
		<path d="M-7 -9h14l-1.5 18h-11z" class="tint" stroke="none" />
	</g>
	<g transform="translate(193 58) rotate(40)">
		<path d="M-7 -9h14l-1.5 18h-11z" />
		<path d="M-6.5 -5c-6 0-6 9-0.8 10" />
	</g>
	<path d="M205.5 56.5c2 4 3 10 3 58" class="c-primary" />
	<path d={sauce(209, 8)} class="c-primary tint" />
	<path d="M199 116q5-2.5 10-1" class="c-primary fine" />
	<path d={bowl(209)} />

	<Mark x={31} y={20} n={1} />
	<Mark x={89} y={20} n={2} />
	<Mark x={150} y={20} n={3} />
	<Mark x={209} y={20} n={4} />
</DiagramFrame>

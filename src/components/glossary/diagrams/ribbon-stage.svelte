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
	/** The mixture filling the bowl to a flat top `l` below the rim. */
	const fill = (cx: number, l: number) =>
		`M${round(cx - half(l))} ${RIM + l}h${2 * half(l)}A${R} ${D} 0 0 1 ${round(cx - half(l))} ${RIM + l}z`;
	/** The level line alone, for the "before" level. */
	const level = (cx: number, l: number) => `M${round(cx - half(l))} ${RIM + l}h${2 * half(l)}`;

	/** Balloon whisk drawn upright with its tip at the origin; place it with a transform. */
	const wires = 'M0 -24c-9 6-9 24 0 24s9-18 0-24zM0 -24c-3.5 6-3.5 24 0 24s3.5-18 0-24z';

	const sugar: [number, number][] = [
		[27, 84],
		[34, 89],
		[30, 96],
		[37, 100],
		[25, 104],
		[30, 121],
		[34, 120],
		[42, 123],
		[20, 122]
	];
	const bubbles: [number, number][] = [
		[78, 126],
		[86, 132],
		[82, 121]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[43, 20]} to={[77, 20]} />
		<Arrow from={[101, 20]} to={[138, 20]} />
		<Arrow from={[162, 20]} to={[197, 20]} />
	</g>

	<!-- 1: egg yolks and sugar together in the bowl -->
	<g class="c-primary">
		<circle cx="25" cy="129" r="4.5" class="tint" />
		<circle cx="36" cy="130" r="4.5" class="tint" />
	</g>
	<g class="solid" stroke="none">
		{#each sugar as [cx, cy] (cx * 1000 + cy)}
			<circle {cx} {cy} r="1.3" />
		{/each}
	</g>
	<path d={bowl(31)} />

	<!-- 2: whisked pale and risen in volume -->
	<path d={fill(89, 6)} class="c-primary tint" />
	<path d={level(89, 18)} class="c-muted fine dashed" />
	<g class="fine">
		{#each bubbles as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.5" />
		{/each}
	</g>
	<g transform="translate(95 135) rotate(24)">
		<path d={wires} />
		<path d="M0 -24v-20" class="bold" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[100, 82]} to={[116, 92]} bend={-5} />
		<Arrow from={[116, 98]} to={[102, 90]} bend={-5} />
		<Arrow from={[64, 128]} to={[64, 116]} />
	</g>
	<path d={bowl(89)} />

	<!-- 3: the whisk lifted so the mixture falls back -->
	<path d={fill(150, 6)} class="c-primary tint" />
	<g transform="translate(150 84)">
		<path d={wires} />
		<path d="M0 -24v-20" class="bold" />
	</g>
	<g class="c-primary">
		<path d="M150 86q-1.5 8 0 16t0 14" class="bold" />
		<path d="M143 118q7-5 14 0" class="tint" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[164, 74]} to={[164, 52]} />
	</g>
	<path d={bowl(150)} />

	<!-- 4: seen from above, a thick ribbon sitting on the surface -->
	<circle cx="209" cy="116" r="15.5" class="c-primary tint" stroke="none" />
	<circle cx="209" cy="116" r="15.5" class="fine" />
	<circle cx="209" cy="116" r="20" />
	<path d="M197 114q3-9 6 0t6 0 6 0 6 0v4q-3 9-6 0t-6 0-6 0-6 0z" class="c-primary tint" />

	<Mark x={31} y={20} n={1} />
	<Mark x={89} y={20} n={2} />
	<Mark x={150} y={20} n={3} />
	<Mark x={209} y={20} n={4} />
</DiagramFrame>

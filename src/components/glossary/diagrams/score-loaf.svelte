<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const BASE = 126;

	/** Round loaf seen from the side, w wide and h tall, sitting on BASE from x. */
	const boule = (x: number, w: number, h: number) =>
		`M${x} ${BASE}C${x} ${BASE - h * 0.6} ${x + w * 0.15} ${BASE - h} ${x + w / 2} ${BASE - h}S${x + w} ${BASE - h * 0.6} ${x + w} ${BASE}z`;
	/** Parchment under a loaf at x..x+w, its ends curling up. */
	const paper = (x: number, w: number) => `M${x - 7} ${BASE - 2}q1 2 3 2h${w + 8}q2 0 3-2`;

	/** Lame drawn along +x from its cutting corner at the origin: a blade on a bold handle. */
	const BLADE = 'M0 0h10v-3.5H2z';

	const falling: [number, number][] = [
		[27, 88],
		[34, 92],
		[38, 85],
		[30, 97],
		[37, 99]
	];
	const dusted: [number, number][] = [
		[20, 110],
		[27, 106.5],
		[34, 105.5],
		[41, 106.5],
		[46, 110]
	];
	const topDusted: [number, number][] = [
		[155, 113],
		[164, 119],
		[165, 108],
		[148, 123],
		[156, 127]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[44, 30]} to={[78, 30]} />
		<Arrow from={[102, 30]} to={[138, 30]} />
		<Arrow from={[162, 30]} to={[195, 30]} />
	</g>

	<!-- 1: the proofed loaf on parchment, flour shaken over it -->
	<path d={boule(12, 40, 22)} class="c-primary tint" />
	<path d={paper(12, 40)} class="fine" />
	<path d="M22 74h20" />
	<path d="M22 74a10 7 0 0 0 20 0" />
	<path d="M25 76.5a7 4.5 0 0 0 14 0" class="fine dashed" />
	<path d="M42 74l13-6" class="bold" />
	<g class="c-muted solid" stroke="none">
		{#each [...falling, ...dusted] as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="1.2" />
		{/each}
	</g>

	<!-- 2: the blade held low over the top, about 30 degrees to the surface -->
	<path d={boule(70, 40, 22)} class="c-primary tint" />
	<path d={paper(70, 40)} class="fine" />
	<g class="c-muted fine">
		<path d="M84 100h22" class="dashed" />
		<path d="M98 100A14 14 0 0 0 96.1 93" />
	</g>
	<g transform="translate(84 100) rotate(-30)">
		<path d={BLADE} class="c-accent tint" />
		<path d="M10 -1.75h24" class="bold" />
	</g>

	<!-- 3: from above, one quick curved stroke across the top -->
	<circle cx="150" cy="112" r="21" class="c-primary tint" />
	<g class="c-muted solid" stroke="none">
		{#each topDusted as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="1.2" />
		{/each}
	</g>
	<path d="M139 125Q143 108 157 100" class="bold" />
	<g transform="translate(157 100) rotate(-30)">
		<path d={BLADE} class="c-accent tint" />
		<path d="M10 -1.75h14" class="bold" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[133, 117]} to={[146, 100]} bend={-3} />
	</g>

	<!-- 4: in the hot oven the loaf springs up and the cut opens into an ear -->
	<rect x="182" y="64" width="50" height="72" rx="4" />
	<path d="M182 74h50" class="fine" />
	<circle cx="194" cy="69" r="2" class="fine" />
	<circle cx="220" cy="69" r="2" class="fine" />
	<rect x="187" y="79" width="40" height="52" rx="2" class="fine" />
	<g class="c-primary">
		<path d={`M192 84${'l3 3 3-3'.repeat(5)}`} class="fine" />
		<path d={`M192 128${'l3-3 3 3'.repeat(5)}`} class="fine" />
	</g>
	<path d="M189 124h36" class="bold" />
	<path d="M193 124C193 115 198 112 207 112S221 115 221 124" class="c-muted fine dashed" />
	<path
		d="M190 124C190 111 195 103.5 204 102C207 101.5 210.5 101 214 100.5Q215.5 101 214 102C213 102.8 211.5 103.3 210.5 103.6C213.5 104.3 216 105 218 106.5C222 109 224 115 224 124Z"
		class="c-primary tint"
	/>

	<Mark x={32} y={30} n={1} />
	<Mark x={90} y={30} n={2} />
	<Mark x={150} y={30} n={3} />
	<Mark x={207} y={30} n={4} />
</DiagramFrame>

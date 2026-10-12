<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Melting peak, cooling dip and working temperature on the curve. */
	const PEAK: [number, number] = [66, 40];
	const DIP: [number, number] = [108, 84];
	const WORK: [number, number] = [146, 68];
	const AXIS = 112;

	const curve =
		`M34 102C47 98 54 ${PEAK[1]} ${PEAK[0]} ${PEAK[1]}` +
		`C80 ${PEAK[1]} 94 ${DIP[1]} ${DIP[0]} ${DIP[1]}` +
		`C122 ${DIP[1]} 130 ${WORK[1]} ${WORK[0]} ${WORK[1]}H170`;

	/** Small bowl of melted chocolate under the axis, rim centred on cx. */
	const BOWL_Y = 120;
	const bowl = (cx: number) => `M${cx - 13} ${BOWL_Y}h26M${cx - 11} ${BOWL_Y}a11 11 0 0 0 22 0`;
	const choc = (cx: number) => `M${cx - 10.4} ${BOWL_Y + 3}h20.8a11 11 0 0 1 -20.8 0z`;

	/** Flame 6 wide and 9 tall standing on (x, y). */
	const flame = (x: number, y: number) => `M${x} ${y}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;

	/** Four-point sparkle centred on (x, y), r long. */
	const sparkle = (x: number, y: number, r: number) =>
		`M${x} ${y - r}q0 ${r} ${r} ${r}q-${r} 0-${r} ${r}q0-${r}-${r}-${r}q${r} 0 ${r}-${r}z`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- thermometer on the temperature axis -->
	<rect x="12" y="24" width="7" height="38" rx="3.5" />
	<circle cx="15.5" cy="66" r="5.5" />
	<g class="c-primary">
		<circle cx="15.5" cy="66" r="3.2" class="solid" stroke="none" />
		<path d="M15.5 63V36" class="bold" />
	</g>
	<path d="M19 32h3M19 40h3M19 48h3M19 56h3" class="fine" />

	<g class="c-muted fine">
		<Arrow from={[28, AXIS]} to={[28, 26]} />
		<Arrow from={[28, AXIS]} to={[176, AXIS]} />
		<path d={`M${PEAK[0]} ${PEAK[1] + 5}V${AXIS}M${DIP[0]} ${DIP[1] + 5}V${AXIS}M${WORK[0]} ${WORK[1] + 5}V${AXIS}`} class="dashed" />
	</g>

	<!-- 1-3: melt high, cool while stirring, rewarm a little -->
	<g class="c-primary">
		<path d={curve} class="bold" />
		<circle cx={PEAK[0]} cy={PEAK[1]} r="3.2" class="solid" stroke="none" />
		<circle cx={DIP[0]} cy={DIP[1]} r="3.2" class="solid" stroke="none" />
		<circle cx={WORK[0]} cy={WORK[1]} r="3.2" class="solid" stroke="none" />
	</g>

	<!-- the bowl at each stage: gentle heat, stirring off the heat, a touch of heat -->
	<path d={choc(PEAK[0])} class="c-primary tint" />
	<path d={bowl(PEAK[0])} />
	<g class="c-primary">
		<path d={flame(PEAK[0] - 8, 144)} class="tint" />
		<path d={flame(PEAK[0], 144)} class="tint" />
		<path d={flame(PEAK[0] + 8, 144)} class="tint" />
	</g>

	<path d={choc(DIP[0])} class="c-primary tint" />
	<g class="c-accent" transform={`translate(${DIP[0] - 1} 129) rotate(35)`}>
		<path d="M-3.5 -9h7v6q0 3-3.5 3t-3.5-3z" class="tint" />
		<path d="M0 -9v-7" class="bold" />
	</g>
	<path d={bowl(DIP[0])} />

	<path d={choc(WORK[0])} class="c-primary tint" />
	<path d={bowl(WORK[0])} />
	<path d={flame(WORK[0], 144)} class="c-primary tint" />

	<!-- 4: a test smear on parchment sets glossy -->
	<g class="c-muted fine">
		<Arrow from={[174, 66]} to={[189, 82]} bend={-6} />
	</g>
	<path d="M183 124l10-34h37l-10 34z" />
	<path d="M190 116c2-9 10-15 22-15 4 0 5 4 1 5-8 1-13 5-15 11-1 3-8 3-8-1z" class="c-primary solid" />
	<path d="M198 107q4-3 9-3.5" stroke="var(--surface-sunken)" />
	<path d={sparkle(221, 96, 4)} class="fine" />
	<path d={sparkle(194, 99, 2.6)} class="fine" />

	<Mark x={PEAK[0]} y={25} n={1} />
	<Mark x={DIP[0]} y={100} n={2} />
	<Mark x={WORK[0]} y={53} n={3} />
	<Mark x={207} y={64} n={4} />
</DiagramFrame>

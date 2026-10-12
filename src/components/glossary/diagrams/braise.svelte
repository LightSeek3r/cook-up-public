<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Heavy pot w wide and 22 deep, (x, y) being the top of its left wall; loop handles outside. */
	const pot = (x: number, y: number, w: number) =>
		`M${x} ${y}v16q0 6 6 6h${w - 12}q6 0 6-6v-16M${x} ${y + 4}h-4v5h4M${x + w} ${y + 4}h4v5h-4`;
	/** Domed lid over a pot of the same x and w, with its knob. */
	const lid = (x: number, y: number, w: number) =>
		`M${x - 2} ${y}q${w / 2 + 2}-10 ${w + 4} 0zM${x + w / 2 - 3} ${y - 5}v-3h6v3`;
	/** Chunk of meat seen from the side, 22 wide and 11 tall, (x, y) being its bottom-left corner. */
	const chunk = (x: number, y: number) => `M${x} ${y}c-1-4 0-9 3-11c5-2 12-2 17 0c3 2 3 7 2 11z`;
	/** The browned crust just under its top, and the butcher's string round it. */
	const crust = (x: number, y: number) => `M${x + 3} ${y - 8}c5-1.5 11-1.5 16 0`;
	const string = (x: number, y: number) => `M${x + 8} ${y - 12}v12M${x + 15} ${y - 12}v12`;

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;

	/** Half an onion ring, 7 wide, standing on (x, y). */
	const onion = (x: number, y: number) => `M${x} ${y}a3.5 3.5 0 0 1 7 0M${x + 2} ${y}a1.5 1.5 0 0 1 3 0`;

	const flame = (x: number, y: number) => `M${x} ${y}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;
	/** Oven heating element as a zigzag from x0, n teeth of 6. */
	const element = (x0: number, y: number, n: number) => `M${x0} ${y}${'l3 2.5 3-2.5'.repeat(n)}`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- 1: the meat browning in hot fat -->
	<path d="M14 63h40v1q0 4-4 4H18q-4 0-4-4z" class="c-accent tint" stroke="none" />
	<path d="M14 63h40" class="c-accent fine" />
	<g class="c-primary">
		<path d={chunk(23, 66)} class="tint" />
		<path d={crust(23, 66)} />
		<path d={string(23, 66)} class="fine" />
	</g>
	<path d="M19 57l-3-3M50 57l3-3M34 50v-4M27 51l-1-3M42 51l1-3" class="c-muted fine" />
	<path d={pot(12, 46, 44)} />
	<g class="c-primary">
		<path d={flame(24, 82)} class="tint" />
		<path d={flame(34, 82)} class="tint" />
		<path d={flame(44, 82)} class="tint" />
	</g>

	<!-- 2: onion and liquid in the same pot, the browned bits scraped up -->
	<path d={`${wave(64, 123, 5)}V128q0 4-4 4H68q-4 0-4-4z`} class="c-accent tint" stroke="none" />
	<path d={wave(64, 123, 5)} class="c-accent" />
	<g class="c-primary fine">
		<path d={onion(69, 122)} />
		<path d={onion(80, 121)} />
		<path d={onion(90, 122)} />
	</g>
	<g class="c-primary solid" stroke="none">
		<circle cx="74" cy="130" r="1.2" />
		<circle cx="82" cy="131" r="1.2" />
		<circle cx="88" cy="129.5" r="1.2" />
	</g>
	<g transform="rotate(50 74 92)">
		<path d="M68 84h12l-1 15q0 2-2 2h-6q-2 0-2-2z" />
		<path d="M68.5 89h-3q-1.5 0-1.5 1.5v4q0 1.5 1.5 1.5h3.5" />
	</g>
	<path d="M84 92q3 10 1 30" class="c-accent" />
	<path d="M108 94 96 122" class="bold" />
	<path d="M96 122c-2 4-1 8 1 8.5s3-3 1.5-8z" class="bold" />
	<path d={pot(62, 112, 44)} />
	<g class="c-primary">
		<path d={flame(74, 146)} class="tint" />
		<path d={flame(84, 146)} class="tint" />
		<path d={flame(94, 146)} class="tint" />
	</g>

	<!-- 3: the meat back in, the liquid halfway up its sides -->
	<g class="c-muted fine">
		<Arrow from={[131, 24]} to={[131, 44]} />
	</g>
	<path d={`${wave(110, 60, 5)}V62q0 4-4 4H114q-4 0-4-4z`} class="c-accent tint" stroke="none" />
	<g class="c-primary">
		<path d={chunk(119, 66)} class="tint" />
		<path d={crust(119, 66)} />
		<path d={string(119, 66)} class="fine" />
	</g>
	<path d={wave(110, 60, 5)} class="c-accent" />
	<path d={pot(108, 46, 44)} />

	<!-- 4: covered, low and slow in the oven -->
	<rect x="140" y="88" width="56" height="58" rx="4" />
	<path d="M140 97h56" />
	<circle cx="148" cy="92.5" r="2" class="fine" />
	<circle cx="156" cy="92.5" r="2" class="fine" />
	<rect x="146" y="102" width="44" height="38" rx="2" class="fine" />
	<g class="c-primary fine">
		<path d={element(150, 106, 6)} />
		<path d={element(150, 134, 6)} />
	</g>
	<path d={`M156 124h28v3q0 3-3 3h-22q-3 0-3-3z`} class="c-accent tint" stroke="none" />
	<path d="M154 118v9q0 4 4 4h24q4 0 4-4v-9M154 121h-3v3h3M186 121h3v3h-3" />
	<path d={lid(154, 118, 32)} />

	<!-- 5: the meat lifted out, the liquid reduced to a sauce -->
	<path d="M184 55h40" class="c-accent fine dashed" />
	<path d={`${wave(184, 61, 5)}V62q0 4-4 4H188q-4 0-4-4z`} class="c-accent tint" stroke="none" />
	<path d={wave(184, 61, 5)} class="c-accent" />
	<g class="c-muted fine">
		<path d={steam(197, 44)} />
		<path d={steam(205, 44)} />
		<path d={steam(213, 44)} />
	</g>
	<path d={pot(182, 46, 44)} />
	<g class="c-primary">
		<path d={flame(196, 82)} class="tint" />
		<path d={flame(205, 82)} class="tint" />
		<path d={flame(214, 82)} class="tint" />
	</g>
	<g class="c-primary">
		<path d={chunk(205, 104)} class="tint" />
		<path d={crust(205, 104)} />
		<path d={string(205, 104)} class="fine" />
	</g>
	<ellipse cx="216" cy="105" rx="16" ry="3.5" />

	<Mark x={34} y={24} n={1} />
	<Mark x={42} y={104} n={2} />
	<Mark x={114} y={26} n={3} />
	<Mark x={168} y={74} n={4} />
	<Mark x={222} y={24} n={5} />
</DiagramFrame>

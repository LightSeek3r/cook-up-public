<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const RIM = 100;

	/** Wide shallow pan w across and 18 deep, (x, RIM) being its top-left; loop handles outside. */
	const pan = (x: number, w: number) =>
		`M${x - 2} ${RIM}h${w + 4}M${x} ${RIM}l2 16q.5 2 2.5 2h${w - 9}q2 0 2.5-2l2-16M${x - 1} ${RIM + 3}h-4v4h4.5M${x + w + 1} ${RIM + 3}h4v4h-4.5`;

	/** Wavy liquid surface from x0 to x0 + n*8 */
	const wave = (x0: number, y: number, n: number) => `M${x0} ${y}q2-2.4 4 0${'t4 0'.repeat(n * 2 - 1)}`;
	/** The liquid in a 42-wide pan at x, its surface at y. */
	const liquid = (x: number, y: number) => `${wave(x + 3, y, 4.5)}L${x + 38} ${RIM + 16.5}H${x + 4}z`;

	const flame = (x: number) => `M${x} ${RIM + 31}c-3-2-3-6 0-9 0 3 3 3 3 6 0 2-1 3-3 3z`;
	const steam = (x: number, y: number, n = 2) => `M${x} ${y}q-3-4 0-8${'t0-8'.repeat(n - 1)}`;

	/** The sauce coating the back of the spoon, as two caps of one ellipse with a clean finger line between. */
	const cap = (cx: number, cy: number, rx: number, ry: number, dy: number) => {
		const hw = rx * Math.sqrt(1 - (dy * dy) / (ry * ry));
		return `M${cx - hw} ${cy + dy}A${rx} ${ry} 0 0 ${dy < 0 ? 1 : 0} ${cx + hw} ${cy + dy}z`;
	};
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[42, 22]} to={[80, 22]} />
		<Arrow from={[105, 22]} to={[139, 22]} />
		<Arrow from={[163, 22]} to={[196, 22]} />
	</g>

	<!-- 1: the liquid poured into a wide pan -->
	<g transform="rotate(40 28 70)">
		<path d="M20 58h16l-1.5 22q0 2-2 2h-9q-2 0-2-2z" />
		<path d="M36 58l3-2" />
		<path d="M20.5 63h-4q-2 0-2 2v8q0 2 2 2h3.5" />
	</g>
	<path d="M45 66c3 4 4 16 2 38" class="c-accent" />
	<path d={liquid(14, 104)} class="c-accent tint" stroke="none" />
	<path d={wave(17, 104, 4.5)} class="c-accent" />
	<path d={pan(14, 42)} />

	<!-- 2: brought to a simmer, uncovered, over medium heat -->
	<path d={liquid(72, 104)} class="c-accent tint" stroke="none" />
	<path d={wave(75, 104, 4.5)} class="c-accent" />
	<g class="c-accent fine">
		<circle cx="83" cy="110" r="1.5" />
		<circle cx="93" cy="113" r="1.5" />
		<circle cx="103" cy="109.5" r="1.5" />
	</g>
	<g class="c-muted fine">
		<path d={steam(87, 96)} />
		<path d={steam(99, 96)} />
	</g>
	<path d={pan(72, 42)} />
	<g class="c-primary">
		<path d={flame(84)} class="tint" />
		<path d={flame(93)} class="tint" />
		<path d={flame(102)} class="tint" />
	</g>

	<!-- 3: the level drops as steam rises, the foam skimmed off -->
	<path d="M133 104h36" class="c-accent fine dashed" />
	<path d={liquid(130, 111)} class="c-accent tint" stroke="none" />
	<path d={wave(133, 111, 4.5)} class="c-accent" />
	<g class="c-muted fine">
		<path d={steam(152, 98, 3)} />
		<path d={steam(159, 98, 3)} />
		<path d={steam(166, 98, 3)} />
	</g>
	<!-- the skimmer lifting a cap of foam away -->
	<path d="M133 89 123 64" class="bold" />
	<ellipse cx="141" cy="90" rx="8" ry="2.5" />
	<g class="fine">
		<circle cx="137" cy="86.5" r="1.7" />
		<circle cx="140.5" cy="85.5" r="2" />
		<circle cx="144.5" cy="86.5" r="1.6" />
		<circle cx="139" cy="109" r="1.2" />
		<circle cx="143" cy="109.5" r="1" />
	</g>
	<path d="M137 93v3M141 93.5v3M145 93v3" class="c-muted fine dashed" />
	<path d={pan(130, 42)} />
	<g class="c-primary">
		<path d={flame(142)} class="tint" />
		<path d={flame(151)} class="tint" />
		<path d={flame(160)} class="tint" />
	</g>

	<!-- 4: it coats the back of a spoon and holds a line -->
	<g transform="rotate(18 208 104)">
		<g class="c-accent">
			<path d={cap(208, 87, 8, 11, -2)} class="tint" />
			<path d={cap(208, 87, 8, 11, 2)} class="tint" />
		</g>
		<path d="M208 72c6.5 0 10.5 6 10.5 13.5S214 100 208 100s-10.5-7-10.5-14.5S201.5 72 208 72z" />
		<path d="M206.6 99.8 205.5 135q0 3 2.5 3t2.5-3L209.4 99.8" />
	</g>

	<Mark x={30} y={22} n={1} />
	<Mark x={93} y={22} n={2} />
	<Mark x={151} y={22} n={3} />
	<Mark x={208} y={22} n={4} />
</DiagramFrame>

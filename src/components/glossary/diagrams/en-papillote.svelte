<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Fish fillet seen from above, 20 wide and 11 tall, (x, y) being its leftmost point. */
	const fillet = (x: number, y: number) => `M${x} ${y}c2-6 8-8 14-7c4 .5 6 3 6 6s-3 5-8 5c-6 0-11-1-12-4z`;
	/** Drop, point up, 5 wide and 7 tall, anchored at its tip. */
	const drop = (x: number, y: number) => `M${x} ${y}c-.7 1.8-2.5 3.2-2.5 5a2.5 2.5 0 0 0 5 0c0-1.8-1.8-3.2-2.5-5z`;

	/** The half-moon packet: the fold along x = 136 (the food went on the left half), curved edge out to the left. */
	const CX = 136;
	const CY = 52;
	/** Pleats of the crimped edge, each slanting a little as it runs out to the rim. */
	const pleats = Array.from({ length: 11 }, (_, i) => {
		const t = ((-75 + i * 15) * Math.PI) / 180;
		const ix = CX - 33 * Math.cos(t);
		const iy = CY + 14 * Math.sin(t);
		const ox = CX - 40 * Math.cos(t + 0.14);
		const oy = CY + 20 * Math.sin(t + 0.14);
		return `M${ix.toFixed(1)} ${iy.toFixed(1)}L${ox.toFixed(1)} ${oy.toFixed(1)}`;
	}).join('');

	/** The sealed packet puffed up, side view: a 34-wide dome standing on (x, y). */
	const dome = (x: number, y: number) => `M${x} ${y}c0-12 8-18 17-18s17 6 17 18z`;
	/** Pleats along the dome's crimped bottom seam. */
	const crimp = (x: number, y: number) =>
		[4, 9, 14, 19, 24, 29].map((dx) => `M${x + dx} ${y}v-2`).join('');
	/** Baking tray 40 across under a packet, its lips turned up. */
	const tray = (x: number, y: number) => `M${x} ${y}h40M${x} ${y - 3}l1 3M${x + 40} ${y - 3}l-1 3`;

	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8t0-8`;
	/** Oven heating element as a zigzag from x0, n teeth of 6. */
	const element = (x0: number, y: number, n: number) => `M${x0} ${y}${'l3 2.5 3-2.5'.repeat(n)}`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- 1: a large sheet of parchment, creased down the middle -->
	<rect x="12" y="34" width="48" height="34" rx="1.5" class="c-accent tint" />
	<path d="M36 34v34" class="c-accent fine dashed" />

	<!-- 2: the seasoned food, vegetables and a little liquid on one half -->
	<rect x="50" y="92" width="52" height="36" rx="1.5" class="c-accent tint" />
	<path d="M76 92v36" class="c-accent fine dashed" />
	<path d={fillet(53, 105)} class="c-primary tint" />
	<g class="fine">
		<circle cx="57.5" cy="114" r="2.6" />
		<circle cx="63.5" cy="115" r="2.6" />
		<circle cx="69.5" cy="113.5" r="2.6" />
	</g>
	<g class="c-accent">
		<path d={drop(57, 118)} class="tint" />
		<path d={drop(64, 120)} class="tint" />
		<path d={drop(71, 118)} class="tint" />
	</g>

	<!-- 3: folded over the food, the edge crimped tight -->
	<path d={`M${CX} ${CY - 20}A40 20 0 0 0 ${CX} ${CY + 20}z`} class="c-accent tint" />
	<path d={`M${CX} ${CY - 14}A33 14 0 0 0 ${CX} ${CY + 14}`} class="c-accent fine" />
	<path d={pleats} class="c-accent fine" />
	<path d={fillet(110, 53)} class="c-primary fine dashed" />

	<!-- 4: baked on a tray until the packet puffs with steam -->
	<rect x="128" y="88" width="60" height="58" rx="4" />
	<path d="M128 97h60" />
	<circle cx="136" cy="92.5" r="2" class="fine" />
	<circle cx="144" cy="92.5" r="2" class="fine" />
	<rect x="134" y="102" width="48" height="38" rx="2" class="fine" />
	<g class="c-primary fine">
		<path d={element(140, 106, 6)} />
		<path d={element(140, 134, 6)} />
	</g>
	<path d={dome(141, 129)} class="c-accent tint" />
	<path d={crimp(141, 129)} class="c-accent fine" />
	<path d="M152 124q-2-3 0-6t0-6M163 124q-2-3 0-6t0-6" class="c-muted fine dashed" />
	<path d={tray(138, 130)} />

	<!-- 5: opened with care, the top layer lifted back on its fold and the steam let out -->
	<g class="c-muted fine">
		<path d={steam(208, 60)} />
		<path d={steam(215, 58)} />
		<path d={steam(222, 60)} />
	</g>
	<path d="M186 68c0-14 8-26 22-32c-2 12-10 24-22 32z" class="c-accent tint" />
	<path d="M190.5 59.5l-2.5-1.5M195 52.5l-2.5-1.5M200 46.5l-2.5-1.5" class="c-accent fine" />
	<path d="M195 66.5c2-5 15-6.5 21-1z" class="c-primary tint" />
	<path d="M185 66.5q2 3.5 6 3.5h26q4 0 6-3.5z" class="c-accent tint" />
	<path d={tray(184, 70)} />

	<Mark x={22} y={20} n={1} />
	<Mark x={38} y={104} n={2} />
	<Mark x={116} y={20} n={3} />
	<Mark x={158} y={74} n={4} />
	<Mark x={224} y={24} n={5} />
</DiagramFrame>

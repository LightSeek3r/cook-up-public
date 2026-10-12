<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	const RIM = 104;
	const round = (v: number) => Math.round(v * 100) / 100;

	/** Bowl cross-section: a rim line overhanging cx±r at RIM and a half-ellipse body d deep. */
	const bowl = (cx: number, r: number, d: number) =>
		`M${cx - r - 3} ${RIM}h${2 * r + 6}M${cx - r} ${RIM}a${r} ${d} 0 0 0 ${2 * r} 0`;
	/** Half-width of that bowl at `l` below the rim. */
	const half = (r: number, d: number, l: number) => round(r * Math.sqrt(1 - (l / d) ** 2));
	/** The heavy base filling the bowl up to a flat top `l` below the rim. */
	const base = (cx: number, r: number, d: number, l: number) => {
		const a = half(r, d, l);
		return `M${round(cx - a)} ${RIM + l}h${2 * a}A${r} ${d} 0 0 1 ${round(cx - a)} ${RIM + l}z`;
	};

	/** Three soft bumps from (x, y) to (x + w, y), rising h; no leading M. */
	const bumps = (x: number, y: number, w: number, h: number) => {
		const pts: [number, number][] = [
			[x + w * 0.2, y - h * 0.62],
			[x + w * 0.52, y - h],
			[x + w * 0.82, y - h * 0.6],
			[x + w, y]
		];
		let prev: [number, number] = [x, y];
		let d = '';
		for (const [px, py] of pts) {
			const r = round(Math.hypot(px - prev[0], py - prev[1]) * 0.56);
			d += `A${r} ${r} 0 0 1 ${round(px)} ${round(py)}`;
			prev = [px, py];
		}
		return d;
	};
	/** A free dollop of the light mixture, flat underneath. */
	const dollop = (x: number, y: number, w: number, h: number) => `M${x} ${y}${bumps(x, y, w, h)}z`;
	/**
	 * The light mixture piled on the base: up the bowl wall from the base's top, heaped above the
	 * rim, and back down the far wall. Open along the bottom so only the base's own edge shows there.
	 */
	const mound = (cx: number, r: number, d: number, l: number, h: number) => {
		const a = half(r, d, l);
		return (
			`M${round(cx - a)} ${RIM + l}A${r} ${d} 0 0 1 ${cx - r} ${RIM}` +
			bumps(cx - r, RIM, 2 * r, h) +
			`A${r} ${d} 0 0 1 ${round(cx + a)} ${RIM + l}`
		);
	};

	/** Rubber spatula blade with its tip at the origin, handle going up; place with a transform. */
	const blade = 'M-5 -15h10v10q0 5-5 5t-5-5z';

	const bubbles: [number, number][] = [
		[23, 120],
		[31, 125],
		[39, 120],
		[45, 124],
		[35, 130]
	];
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[45, 20]} to={[78, 20]} />
		<Arrow from={[102, 20]} to={[140, 20]} />
		<Arrow from={[164, 20]} to={[199, 20]} />
	</g>

	<!-- 1: a little of the light mixture stirred into the base to loosen it -->
	<path d={base(33, 22, 28, 12)} class="c-primary tint" />
	<g class="fine">
		{#each bubbles as [cx, cy] (cx)}
			<circle {cx} {cy} r="1.6" />
		{/each}
	</g>
	<path d={dollop(25, 76, 16, 11)} />
	<g class="c-muted fine">
		<Arrow from={[33, 82]} to={[33, 108]} />
	</g>
	<path d={bowl(33, 22, 28)} />

	<!-- 2: the rest of the light mixture piled on top -->
	<path d={base(90, 22, 28, 14)} class="c-primary tint" />
	<path d={mound(90, 22, 28, 14, 24)} />
	<path d={bowl(90, 22, 28)} />

	<!-- 3: cut down the middle, sweep the bottom, lift up and over -->
	<path d={base(152, 25, 32, 6)} class="c-primary tint" />
	<path d={dollop(130, 116, 13, 6)} class="fine" />
	<path d={dollop(162, 115, 13, 6)} class="fine" />
	<g class="c-accent" transform="translate(152 130)">
		<path d={blade} class="tint" />
		<path d="M0 -15v-44" class="bold" />
	</g>
	<g class="c-muted">
		<Arrow from={[142, 74]} to={[142, 98]} />
		<Arrow d="M159 131c6 0 11-3 13-9s2-14-2-18q-5-6-13-6" />
	</g>
	<path d={bowl(152, 25, 32)} />

	<!-- 4: seen from above, the bowl turned a little; no streaks left -->
	<circle cx="211" cy="110" r="15.5" class="c-primary tint" stroke="none" />
	<circle cx="211" cy="110" r="15.5" class="fine" />
	<circle cx="211" cy="110" r="20" />
	<g class="c-accent" transform="translate(205 116) rotate(45)">
		<path d={blade} class="tint" />
		<path d="M0 -15v-20" class="bold" />
	</g>
	<g class="c-muted">
		<Arrow d="M229.2 125.3A24 24 0 0 1 192.8 125.3" />
	</g>

	<Mark x={33} y={20} n={1} />
	<Mark x={90} y={20} n={2} />
	<Mark x={152} y={20} n={3} />
	<Mark x={211} y={20} n={4} />
</DiagramFrame>

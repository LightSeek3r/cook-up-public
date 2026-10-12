<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/*
	 * A tart pan in three-quarter view: the rim is an ellipse rx wide around (cx, cy), flattened to
	 * ry = 0.3 rx, and the fluted wall drops d = 0.4 rx to a slightly narrower base.
	 */
	const ry = (rx: number) => rx * 0.3;
	const depth = (rx: number) => rx * 0.4;
	const pan = (cx: number, cy: number, rx: number) =>
		`M${cx - rx} ${cy}L${cx - rx + 3} ${cy + depth(rx)}A${rx - 3} ${ry(rx) - 1} 0 0 0 ${cx + rx - 3} ${cy + depth(rx)}L${cx + rx} ${cy}`;
	/** Short flute lines down the front wall, between the rim's front arc and the base's. */
	const flutes = (cx: number, cy: number, rx: number) =>
		[-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]
			.map((k) => {
				const x = cx + k * rx;
				const top = cy + ry(rx) * Math.sqrt(1 - k * k);
				const kb = (k * rx) / (rx - 3);
				const bottom = cy + depth(rx) + (ry(rx) - 1) * Math.sqrt(1 - kb * kb);
				return `M${x.toFixed(1)} ${(top + 1).toFixed(1)}V${(bottom - 1).toFixed(1)}`;
			})
			.join('');

	/** Docking holes across the pastry floor, as fractions of its half-axes. */
	const HOLES: [number, number][] = [
		[-0.6, 0.05],
		[-0.28, -0.45],
		[-0.28, 0.5],
		[0.05, 0.05],
		[0.38, -0.45],
		[0.38, 0.5],
		[0.68, 0.05]
	];
	const holes = (cx: number, cy: number, rx: number) =>
		HOLES.map(([u, v]) => [cx + u * rx * 0.72, cy + 1.2 + v * ry(rx) * 0.7] as const);

	/** Parchment corners standing up out of the shell on both sides. */
	const paper = (cx: number, cy: number, rx: number) =>
		`M${cx - rx + 3} ${cy}L${cx - rx - 3} ${cy - 9}l5 1.5 1.5-5.5 4 7.5z` +
		`M${cx + rx - 3} ${cy}L${cx + rx + 3} ${cy - 9}l-5 1.5-1.5-5.5-4 7.5z`;

	/** A mound of baking beads filling the shell to the rim, rows as (dy, half-width / rx). */
	const ROWS: [number, number][] = [
		[2, 0.62],
		[-1.5, 0.78],
		[-5, 0.55],
		[-8.5, 0.28]
	];
	const beads = (cx: number, cy: number, rx: number) =>
		ROWS.flatMap(([dy, f]) => {
			const n = Math.max(1, Math.round((2 * f * rx) / 5.2));
			const step = n > 1 ? (2 * f * rx) / (n - 1) : 0;
			return Array.from({ length: n }, (_, i) => [cx - f * rx + i * step, cy + dy] as const);
		});

	const steam = (x: number, y: number) => `M${x} ${y}q-3-4 0-8t0-8`;

	const C3 = 152;
	const C4 = 210;
	/** The paper and beads lifted out by its gathered edges, sling bottom at y 90. */
	const sling = `M${C4 - 16} 76C${C4 - 13} 92 ${C4 + 13} 92 ${C4 + 16} 76L${C4 + 6} 61l-2.5-3-2 3-1.5-4-1.5 4-2-3-2.5 3z`;
	const slingBeads: [number, number][] = [
		[C4 - 8, 84],
		[C4 - 3, 85.5],
		[C4 + 2, 85.5],
		[C4 + 7, 84],
		[C4 - 11, 79],
		[C4 - 5.5, 80],
		[C4, 80.5],
		[C4 + 5.5, 80],
		[C4 + 11, 79]
	];
</script>

{#snippet tart(cx: number, cy: number, rx: number, golden: boolean)}
	<path d={pan(cx, cy, rx)} />
	<path d={flutes(cx, cy, rx)} class="fine" />
	<ellipse {cx} {cy} {rx} ry={ry(rx)} />
	<g class="c-primary">
		<ellipse {cx} {cy} rx={rx - 1.5} ry={ry(rx) - 0.6} class="tint" />
		<ellipse {cx} cy={cy + 1.2} rx={rx * 0.74} ry={ry(rx) * 0.72} class="fine" class:tint={golden} />
	</g>
{/snippet}

{#snippet filled(cx: number, cy: number, rx: number)}
	{@render tart(cx, cy, rx, false)}
	<path d={paper(cx, cy, rx)} class="c-accent tint fine" />
	<g class="c-muted tint fine">
		{#each beads(cx, cy, rx) as [x, y] (`${x} ${y}`)}
			<circle cx={x} cy={y} r="2.4" />
		{/each}
	</g>
{/snippet}

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[44, 34]} to={[80, 34]} />
		<Arrow from={[104, 34]} to={[140, 34]} />
		<Arrow from={[164, 34]} to={[198, 34]} />
	</g>

	<!-- 1: pastry pressed into the pan, the base pricked with a fork -->
	{@render tart(32, 116, 22, false)}
	<g class="solid" stroke="none">
		{#each holes(32, 116, 22) as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="0.9" />
		{/each}
	</g>
	<g transform="translate(37 116) rotate(22)">
		<path d="M-4.5 0V-9M-1.5 0V-9M1.5 0V-9M4.5 0V-9" class="fine" />
		<path d="M-4.5 -9q0-5 4.5-6.5q4.5 1.5 4.5 6.5" />
		<path d="M0 -15.5V-46" class="bold" />
	</g>

	<!-- 2: lined with parchment and filled to the top with weights -->
	{@render filled(92, 116, 22)}

	<!-- 3: baked like that until the edges set -->
	<rect x="127" y="62" width="50" height="78" rx="4" />
	<path d="M127 72h50" class="fine" />
	<circle cx="139" cy="67" r="2" class="fine" />
	<circle cx="165" cy="67" r="2" class="fine" />
	<rect x="132" y="77" width="40" height="58" rx="2" class="fine" />
	<g class="c-primary fine">
		<path d={`M137 82${'l3 3 3-3'.repeat(5)}`} />
		<path d={`M137 131${'l3-3 3 3'.repeat(5)}`} />
	</g>
	<path d="M134 127h36" class="bold" />
	{@render filled(C3, 116, 16)}

	<!-- 4: paper and weights lifted out, the bare base baked on until dry and golden -->
	{@render tart(C4, 118, 22, true)}
	<g class="solid" stroke="none">
		{#each holes(C4, 118, 22) as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="0.9" />
		{/each}
	</g>
	<g class="c-muted fine">
		<path d={steam(C4 - 6, 112)} />
		<path d={steam(C4, 110)} />
		<path d={steam(C4 + 6, 112)} />
		<Arrow from={[C4 - 24, 104]} to={[C4 - 24, 70]} />
	</g>
	<path d={sling} class="c-accent tint fine" />
	<g class="c-muted tint fine">
		{#each slingBeads as [cx, cy] (`${cx} ${cy}`)}
			<circle {cx} {cy} r="2.4" />
		{/each}
	</g>

	<Mark x={32} y={34} n={1} />
	<Mark x={92} y={34} n={2} />
	<Mark x={C3} y={34} n={3} />
	<Mark x={C4} y={34} n={4} />
</DiagramFrame>

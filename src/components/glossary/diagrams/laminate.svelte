<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Butter lines for a w x h block of dough at (x, y) holding n even layers of butter. */
	const layers = (x: number, y: number, w: number, h: number, n: number) =>
		Array.from({ length: n }, (_, i) => `M${x + 3} ${y + ((i + 1) * h) / (n + 1)}H${x + w - 3}`).join('');

	/** Six-armed snowflake centred on (x, y), r long. */
	const snowflake = (x: number, y: number, r: number) =>
		[0, 60, 120]
			.map((deg) => {
				const t = (deg * Math.PI) / 180;
				const dx = Math.round(Math.cos(t) * r * 100) / 100;
				const dy = Math.round(Math.sin(t) * r * 100) / 100;
				return `M${x - dx} ${y - dy}L${x + dx} ${y + dy}`;
			})
			.join('');

</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[40, 20]} to={[62, 20]} />
		<Arrow from={[86, 20]} to={[108, 20]} />
		<Arrow from={[132, 20]} to={[154, 20]} />
		<Arrow from={[178, 20]} to={[200, 20]} />
	</g>

	<!-- 1: a flat block of butter sealed inside the dough -->
	<rect x="17" y="87" width="22" height="8" rx="1.5" class="c-primary tint" />
	<rect x="10" y="80" width="36" height="22" rx="7" />
	<path d="M28 80v5" class="fine" />

	<!-- 2: rolled out into a long, thin rectangle -->
	<rect x="52" y="96" width="44" height="8" rx="3" />
	<path d="M55 100H93" class="c-primary bold" />
	<circle cx="74" cy="88.5" r="7" class="c-accent tint" />
	<circle cx="74" cy="88.5" r="1.5" class="c-accent solid" stroke="none" />
	<g class="c-muted fine">
		<Arrow from={[66, 74]} to={[54, 74]} />
		<Arrow from={[82, 74]} to={[94, 74]} />
	</g>

	<!-- 3: folded in three like a letter -->
	<rect x="106" y="82" width="28" height="22" rx="3" />
	<path d="M106 89.33H134M106 96.67H134" class="fine" />
	<path d={layers(106, 82, 28, 22, 3)} class="c-primary" />
	<g class="c-muted fine">
		<Arrow d="M103 98C95 86 101 72 114 76" />
		<Arrow d="M137 98C145 86 139 72 126 76" />
	</g>

	<!-- 4: resting in the fridge -->
	<rect x="148" y="44" width="36" height="88" rx="4" />
	<path d="M148 66H184M154 110H178M152 132v4M180 132v4" />
	<path d={snowflake(166, 55, 6)} class="c-accent" />
	<rect x="156" y="96" width="20" height="14" rx="2" />
	<path d={layers(156, 96, 20, 14, 3)} class="c-primary fine" />

	<!-- 5: the turns repeated, building many thin layers -->
	<rect x="194" y="84" width="36" height="21" rx="4" />
	<path d={layers(194, 84, 36, 21, 6)} class="c-primary fine" />
	<g class="c-muted fine">
		<Arrow d="M212 112C212 158 74 158 74 110" dashed />
	</g>

	<Mark x={28} y={20} n={1} />
	<Mark x={74} y={20} n={2} />
	<Mark x={120} y={20} n={3} />
	<Mark x={166} y={20} n={4} />
	<Mark x={212} y={20} n={5} />
</DiagramFrame>

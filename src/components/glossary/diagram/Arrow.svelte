<script lang="ts">
	type Point = readonly [number, number];

	interface Props {
		/** a full path; takes precedence over from/to */
		d?: string;
		from?: Point;
		to?: Point;
		/** sideways offset of the curve's midpoint from the straight from→to line; 0 = straight */
		bend?: number;
		dashed?: boolean;
	}

	let { d, from, to, bend = 0, dashed = false }: Props = $props();

	const uid = $props.id();
	const headId = `${uid}-head`;

	const path = $derived.by(() => {
		if (d) return d;
		if (!from || !to) return '';
		const [fx, fy] = from;
		const [tx, ty] = to;
		if (!bend) return `M${fx} ${fy}L${tx} ${ty}`;
		const len = Math.hypot(tx - fx, ty - fy) || 1;
		const cx = (fx + tx) / 2 + (-(ty - fy) / len) * bend;
		const cy = (fy + ty) / 2 + ((tx - fx) / len) * bend;
		return `M${fx} ${fy}Q${cx} ${cy} ${tx} ${ty}`;
	});
</script>

<!-- The marker lives inside this <g> so its currentColor resolves to the arrow's
	 colour: marker content inherits from its own ancestors, not from the path. -->
<g class="arrow">
	<defs>
		<marker
			id={headId}
			viewBox="0 0 10 10"
			refX="8"
			refY="5"
			markerWidth="7"
			markerHeight="7"
			markerUnits="userSpaceOnUse"
			orient="auto"
		>
			<path
				d="M2 1.5 8 5 2 8.5"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</marker>
	</defs>
	<!-- .dashed is styled by DiagramFrame's shared palette -->
	<path d={path} class:dashed marker-end="url(#{headId})" />
</g>

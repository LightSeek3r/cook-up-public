<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	// One bird from above, breast side up: tail end at the left, neck end at the right.

	/**
	 * Drumstick from the thigh (x1, y1) to the ankle (x2, y2): a 16-wide meaty end narrowing to
	 * the bare shank. `at(t, w)` is the point a fraction t along the bone, w to its side.
	 */
	const drumstick = (x1: number, y1: number, x2: number, y2: number) => {
		const len = Math.hypot(x2 - x1, y2 - y1);
		const nx = -(y2 - y1) / len;
		const ny = (x2 - x1) / len;
		const at = (t: number, w: number) =>
			`${(x1 + (x2 - x1) * t + nx * w).toFixed(2)} ${(y1 + (y2 - y1) * t + ny * w).toFixed(2)}`;
		return (
			`M${at(0, 8)}Q${at(0.4, 10)} ${at(0.75, 2.2)}L${at(1, 1.8)}L${at(1, -1.8)}L${at(0.75, -2.2)}` +
			`Q${at(0.4, -10)} ${at(0, -8)}A8 8 0 0 0 ${at(0, 8)}z`
		);
	};
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<!-- wings folded against the shoulders, their tips tucked behind (dashed) -->
	<g class="c-primary">
		<path d="M138 48c14-10 38-10 48 4c3 4 4 9 2 13c-10-10-28-16-50-17z" class="tint" />
		<path d="M138 120c14 10 38 10 48-4c3-4 4-9 2-13c-10 10-28 16-50 17z" class="tint" />
		<path d="M150 45c12-3 24-1 32 7M150 123c12 3 24 1 32-7" class="fine" />
		<path d="M188 65c-2 4-6 6-11 6M188 103c-2-4-6-6-11-6" class="fine dashed" />
	</g>

	<!-- the body: thighs at the rear, two breast halves either side of the breastbone -->
	<g class="c-primary">
		<ellipse cx="132" cy="84" rx="54" ry="38" class="tint" />
		<path d="M128 81c6-16 36-22 54-10M128 87c6 16 36 22 54 10M128 84H182" class="fine" />
		<path d="M186 76c6 0 9 4 9 8s-3 8-9 8" class="fine" />
		<path d={drumstick(110, 60, 66, 80)} class="tint" />
		<path d={drumstick(110, 108, 66, 88)} class="tint" />
	</g>
	<!-- the bare bone ends at the ankles -->
	<circle cx="62.5" cy="79" r="3" class="fine" />
	<circle cx="62.5" cy="89" r="3" class="fine" />

	<!-- the string: round the ankles, between thighs and breast, over the wings, knotted at the neck -->
	<g class="c-accent">
		<path d="M66 76C58 68 46 72 46 84S58 100 66 92M62 77l8 14M62 91l8-14" />
		<path d="M68 81C88 81 110 78 126 70S158 54 172 58C178 62 182 68 186 74" />
		<path d="M68 87C88 87 110 90 126 98S158 114 172 110C178 106 182 100 186 94" />
		<path d="M186 74C192 78 196 80 200 84M186 94C192 90 196 88 200 84" class="dashed" />
		<path d="M200 84c-3-5-1-10 3-10s4 6-3 10zM200 84c-3 5-1 10 3 10s4-6-3-10zM200 84l9-3M200 84l9 3" />
	</g>

	<Mark x={200} y={44} n={1} />
	<Mark x={42} y={58} n={2} />
	<Mark x={146} y={140} n={3} />
	<Mark x={224} y={84} n={4} />
</DiagramFrame>

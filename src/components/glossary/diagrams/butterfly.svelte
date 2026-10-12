<script lang="ts">
	import DiagramFrame from '../diagram/DiagramFrame.svelte';
	import Mark from '../diagram/Mark.svelte';
	import Arrow from '../diagram/Arrow.svelte';

	interface Props {
		rtl?: boolean;
		label: string;
	}

	let { rtl = false, label }: Props = $props();

	/** Side view of a chicken breast 50 wide on the board at y = base: thin at the left, thick at the right. */
	const breast = (x: number, base: number) =>
		`M${x} ${base}c-2.5 0-3.5-4-1-6c8-5 20-12 33-12.5c8-.4 16 2.5 17 9c.4 5-1.7 9.5-5 9.5z`;
	/** The lower half once sliced, still lying on the board; the hinge is its thin left end. */
	const lower = (x: number, base: number) =>
		`M${x} ${base}c-2 0-2.5-3-1-4c10-1 30-3 44-5c3 0 5 2 5 5s-2 4-4 4z`;
	/** The upper half in its own frame: cut face along y = 0 from the hinge, skin side bulging up. */
	const upper = 'M0 0h46c2-5-2-10-9-11-12-1-26 4-37 11z';

	const board = (x: number, y: number, w: number) => `M${x + 2} ${y}h${w - 4}a2.5 2.5 0 0 1 0 5h-${w - 4}a2.5 2.5 0 0 1 0-5z`;
</script>

<DiagramFrame {label} {rtl} directional={true}>
	<g class="c-muted fine">
		<Arrow from={[100, 24]} to={[120, 24]} />
	</g>

	<!-- 1: the breast on the board, a hand flat on top, fingers clear of the blade's path -->
	<path d={board(18, 66, 80)} />
	<path d={breast(34, 66)} class="c-primary tint" />
	<path d="M88 27C82 31 78 33 72 34C64 36 54 42 47 48a3.5 3.5 0 0 0-2.5 7.3C52 52 60 48.5 70 47C76 46 82 44 92 38" />
	<path d="M77 40c-5 1-11 4-15 7" class="fine" />

	<!-- 2: the knife slices in from the thick side, level with the board, and stops short -->
	<path d={board(126, 66, 80)} />
	<path d={breast(142, 66)} class="c-primary tint" />
	<path d="M150 60H142" class="c-muted fine dashed" />
	<g class="c-accent">
		<path d="M150 60H204V53C186 53 166 55 150 60z" class="tint" />
		<rect x="204" y="52.5" width="24" height="7" rx="3" />
	</g>

	<!-- 3: opened like a book about the uncut hinge -->
	<path d={board(18, 138, 104)} />
	<path d={lower(70, 138)} class="c-primary tint" />
	<g transform="translate(69 134) rotate(-135)">
		<path d={upper} class="c-primary tint" />
	</g>
	<g class="c-muted fine">
		<Arrow d="M30 97A54 54 0 0 0 17 124" />
	</g>

	<!-- 4: laid flat under plastic wrap and pounded to an even thickness -->
	<path d={board(126, 138, 104)} />
	<path d="M134 138a3.5 3.5 0 0 1 0-7H224a3.5 3.5 0 0 1 0 7z" class="c-primary tint" />
	<path d="M128 138c1-6 3-9.5 8-9.5H222c5 0 7 3.5 8 9.5" class="c-accent fine" />
	<g class="c-accent">
		<rect x="156" y="104" width="22" height="11" rx="2" class="tint" />
		<path d="M158 115l2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2 2-2" class="fine" />
		<path d="M178 109l28-15" class="bold" />
	</g>
	<g class="c-muted fine">
		<Arrow from={[167, 119]} to={[167, 127]} />
	</g>

	<Mark x={22} y={24} n={1} />
	<Mark x={134} y={24} n={2} />
	<Mark x={54} y={94} n={3} />
	<Mark x={134} y={96} n={4} />
</DiagramFrame>

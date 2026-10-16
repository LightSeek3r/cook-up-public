<script lang="ts">
	import type { BalanceGrade } from '$lib/config';

	interface Props {
		grade: BalanceGrade | null;
		score?: number | null;
		showScore?: boolean;
		/** Localised name of the grade, for the accessible label. */
		gradeLabel: string;
	}

	let { grade, score = null, showScore = false, gradeLabel }: Props = $props();
</script>

{#if grade}
	<!-- aria-label, not <abbr title>: `title` is mouse-hover-only, so on a
	     keyboard or touch device the bare letter A–E had no explanation at all. -->
	<!-- The score goes in the label too when it is shown. It used to be visible but
	     aria-hidden with no equivalent in the label, so screen-reader users got the
	     letter and never the number sighted users were reading next to it. -->
	<span
		class="grade"
		data-grade={grade}
		aria-label={showScore && score !== null
			? `${gradeLabel}: ${grade}, ${score}/100`
			: `${gradeLabel}: ${grade}`}
	>
		<span aria-hidden="true">{grade}</span>
		{#if showScore && score !== null}
			<small aria-hidden="true">{score}/100</small>
		{/if}
	</span>
{/if}

<style>
	/* A stamped metal tag: the bevel is white/black alpha, so it reads the same
	   on all five fills without touching the --on-grade contrast. */
	.grade {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		border-radius: 3px;
		background: var(--grade-c);
		color: var(--on-grade);
		font-family: var(--font-body);
		font-size: 1rem;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 32%),
			inset 0 -1px 0 rgb(0 0 0 / 22%);
	}
	.grade[data-grade='A'] {
		background: var(--grade-a);
	}
	.grade[data-grade='B'] {
		background: var(--grade-b);
	}
	.grade[data-grade='C'] {
		background: var(--grade-c);
	}
	.grade[data-grade='D'] {
		background: var(--grade-d);
	}
	.grade[data-grade='E'] {
		background: var(--grade-e);
	}
	small {
		/* No opacity here. The --grade-* fills were deliberately darkened so
		   --on-grade clears 4.5:1 against every one (4.5169–4.7998:1 at full
		   precision across both themes). opacity: 0.9 composites the white
		   toward the fill and spends that entire margin: it measured
		   3.9753–4.1496:1 on all ten grade/theme pairs — below 4.5:1 in every
		   case. Clearing 4.5:1 would need opacity >= 0.983 light / 0.998 dark,
		   i.e. no usable fade exists here. De-emphasis comes from <small>'s
		   size and this 600 against the badge's 800 instead. */
		font-size: 0.78rem;
		font-weight: 600;
	}
	/* The fill is what makes it a badge, and forced colours drop it. */
	@media (forced-colors: active) {
		.grade {
			border: 1px solid CanvasText;
		}
	}
</style>

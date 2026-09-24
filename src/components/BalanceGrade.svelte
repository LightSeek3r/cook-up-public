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
	.grade {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 700;
		color: var(--on-grade);
		border-radius: var(--radius-sm);
		padding: 0.1rem 0.45rem;
		background: var(--grade-c);
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
		   size and this 500 against the badge's 700 instead. */
		font-weight: 500;
	}
</style>

<script lang="ts">
	import type { BalanceGrade } from '$lib/config';
	import { GRADE } from '$lib/config';

	interface Props {
		grade: BalanceGrade | null;
		score?: number | null;
		showScore?: boolean;
	}

	let { grade, score = null, showScore = false }: Props = $props();
</script>

{#if grade}
	<span class="grade" data-grade={grade} title={GRADE.label}>
		<abbr title={GRADE.label}>{grade}</abbr>
		{#if showScore && score !== null}
			<small>{score}/100</small>
		{/if}
	</span>
{/if}

<style>
	.grade {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-weight: 700;
		color: #fff;
		border-radius: 6px;
		padding: 0.1rem 0.45rem;
		background: var(--grade-c);
	}
	.grade abbr {
		text-decoration: none;
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
		font-weight: 500;
		opacity: 0.9;
	}
</style>

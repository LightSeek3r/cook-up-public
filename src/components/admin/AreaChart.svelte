<script lang="ts">
	import type { DayPoint } from '$lib/admin/stats';

	let { points, height = 180 }: { points: DayPoint[]; height?: number } = $props();

	// A fixed viewBox width with preserveAspectRatio="none" lets the SVG stretch
	// to whatever the grid gives it without any measurement or resize observer.
	const W = 720;
	const PAD = 6;

	const max = $derived(Math.max(1, ...points.map((p) => p.views)));
	const stepX = $derived(points.length > 1 ? W / (points.length - 1) : 0);

	const x = (i: number) => (points.length > 1 ? i * stepX : W / 2);
	const y = (v: number) => height - PAD - (v / max) * (height - PAD * 2);

	const path = (key: 'views' | 'visits') =>
		points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');

	const viewsLine = $derived(path('views'));
	const visitsLine = $derived(path('visits'));
	const fill = $derived(
		points.length ? `${viewsLine} L${x(points.length - 1)},${height} L${x(0)},${height} Z` : ''
	);

	const fmt = (d: string) => d.slice(5).replace('-', '/');
</script>

{#if points.length === 0}
	<p class="empty">No page views recorded yet.</p>
{:else}
	<svg
		viewBox="0 0 {W} {height}"
		preserveAspectRatio="none"
		role="img"
		aria-label="Daily page views and visits, {points.length} days, peak {max} views"
	>
		<defs>
			<linearGradient id="viewsFade" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="var(--primary)" stop-opacity="0.28" />
				<stop offset="100%" stop-color="var(--primary)" stop-opacity="0" />
			</linearGradient>
		</defs>
		<path d={fill} fill="url(#viewsFade)" />
		<path d={viewsLine} fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke" />
		<path
			d={visitsLine}
			fill="none"
			stroke="var(--accent)"
			stroke-width="2"
			stroke-dasharray="4 3"
			vector-effect="non-scaling-stroke"
		/>
	</svg>
	<div class="axis">
		<span>{fmt(points[0].day)}</span>
		<span class="key"><i class="views"></i>views <i class="visits"></i>visits</span>
		<span>{fmt(points[points.length - 1].day)}</span>
	</div>
{/if}

<style>
	svg {
		display: block;
		width: 100%;
		height: 180px;
		overflow: visible;
	}
	.axis {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-2);
		margin-top: var(--space-2);
		font-size: 0.75rem;
		color: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.key {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}
	.key i {
		display: inline-block;
		width: 14px;
		height: 2px;
		margin-left: var(--space-2);
	}
	.key .views {
		background: var(--primary);
	}
	.key .visits {
		background: var(--accent);
	}
	.empty {
		margin: 0;
		padding: var(--space-5) 0;
		text-align: center;
		color: var(--muted);
		font-size: 0.9rem;
	}
</style>

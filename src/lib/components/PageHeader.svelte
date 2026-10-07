<script lang="ts">
	import type { Snippet } from 'svelte';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';

	let { title, back, actions }: { title: string; back: string; actions?: Snippet } = $props();
</script>

<header class="page-header">
	<a class="icon-btn back" href={back} aria-label="뒤로">
		<CaretLeftIcon size={22} />
	</a>
	<h1>{title}</h1>
	<div class="actions">{@render actions?.()}</div>
</header>

<style>
	.page-header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 4px;
		padding: calc(var(--safe-top) + 8px) var(--gutter) 8px 8px;
		background: var(--bg);
	}
	h1 {
		margin: 0;
		font-size: 22px;
		letter-spacing: -0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>

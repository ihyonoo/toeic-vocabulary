<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';

	let {
		open,
		title,
		onclose,
		children
	}: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') onclose();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="backdrop" role="presentation" onclick={onclose} transition:fade={{ duration: 150 }}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title} transition:fly={{ y: 320, duration: 200 }}>
		<h2>{title}</h2>
		{@render children()}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 30;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 31;
		max-height: 85dvh;
		overflow-y: auto;
		padding: 24px var(--gutter) calc(var(--safe-bottom) + 20px);
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--surface);
		border-top: 1px solid var(--line);
		box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.5);
	}
	h2 {
		margin: 0 0 20px;
		font-size: 20px;
		letter-spacing: -0.01em;
	}
</style>

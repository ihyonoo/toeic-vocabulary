<script lang="ts">
	import { toast } from '$lib/client/toast.svelte';
</script>

<div class="toast-region" role="status" aria-live="polite">
	{#if toast.message}
		<p class="toast">{toast.message}</p>
	{/if}
</div>

<style>
	.toast-region {
		position: fixed;
		left: 0;
		right: 0;
		bottom: calc(var(--safe-bottom) + 96px);
		display: flex;
		justify-content: center;
		padding: 0 var(--gutter);
		pointer-events: none;
		z-index: 50;
	}
	.toast {
		margin: 0;
		padding: 12px 16px;
		border-radius: var(--radius);
		background: var(--surface-2);
		border: 1px solid var(--line);
		font-size: 15px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
	}
</style>

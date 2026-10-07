<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefs } from '$lib/client/prefs.svelte';

	let {
		masked,
		size = 'md',
		children
	}: { masked: boolean; size?: 'md' | 'lg'; children: Snippet } = $props();

	let revealed = $state(false);

	// 보기 모드가 바뀌면 드러낸 칸을 다시 가린다 (R-16)
	$effect.pre(() => {
		void prefs.viewMode;
		revealed = false;
	});
</script>

{#if masked}
	<button
		type="button"
		class="mask {size}"
		class:revealed
		data-mask
		onclick={() => (revealed = !revealed)}
	>
		{#if revealed}{@render children()}{:else}터치하세요{/if}
	</button>
{:else}
	{@render children()}
{/if}

<style>
	.mask {
		width: 100%;
		min-height: 44px;
		padding: 8px 10px;
		border: 1px dashed #55555c;
		border-radius: 10px;
		background: transparent;
		color: var(--muted);
		font-size: 14px;
		font-weight: 400;
	}
	.lg {
		min-height: 64px;
		font-size: 16px;
	}
	.mask.revealed {
		border-style: solid;
		border-color: var(--line);
		color: inherit;
		font-size: inherit;
		font-weight: inherit;
	}
</style>

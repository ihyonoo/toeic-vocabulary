<script lang="ts">
	import { VIEW_MODE_LABEL, cycleViewMode, prefs } from '$lib/client/prefs.svelte';
</script>

<button class="view-mode" type="button" onclick={cycleViewMode}>{VIEW_MODE_LABEL[prefs.viewMode]}</button>

<style>
	.view-mode {
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 15px;
		text-decoration: underline;
		text-underline-offset: 4px;
		padding: 10px 0 10px 10px;
		white-space: nowrap;
	}
</style>

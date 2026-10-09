<script lang="ts">
	import type { Section } from '$lib/domain/types';
	import { sectionLabel } from '$lib/domain/format';

	let {
		value = $bindable(),
		disabled = false,
		onchange
	}: { value: Section; disabled?: boolean; onchange?: (section: Section) => void } = $props();

	const SECTIONS: Section[] = ['class', 'mine'];
</script>

<div class="chips" role="radiogroup" aria-label="묶음">
	{#each SECTIONS as section (section)}
		<label class="chip">
			<input
				type="radio"
				name="section"
				value={section}
				{disabled}
				bind:group={value}
				onchange={() => onchange?.(section)}
			/>
			{sectionLabel(section)}
		</label>
	{/each}
</div>

<style>
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 18px;
		border-radius: 999px;
		border: 1px solid var(--line);
		font-size: 16px;
		cursor: pointer;
	}
	.chip:has(input:checked) {
		border-color: var(--yellow);
		color: var(--yellow);
		font-weight: 600;
	}
	.chip:has(input:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	.chip:has(input:focus-visible) {
		outline: 2px solid var(--yellow);
		outline-offset: 2px;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
</style>

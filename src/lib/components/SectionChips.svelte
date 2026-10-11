<script lang="ts">
	import type { Section } from '$lib/domain/types';
	import { sectionLabel } from '$lib/domain/format';
	import { CUSTOM_NAME_RULE, cleanCustomName } from '$lib/domain/normalize';

	// 다른 묶음(custom)을 고르면 이름 칸이 나온다 (docs/design/2026-10-11-custom-sections.md)
	// names: 그 Day에 이미 있는 커스텀 묶음 이름, 눌러서 이름 칸을 채운다
	let {
		value = $bindable(),
		customName = $bindable(''),
		names = [],
		disabled = false,
		onchange,
		onnamechange
	}: {
		value: Section;
		customName?: string;
		names?: string[];
		disabled?: boolean;
		onchange?: (section: Section) => void;
		onnamechange?: () => void;
	} = $props();

	const SECTIONS: Section[] = ['class', 'mine', 'custom'];
	const nameInvalid = $derived(customName.trim() !== '' && cleanCustomName(customName) === null);

	function pick(name: string) {
		customName = name;
		onnamechange?.();
	}
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
			{section === 'custom' ? '다른 묶음' : sectionLabel(section)}
		</label>
	{/each}
</div>
{#if value === 'custom'}
	<div class="custom">
		<label class="name-label" for="section-name">묶음 이름</label>
		<input
			id="section-name"
			class="name"
			autocomplete="off"
			placeholder="예: 독해"
			{disabled}
			bind:value={customName}
			onchange={() => onnamechange?.()}
		/>
		{#if nameInvalid}
			<p class="name-error" aria-live="polite">{CUSTOM_NAME_RULE}</p>
		{/if}
		{#if names.length > 0}
			<div class="picks">
				{#each names as name (name)}
					<button type="button" class="pick" {disabled} onclick={() => pick(name)}>{name}</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}

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
	.custom {
		display: grid;
		gap: 8px;
		margin-top: 14px;
	}
	.name-label {
		color: var(--muted);
		font-size: 14px;
	}
	.name {
		height: 50px;
		padding: 0 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 17px;
	}
	.name:focus {
		outline: none;
		border-color: var(--yellow);
	}
	.name-error {
		margin: 0;
		color: var(--danger);
		font-size: 14px;
	}
	.picks {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.pick {
		min-height: 36px;
		padding: 0 14px;
		border-radius: 999px;
		border: 1px dashed var(--line);
		background: transparent;
		font-size: 15px;
	}
</style>

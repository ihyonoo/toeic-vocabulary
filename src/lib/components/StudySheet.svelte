<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Order, Repeat, StudyGroup, StudyScope } from '$lib/domain/types';
	import { loadStudyPrefs, saveStudyPrefs } from '$lib/client/prefs.svelte';
	import BottomSheet from './BottomSheet.svelte';

	let {
		open,
		onclose,
		scope,
		day,
		studyableCounts
	}: {
		open: boolean;
		onclose: () => void;
		scope: StudyScope;
		day?: number;
		studyableCounts: Record<StudyGroup, number>;
	} = $props();

	const ORDERS: { value: Order; label: string }[] = [
		{ value: 'textbook', label: '교재순' },
		{ value: 'random', label: '랜덤' },
		{ value: 'alpha', label: '알파벳순' }
	];
	const REPEATS = [
		{ value: '1', label: '1회' },
		{ value: '2', label: '2회' },
		{ value: '3', label: '3회' },
		{ value: 'loop', label: '계속' }
	];

	const GROUPS: { value: StudyGroup; label: string }[] = [
		{ value: 'all', label: '둘 다' },
		{ value: 'class', label: '수업 단어' },
		{ value: 'mine', label: '내 단어' }
	];

	let order = $state<Order>('textbook');
	let repeat = $state('1');
	let group = $state<StudyGroup>('all');

	$effect.pre(() => {
		if (!open) return;
		const saved = untrack(loadStudyPrefs);
		order = saved.order;
		repeat = String(saved.repeat);
		// 기억한 묶음에 단어가 없는 화면에서는 한 번에 시작할 수 있게 둘 다로 연다
		group = untrack(() => studyableCounts[saved.group]) > 0 ? saved.group : 'all';
	});

	const count = $derived(studyableCounts[group]);
	const emptyReason = $derived(
		studyableCounts.all === 0
			? '학습할 단어가 없어요. 숨긴 단어는 학습에서 빠져요.'
			: '이 묶음에는 학습할 단어가 없어요.'
	);

	function start() {
		saveStudyPrefs({ order, repeat: (repeat === 'loop' ? 'loop' : Number(repeat)) as Repeat, group });
		const params = new URLSearchParams({ scope });
		if (day !== undefined) params.set('day', String(day));
		params.set('order', order);
		params.set('repeat', repeat);
		params.set('group', group);
		goto(`/study?${params}`);
	}
</script>

<BottomSheet {open} {onclose} title="학습 설정">
	<fieldset>
		<legend>순서</legend>
		<div class="chips">
			{#each ORDERS as option (option.value)}
				<label class="chip">
					<input type="radio" name="order" value={option.value} bind:group={order} />
					{option.label}
				</label>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>반복</legend>
		<div class="chips">
			{#each REPEATS as option (option.value)}
				<label class="chip">
					<input type="radio" name="repeat" value={option.value} bind:group={repeat} />
					{option.label}
				</label>
			{/each}
		</div>
	</fieldset>
	<fieldset>
		<legend>단어</legend>
		<div class="chips">
			{#each GROUPS as option (option.value)}
				<label class="chip">
					<input type="radio" name="group" value={option.value} bind:group />
					{option.label}
				</label>
			{/each}
		</div>
	</fieldset>
	{#if count === 0}
		<p class="notice">{emptyReason}</p>
	{/if}
	<button class="btn btn-primary start" type="button" disabled={count === 0} onclick={start}>
		학습 시작
	</button>
</BottomSheet>

<style>
	fieldset {
		margin: 0 0 20px;
		padding: 0;
		border: 0;
	}
	legend {
		margin-bottom: 10px;
		color: var(--muted);
		font-size: 14px;
	}
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
	.chip:has(input:focus-visible) {
		outline: 2px solid var(--yellow);
		outline-offset: 2px;
	}
	.chip input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.notice {
		margin: 0 0 16px;
		color: var(--muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.start {
		width: 100%;
	}
</style>

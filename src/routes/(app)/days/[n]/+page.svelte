<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import type { DayWord, Word } from '$lib/domain/types';
	import { dayLabel } from '$lib/domain/format';
	import { ApiError, api } from '$lib/client/api';
	import { showToast } from '$lib/client/toast.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StudySheet from '$lib/components/StudySheet.svelte';
	import ViewModeButton from '$lib/components/ViewModeButton.svelte';
	import WordFormSheet from '$lib/components/WordFormSheet.svelte';
	import WordList from '$lib/components/WordList.svelte';

	let { data } = $props();

	// 한 배열을 묶음별로 걸러 보여 준다
	// 숨기면 숨긴 단어 묶음으로 가고, 풀면 원래 묶음의 원래 자리로 돌아온다
	let words = $state<DayWord[]>([]);
	$effect.pre(() => {
		words = data.words.map((w) => ({ ...w }));
	});
	const isClass = (w: Word) => !w.hidden && (w as DayWord).section === 'class';
	const isMine = (w: Word) => !w.hidden && (w as DayWord).section === 'mine';
	const isHidden = (w: Word) => w.hidden;
	const classCount = $derived(words.filter(isClass).length);
	const mineCount = $derived(words.filter(isMine).length);
	const hiddenCount = $derived(words.filter(isHidden).length);
	// 커스텀 묶음은 숨기지 않은 단어가 있을 때만 보인다
	// 서버가 만든 순서로 준다 (docs/design/2026-10-11-custom-sections.md)
	const customGroups = $derived(
		[...new Set(words.filter((w) => !w.hidden && w.customName !== null).map((w) => w.customName!))].map((name) => {
			const visible = (w: Word) => !w.hidden && (w as DayWord).customName === name;
			return { name, visible, count: words.filter(visible).length };
		})
	);

	let studyOpen = $state(false);
	let addOpen = $state(false);

	const cardHref = (word: Word) => `/study?scope=day&day=${data.day}&mode=browse&start=${word.id}`;
	// 시트를 열 때마다 바뀐다
	// 응답 전에 시트를 닫거나 다시 열었는지 가린다
	let addToken = 0;

	function openAdd() {
		addToken += 1;
		addOpen = true;
	}

	async function addWord(input: { english: string; meaning: string }) {
		const token = addToken;
		const stillOpen = () => addOpen && token === addToken;
		try {
			const { word } = await api.addWord(data.day, input);
			words.push(word);
			if (stillOpen()) addOpen = false;
			return null;
		} catch (e) {
			const message = e instanceof ApiError && (e.status === 400 || e.status === 409) ? e.message : null;
			if (message && stillOpen()) return message;
			showToast(message ?? '단어를 추가하지 못했어요.');
			return null;
		}
	}
</script>

<PageHeader title={dayLabel(data.day)} back="/">
	{#snippet actions()}
		<ViewModeButton />
	{/snippet}
</PageHeader>

<main>
	<section class="group">
		<h2>숙제 단어 <span class="count">{classCount}</span></h2>
		{#if classCount === 0}
			<p class="empty">아직 없어요</p>
		{:else}
			<WordList bind:words visible={isClass} {cardHref} />
		{/if}
	</section>
	<section class="group">
		<h2>내 단어 <span class="count">{mineCount}</span></h2>
		{#if mineCount === 0}
			<p class="empty">아직 없어요</p>
		{:else}
			<WordList bind:words visible={isMine} {cardHref} />
		{/if}
		<button class="add" type="button" onclick={openAdd}>
			<PlusIcon size={22} />
			단어 추가
		</button>
	</section>
	{#each customGroups as group (group.name)}
		<section class="group">
			<h2>{group.name} <span class="count">{group.count}</span></h2>
			<WordList bind:words visible={group.visible} {cardHref} />
		</section>
	{/each}
	{#if hiddenCount > 0}
		<section class="group hidden-group">
			<h2>숨긴 단어 <span class="count">{hiddenCount}</span></h2>
			<WordList bind:words visible={isHidden} {cardHref} />
		</section>
	{/if}
</main>

<div class="bottom-bar">
	<button class="btn btn-primary" type="button" onclick={() => (studyOpen = true)}>학습하기</button>
</div>

<StudySheet
	open={studyOpen}
	onclose={() => (studyOpen = false)}
	scope="day"
	day={data.day}
	studyableCounts={{
		all: classCount + mineCount + customGroups.reduce((n, g) => n + g.count, 0),
		class: classCount,
		mine: mineCount
	}}
	customGroups={customGroups.map(({ name, count }) => ({ name, count }))}
/>

<WordFormSheet
	open={addOpen}
	title="단어 추가"
	submitLabel="추가"
	onclose={() => (addOpen = false)}
	onsubmit={addWord}
/>

<style>
	main {
		padding: 4px var(--gutter) calc(var(--safe-bottom) + 112px);
	}
	.group + .group {
		margin-top: 28px;
	}
	/* 따로 모였으니 흐리게 하지 않는다 */
	.hidden-group :global(.hidden-word) {
		opacity: 1;
	}
	h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 0 12px;
		font-size: 17px;
		font-weight: 700;
	}
	.count {
		color: var(--orange);
		font-size: 15px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.empty {
		margin: 0;
		padding: 20px 16px;
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--muted);
		font-size: 15px;
	}
	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		min-height: 52px;
		margin-top: 12px;
		border: 1px dashed var(--line);
		border-radius: var(--radius);
		background: transparent;
		color: var(--muted);
		font-size: 16px;
	}
	.bottom-bar {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 12px var(--gutter) calc(var(--safe-bottom) + 12px);
		background: linear-gradient(to bottom, rgba(15, 15, 17, 0), var(--bg) 30%);
	}
	.bottom-bar .btn {
		width: 100%;
	}
</style>

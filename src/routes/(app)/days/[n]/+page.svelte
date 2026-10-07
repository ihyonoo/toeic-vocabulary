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

	// 묶음마다 따로 들고 있어야 각 목록의 삭제가 자기 배열에서 빠진다
	let classWords = $state<DayWord[]>([]);
	let mineWords = $state<DayWord[]>([]);
	$effect.pre(() => {
		classWords = data.words.filter((w) => w.section === 'class').map((w) => ({ ...w }));
		mineWords = data.words.filter((w) => w.section === 'mine').map((w) => ({ ...w }));
	});

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
			mineWords.push(word);
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
		<h2>수업 단어 <span class="count">{classWords.length}</span></h2>
		{#if classWords.length === 0}
			<p class="empty">아직 없어요</p>
		{:else}
			<WordList bind:words={classWords} {cardHref} />
		{/if}
	</section>
	<section class="group">
		<h2>내 단어 <span class="count">{mineWords.length}</span></h2>
		{#if mineWords.length === 0}
			<p class="empty">아직 없어요</p>
		{:else}
			<WordList bind:words={mineWords} {cardHref} />
		{/if}
		<button class="add" type="button" onclick={openAdd}>
			<PlusIcon size={22} />
			단어 추가
		</button>
	</section>
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
		all: [...classWords, ...mineWords].filter((w) => !w.hidden).length,
		class: classWords.filter((w) => !w.hidden).length,
		mine: mineWords.filter((w) => !w.hidden).length
	}}
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

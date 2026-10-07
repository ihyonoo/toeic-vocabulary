<script lang="ts">
	import type { Word } from '$lib/domain/types';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StudySheet from '$lib/components/StudySheet.svelte';
	import ViewModeButton from '$lib/components/ViewModeButton.svelte';
	import WordList from '$lib/components/WordList.svelte';

	let { data } = $props();

	// 이 화면에서 북마크를 끈 행은 떠날 때까지 남긴다 (R-24)
	let words = $state<Word[]>([]);
	$effect.pre(() => {
		words = data.words.map((w) => ({ ...w }));
	});

	let studyOpen = $state(false);

	// 두 묶음에 모두 속한 단어는 두 묶음 모두에서 센다
	function countBy(list: Word[]) {
		return {
			all: list.length,
			class: list.filter((w) => w.sections.includes('class')).length,
			mine: list.filter((w) => w.sections.includes('mine')).length
		};
	}
</script>

<PageHeader title="북마크" back="/">
	{#snippet actions()}
		<ViewModeButton />
	{/snippet}
</PageHeader>

<main>
	{#if words.length === 0}
		<p class="empty">북마크한 단어가 없어요. 목록이나 학습 카드에서 북마크를 누르면 여기에 모여요.</p>
	{:else}
		<p class="count">{words.length}단어</p>
		<WordList bind:words cardHref={(word) => `/study?scope=bookmarks&mode=browse&start=${word.id}`} />
	{/if}
</main>

<div class="bottom-bar">
	<button class="btn btn-primary" type="button" onclick={() => (studyOpen = true)}>학습하기</button>
</div>

<StudySheet
	open={studyOpen}
	onclose={() => (studyOpen = false)}
	scope="bookmarks"
	studyableCounts={countBy(words.filter((w) => w.bookmarked && !w.hidden))}
/>

<style>
	main {
		padding: 4px var(--gutter) calc(var(--safe-bottom) + 112px);
	}
	.count {
		margin: 0 0 12px;
		color: var(--muted);
		font-size: 14px;
	}
	.empty {
		margin: 32px 0;
		color: var(--muted);
		line-height: 1.6;
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

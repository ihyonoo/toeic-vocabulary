<script lang="ts">
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import type { Word } from '$lib/domain/types';
	import { dayLabel } from '$lib/domain/format';
	import { ApiError, api } from '$lib/client/api';
	import { showToast } from '$lib/client/toast.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StudySheet from '$lib/components/StudySheet.svelte';
	import ViewModeButton from '$lib/components/ViewModeButton.svelte';
	import WordFormSheet from '$lib/components/WordFormSheet.svelte';
	import WordList from '$lib/components/WordList.svelte';

	let { data } = $props();

	let words = $state<Word[]>([]);
	$effect.pre(() => {
		words = data.words.map((w) => ({ ...w }));
	});

	let studyOpen = $state(false);
	let addOpen = $state(false);
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
	<p class="count">{words.length}단어</p>
	<WordList bind:words />
	<button class="add" type="button" onclick={openAdd}>
		<PlusIcon size={22} />
		단어 추가
	</button>
</main>

<div class="bottom-bar">
	<button class="btn btn-primary" type="button" onclick={() => (studyOpen = true)}>학습하기</button>
</div>

<StudySheet
	open={studyOpen}
	onclose={() => (studyOpen = false)}
	scope="day"
	day={data.day}
	studyableCount={words.filter((w) => !w.hidden).length}
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
	.count {
		margin: 0 0 12px;
		color: var(--muted);
		font-size: 14px;
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

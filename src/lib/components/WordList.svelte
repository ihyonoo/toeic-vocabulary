<script lang="ts" module>
	// 열린 밀기 메뉴를 닫은 탭이 다른 목록(수업·내 단어)의 카드 보기로 이어지지 않게 두 목록이 함께 본다
	let menuClosedAt = -Infinity;
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { TAP_MAX_MS } from './gesture';
	import type { Word } from '$lib/domain/types';
	import { ApiError, api } from '$lib/client/api';
	import { toggleFlag } from '$lib/client/flags';
	import { showToast } from '$lib/client/toast.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import WordFormSheet from './WordFormSheet.svelte';
	import WordRow from './WordRow.svelte';

	let {
		words = $bindable(),
		cardHref
	}: { words: Word[]; cardHref?: (word: Word) => string } = $props();

	let openId = $state<number | null>(null);
	let editing = $state<Word | null>(null);
	let deleting = $state<Word | null>(null);

	function toggle(word: Word, key: 'bookmarked' | 'hidden') {
		toggleFlag(word, key, () =>
			showToast(key === 'hidden' ? '숨기기를 저장하지 못했어요.' : '북마크를 저장하지 못했어요.')
		);
	}

	// 시트를 열 때마다 바뀐다
	// 응답 전에 시트를 닫거나 다시 열었는지 가린다
	let editToken = 0;

	function openEdit(word: Word) {
		openId = null;
		editToken += 1;
		editing = word;
	}

	async function saveEdit(input: { english: string; meaning: string }) {
		const target = editing;
		const token = editToken;
		if (!target) return null;
		const stillOpen = () => editing === target && token === editToken;
		try {
			const { word } = await api.patchWord(target.id, input);
			// 그사이 바꾼 북마크·숨김을 덮어쓰지 않도록 글자 칸만 반영한다
			target.english = word.english;
			target.meaning = word.meaning;
			target.pos = word.pos;
			target.example = word.example;
			target.exampleKo = word.exampleKo;
			if (stillOpen()) editing = null;
			return null;
		} catch (e) {
			const message = e instanceof ApiError && (e.status === 400 || e.status === 409) ? e.message : null;
			if (message && stillOpen()) return message;
			showToast(message ?? '수정하지 못했어요.');
			return null;
		}
	}

	async function confirmDelete() {
		const word = deleting;
		if (!word) return;
		deleting = null;
		const index = words.indexOf(word);
		words.splice(index, 1);
		try {
			await api.deleteWord(word.id);
		} catch {
			words.splice(index, 0, word);
			showToast('삭제하지 못했어요.');
		}
	}

	// 다른 곳을 누르거나 스크롤하면 열린 행을 닫는다
	function onpointerdown(e: PointerEvent) {
		if (openId !== null && !(e.target as HTMLElement).closest('[data-row-open]')) {
			openId = null;
			menuClosedAt = performance.now();
		}
	}

	// 메뉴를 닫은 바로 그 탭이면 카드 보기로 가지 않는다
	function openCard(word: Word) {
		if (!cardHref || performance.now() - menuClosedAt < TAP_MAX_MS) return;
		goto(cardHref(word), { state: { fromList: true } });
	}
</script>

<svelte:window onscroll={() => (openId = null)} />
<svelte:document {onpointerdown} />

<ul class="word-list">
	{#each words as word (word.id)}
		<WordRow
			{word}
			open={openId === word.id}
			onopen={() => (openId = word.id)}
			onclose={() => (openId = null)}
			onbookmark={() => toggle(word, 'bookmarked')}
			onhide={() => {
				openId = null;
				toggle(word, 'hidden');
			}}
			onedit={() => openEdit(word)}
			onopencard={cardHref ? () => openCard(word) : undefined}
			ondelete={() => {
				openId = null;
				deleting = word;
			}}
		/>
	{/each}
</ul>

<WordFormSheet
	open={editing !== null}
	title="단어 수정"
	submitLabel="저장"
	initial={editing ?? undefined}
	onclose={() => (editing = null)}
	onsubmit={saveEdit}
/>

<BottomSheet open={deleting !== null} title="단어 삭제" onclose={() => (deleting = null)}>
	<p class="confirm">‘{deleting?.english}’ 단어가 모든 Day에서 지워져요.</p>
	<div class="confirm-actions">
		<button class="btn btn-secondary" type="button" onclick={() => (deleting = null)}>취소</button>
		<button class="btn btn-danger" type="button" onclick={confirmDelete}>삭제</button>
	</div>
</BottomSheet>

<style>
	.word-list {
		list-style: none;
		margin: 0;
		padding: 0;
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.confirm {
		margin: 0 0 20px;
		line-height: 1.5;
	}
	.confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.btn-danger {
		background: var(--danger);
		color: #fff;
	}
</style>

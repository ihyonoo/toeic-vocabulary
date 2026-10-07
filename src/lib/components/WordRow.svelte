<script lang="ts">
	import BookmarkSimpleIcon from 'phosphor-svelte/lib/BookmarkSimpleIcon';
	import type { Word } from '$lib/domain/types';
	import { isEnglishMasked, isMeaningMasked, prefs } from '$lib/client/prefs.svelte';
	import MaskCell from './MaskCell.svelte';
	import { ROW_OPEN_RATIO, TAP_SLOP } from './gesture';

	let {
		word,
		open,
		onopen,
		onclose,
		onbookmark,
		onhide,
		onedit,
		ondelete,
		onopencard
	}: {
		word: Word;
		open: boolean;
		onopen: () => void;
		onclose: () => void;
		onbookmark: () => void;
		onhide: () => void;
		onedit: () => void;
		ondelete: () => void;
		onopencard?: () => void;
	} = $props();

	const MENU_WIDTH = 216;

	let row: HTMLElement;
	let drag = $state<number | null>(null);
	let start: { x: number; y: number; id: number } | null = null;
	let suppressClick = false;

	const offset = $derived(drag ?? (open ? -MENU_WIDTH : 0));

	function onpointerdown(e: PointerEvent) {
		suppressClick = false;
		if (e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY, id: e.pointerId };
	}

	function onpointermove(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (drag === null) {
			if (Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) {
				row.setPointerCapture(e.pointerId);
			} else {
				if (Math.abs(dy) > TAP_SLOP) start = null;
				return;
			}
		}
		const base = open ? -MENU_WIDTH : 0;
		drag = Math.min(0, Math.max(-MENU_WIDTH, base + dx));
	}

	function onpointerup(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		start = null;
		if (drag === null) return;
		drag = null;
		suppressClick = true;
		if (!open && -dx > row.clientWidth * ROW_OPEN_RATIO) onopen();
		else if (open && dx > 0) onclose();
	}

	function onpointercancel() {
		start = null;
		drag = null;
	}

	// 가림 칸·버튼 바깥을 누르면 카드 보기로 간다
	// 메뉴가 열려 있으면 먼저 닫는다
	function onclick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button, [data-mask]')) return;
		if (open) onclose();
		else onopencard?.();
	}

	// 밀기 직후 따라오는 click이 칸 토글이나 북마크로 번지지 않게 막는다
	function onclickcapture(e: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		e.stopPropagation();
		e.preventDefault();
	}
</script>

<li class="item" class:hidden-word={word.hidden} data-row-open={open || undefined}>
	{#if open || drag !== null}
		<div class="menu">
			<button type="button" class="action" onclick={onhide}>{word.hidden ? '숨김 해제' : '숨기기'}</button>
			<button type="button" class="action" onclick={onedit}>수정</button>
			<button type="button" class="action danger" onclick={ondelete}>삭제</button>
		</div>
	{/if}
	<!-- 행 밀기는 터치 전용 보조 조작이고, 실제 동작은 안쪽 버튼이 맡는다 -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="row"
		class:settling={drag === null}
		bind:this={row}
		style:transform="translateX({offset}px)"
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		{onpointercancel}
		{onclickcapture}
		{onclick}
	>
		<div class="english">
			<MaskCell masked={isEnglishMasked(prefs.viewMode)}>{word.english}</MaskCell>
		</div>
		<div class="meaning">
			<MaskCell masked={isMeaningMasked(prefs.viewMode)}>{word.meaning}</MaskCell>
		</div>
		<button
			type="button"
			class="icon-btn mark"
			class:on={word.bookmarked}
			aria-label="북마크"
			aria-pressed={word.bookmarked}
			onclick={onbookmark}
		>
			<BookmarkSimpleIcon size={22} weight={word.bookmarked ? 'fill' : 'regular'} />
		</button>
	</div>
</li>

<style>
	.item {
		position: relative;
		overflow: hidden;
	}
	.item + :global(.item) {
		border-top: 1px solid var(--line);
	}
	.hidden-word {
		opacity: 0.4;
	}
	.menu {
		position: absolute;
		inset: 0 0 0 auto;
		display: flex;
	}
	.action {
		width: 72px;
		border: 0;
		background: var(--surface-2);
		font-size: 15px;
	}
	.action.danger {
		background: var(--danger);
		color: #fff;
	}
	.row {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 12px;
		align-items: center;
		min-height: 64px;
		padding: 10px 6px 10px 16px;
		background: var(--surface);
		touch-action: pan-y;
	}
	.row.settling {
		transition: transform 200ms ease-out;
	}
	.english {
		font-size: 18px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.meaning {
		color: #c9c9cf;
		font-size: 15px;
		line-height: 1.4;
	}
	.mark {
		color: var(--muted);
	}
	.mark.on {
		color: var(--orange);
	}
</style>

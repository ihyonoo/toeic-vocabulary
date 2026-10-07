<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { keepScreenOn } from '$lib/client/wakeLock';
	import BookmarkSimpleIcon from 'phosphor-svelte/lib/BookmarkSimpleIcon';
	import CaretLeftIcon from 'phosphor-svelte/lib/CaretLeftIcon';
	import EyeSlashIcon from 'phosphor-svelte/lib/EyeSlashIcon';
	import type { Word } from '$lib/domain/types';
	import { createSession, currentId, hide, next, prev, progress } from '$lib/domain/session';
	import { api } from '$lib/client/api';
	import { toggleFlag } from '$lib/client/flags';
	import { showToast } from '$lib/client/toast.svelte';
	import StudyCard from '$lib/components/StudyCard.svelte';
	import ViewModeButton from '$lib/components/ViewModeButton.svelte';
	import {
		CARD_ANIMATION_MS,
		EDGE_RESISTANCE,
		SWIPE_DISTANCE_RATIO,
		SWIPE_VELOCITY,
		TAP_MAX_MS,
		TAP_SLOP
	} from '$lib/components/gesture';

	let { data } = $props();

	// 카드에서 북마크를 바꾸므로 반응형 사본을 둔다
	let words = $state<Record<number, Word>>({});
	$effect.pre(() => {
		words = Object.fromEntries(data.words.map((w) => [w.id, { ...w }]));
	});
	// load가 다시 실행되면(다시 학습) 새 세션을 만든다
	// 진행 중에는 대입으로 덮어쓴다
	let session = $derived(createSession(data.words, { order: data.order, repeat: data.repeat }));
	const id = $derived(currentId(session));
	const word = $derived(id === null ? undefined : words[id]);
	const status = $derived(progress(session));
	const backHref = $derived(
		data.scope === 'day' ? `/days/${data.day}` : data.scope === 'bookmarks' ? '/bookmarks' : '/'
	);

	let flipped = $state(false);
	let offset = $state(0);
	let animating = $state(false);
	let busy = false;
	let stage = $state<HTMLElement>()!;
	let slide = $state<HTMLElement>()!;

	const reducedMotion =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const duration = reducedMotion ? 0 : CARD_ANIMATION_MS;

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function atStart() {
		return session.round === 0 && session.index === 0;
	}

	async function settle(to: number) {
		animating = duration > 0;
		offset = to;
		await wait(duration);
		animating = false;
	}

	async function move(direction: 'next' | 'prev') {
		busy = true;
		try {
			const width = stage.clientWidth;
			await settle(direction === 'next' ? -width : width);
			session = direction === 'next' ? next(session) : prev(session);
			flipped = false;
			// 끝나면 카드 대신 완료 화면이 나온다
			if (session.status !== 'active') {
				offset = 0;
				return;
			}
			offset = direction === 'next' ? width : -width;
			await tick();
			// 넘기는 중에 화면을 떠났으면 카드가 없다
			if (!slide) return;
			// 들어오는 쪽 시작 위치를 먼저 반영해야 전환이 그 위치에서 시작한다
			void slide.offsetWidth;
			await settle(0);
		} finally {
			busy = false;
		}
	}

	// 탭(가림 해제·뒤집기)과 가로 밀기(이전·다음)를 pointer 이벤트 하나로 판정한다
	let start: { x: number; y: number; t: number; id: number } | null = null;
	let dragging = false;
	let downAt = 0;
	let suppressClick = false;

	function onpointerdown(e: PointerEvent) {
		suppressClick = false;
		downAt = performance.now();
		if (busy || e.button !== 0) return;
		start = { x: e.clientX, y: e.clientY, t: downAt, id: e.pointerId };
		dragging = false;
	}

	function onpointermove(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		if (!dragging) {
			if (Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) {
				dragging = true;
				stage.setPointerCapture(e.pointerId);
			} else if (Math.abs(dy) > TAP_SLOP) {
				start = null;
				return;
			} else {
				return;
			}
		}
		offset = dx > 0 && atStart() ? dx * EDGE_RESISTANCE : dx;
	}

	function onpointerup(e: PointerEvent) {
		if (!start || e.pointerId !== start.id) return;
		const dx = e.clientX - start.x;
		const elapsed = performance.now() - start.t;
		const wasDragging = dragging;
		start = null;
		dragging = false;
		if (!wasDragging) return;

		suppressClick = true;
		const passed =
			Math.abs(dx) >= slide.clientWidth * SWIPE_DISTANCE_RATIO || Math.abs(dx) / elapsed >= SWIPE_VELOCITY;
		if (passed && dx < 0) move('next');
		else if (passed && dx > 0 && !atStart()) move('prev');
		else settle(0);
	}

	function onpointercancel() {
		start = null;
		dragging = false;
		settle(0);
	}

	function toggleBookmark() {
		if (word) toggleFlag(word, 'bookmarked', () => showToast('북마크를 저장하지 못했어요.'));
	}

	// 숨기면 다음 카드가 같은 자리에 바로 그려져 두 번째 탭이 보지 못한 카드를 숨긴다
	let lastHideAt = -Infinity;

	async function hideCurrent() {
		const now = performance.now();
		if (busy || id === null || now - lastHideAt < TAP_MAX_MS) return;
		lastHideAt = now;
		const hiddenId = id;
		session = hide(session, hiddenId);
		flipped = false;
		try {
			await api.patchWord(hiddenId, { hidden: true });
		} catch {
			showToast('숨기기를 저장하지 못했어요. 다음 학습에는 다시 나와요.');
		}
	}

	// Day 학습에서 첫 바퀴가 끝나면 세션당 한 번 기록한다 (R-13)
	let recordedFor: unknown = null;
	$effect(() => {
		if (data.scope !== 'day' || data.day === null || !session.firstRoundFinished || recordedFor === data) return;
		recordedFor = data;
		record(data.day);
	});

	async function record(day: number) {
		for (let attempt = 0; attempt < 2; attempt++) {
			try {
				await api.recordStudy(day);
				return;
			} catch {
				// 한 번 더 시도한다
			}
		}
		showToast('학습 기록을 저장하지 못했어요.');
	}

	onMount(() => keepScreenOn());

	// 숨김·북마크 변경을 반영하도록 load를 다시 실행해 새 세션을 만든다 (R-38)
	async function restart() {
		flipped = false;
		await invalidateAll();
	}

	function onclick(e: MouseEvent) {
		if (suppressClick || performance.now() - downAt > TAP_MAX_MS) {
			suppressClick = false;
			return;
		}
		const target = e.target as HTMLElement;
		if (target.closest('[data-mask], [data-card-action]')) return;
		flipped = !flipped;
	}
</script>

<div class="study">
	<header class="bar">
		<a class="icon-btn" href={backHref} aria-label="뒤로"><CaretLeftIcon size={22} /></a>
		<div class="status">
			{#if session.status === 'active'}
				<span data-testid="progress">{status.position} / {status.total}</span>
				{#if data.repeat !== 1}
					<span class="round" data-testid="round">
						{status.totalRounds ? `${status.round} / ${status.totalRounds}회` : `${status.round}회차`}
					</span>
				{/if}
			{/if}
		</div>
		<ViewModeButton />
	</header>

	{#if session.status === 'active' && word}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="stage"
			bind:this={stage}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			{onpointercancel}
			{onclick}
		>
			<div
				class="slide"
				bind:this={slide}
				style:transform="translateX({offset}px)"
				style:transition={animating ? `transform ${CARD_ANIMATION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none'}
			>
				{#key `${session.round}-${session.index}-${id}`}
					<StudyCard {word} {flipped}>
						{#snippet actions()}
							<button
								type="button"
								class="icon-btn card-action"
								class:on={word.bookmarked}
								aria-label="북마크"
								aria-pressed={word.bookmarked}
								onclick={toggleBookmark}
							>
								<BookmarkSimpleIcon size={22} weight={word.bookmarked ? 'fill' : 'regular'} />
							</button>
							<button type="button" class="icon-btn card-action" aria-label="숨기기" onclick={hideCurrent}>
								<EyeSlashIcon size={22} />
							</button>
						{/snippet}
					</StudyCard>
				{/key}
			</div>
		</div>
	{:else}
		<section class="finished">
			{#if session.status === 'empty'}
				<p class="headline">학습할 단어가 없어요</p>
				<p class="sub">숨긴 단어는 학습에서 빠져요.</p>
			{:else}
				<p class="headline">학습을 마쳤어요</p>
			{/if}
			<div class="finished-actions">
				<a class="btn btn-secondary" href={backHref}>목록으로</a>
				{#if session.status === 'done'}
					<button class="btn btn-primary" type="button" onclick={restart}>다시 학습</button>
				{/if}
			</div>
		</section>
	{/if}
</div>

<style>
	.study {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding-bottom: calc(var(--safe-bottom) + 20px);
		overflow: hidden;
	}
	.bar {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 8px;
		padding: calc(var(--safe-top) + 8px) var(--gutter) 8px 8px;
	}
	.status {
		display: flex;
		gap: 12px;
		align-items: baseline;
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}
	.round {
		color: var(--orange);
		font-size: 15px;
	}
	.stage {
		flex: 1;
		padding: 12px var(--gutter) 0;
		touch-action: pan-y;
		overflow: hidden;
	}
	.slide {
		height: 100%;
	}
	.card-action {
		color: var(--muted);
	}
	.card-action.on {
		color: var(--orange);
	}
	.finished {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 12px;
		padding: 0 var(--gutter);
	}
	.finished-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		width: 100%;
		margin-top: 12px;
	}
	.headline {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.sub {
		margin: 0 0 12px;
		color: var(--muted);
	}
</style>

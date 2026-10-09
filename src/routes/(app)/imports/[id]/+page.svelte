<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import type { Draft, DraftItem, ImportResult } from '$lib/domain/types';
	import { dayLabel, sectionLabel } from '$lib/domain/format';
	import { ApiError, api } from '$lib/client/api';
	import { showToast } from '$lib/client/toast.svelte';
	import BottomSheet from '$lib/components/BottomSheet.svelte';
	import DraftItemSheet from '$lib/components/DraftItemSheet.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SectionChips from '$lib/components/SectionChips.svelte';

	let { data } = $props();

	let draft = $state<Draft | null>(null);
	let dayText = $state('');
	let dayError = $state('');

	function adopt(next: Draft) {
		draft = next;
		dayText = String(next.day);
		dayError = '';
	}

	$effect.pre(() => {
		adopt(structuredClone(data.draft));
	});

	const day = $derived(/^\d+$/.test(dayText.trim()) ? Number(dayText.trim()) : NaN);
	const dayValid = $derived(Number.isSafeInteger(day) && day >= 1);

	// 처리가 끝나면 다시 열지 않아도 화면이 바뀐다 (R-59)
	$effect(() => {
		if (draft?.status !== 'processing') return;
		const id = draft.id;
		let stopped = false;
		async function poll() {
			try {
				const { draft: next } = await api.getImport(id);
				if (!stopped && next.status !== 'processing') adopt(next);
			} catch (e) {
				if (stopped || !(e instanceof ApiError)) return;
				// 다른 곳에서 버렸다
				if (e.status === 404) goto('/', { replaceState: true });
				// 로그인이 풀렸다
				// load를 다시 돌려 로그인 화면으로 보낸다
				if (e.status === 401) invalidateAll();
			}
		}
		const timer = setInterval(poll, 3000);
		const onVisible = () => {
			if (document.visibilityState === 'visible') poll();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			stopped = true;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	// 올린 시각부터 잰다 (R-68)
	// 다시 열어도 이어진다
	let now = $state(Date.now());
	$effect(() => {
		if (draft?.status !== 'processing') return;
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const elapsed = $derived.by(() => {
		const seconds = draft ? Math.max(0, Math.floor((now - Date.parse(draft.createdAt)) / 1000)) : 0;
		return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
	});

	// 고칠 때마다 저장한다 (R-67)
	// 응답 순서가 뒤바뀌어 옛 내용이 이기지 않게 하나씩 보낸다
	let saving: Promise<void> = Promise.resolve();

	function save() {
		if (!draft) return;
		const id = draft.id;
		const body = { day: draft.day, section: draft.section, items: $state.snapshot(draft.items) };
		saving = saving.then(() =>
			api.saveImport(id, body).then(
				() => {},
				() => showToast('고친 내용을 저장하지 못했어요.')
			)
		);
	}

	function changeDay() {
		if (!draft) return;
		if (!dayValid) {
			dayError = 'Day 번호는 1 이상의 정수여야 해요.';
			return;
		}
		dayError = '';
		if (draft.day === day) return;
		draft.day = day;
		save();
	}

	let editing = $state<number | null>(null);
	const editingItem = $derived(editing === null ? null : (draft?.items[editing] ?? null));

	function saveItem(next: DraftItem) {
		if (!draft || editing === null) return;
		draft.items[editing] = next;
		editing = null;
		save();
	}

	function removeItem() {
		if (!draft || editing === null) return;
		draft.items.splice(editing, 1);
		editing = null;
		save();
	}

	let committing = $state(false);
	let commitError = $state('');
	let result = $state<ImportResult | null>(null);

	async function commit() {
		if (!draft || committing) return;
		if (!dayValid) {
			dayError = 'Day 번호는 1 이상의 정수여야 해요.';
			return;
		}
		const blank = draft.items.findIndex((i) => !i.english.trim() || !i.meaning.trim());
		if (blank >= 0) {
			commitError = '영어와 뜻이 빈 단어가 있어요.';
			document.getElementById(`item-${blank}`)?.scrollIntoView({ block: 'center' });
			return;
		}
		committing = true;
		commitError = '';
		const id = draft.id;
		const body = { day, section: draft.section, items: $state.snapshot(draft.items) };
		// 등록 뒤 늦게 도착한 저장이 없는 초안에 404를 받지 않게 기다린다
		await saving;
		try {
			result = await api.commitImport(id, body);
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) commitError = '이미 등록했거나 버린 초안이에요.';
			else commitError = e instanceof ApiError ? e.message : '등록하지 못했어요. 다시 눌러 주세요.';
			committing = false;
		}
	}

	let discardOpen = $state(false);
	let discarding = false;

	async function discard() {
		if (!draft || discarding) return;
		discarding = true;
		await saving;
		try {
			await api.discardImport(draft.id);
		} catch (e) {
			if (!(e instanceof ApiError && e.status === 404)) {
				showToast('초안을 버리지 못했어요.');
				discarding = false;
				return;
			}
		}
		await goto('/', { replaceState: true });
	}
</script>

{#if draft}
	<PageHeader title={draft.status === 'ready' && !result ? '미리보기' : '사진 등록'} back="/">
		{#snippet actions()}
			{#if !result}
				<button class="text-btn" type="button" disabled={committing} onclick={() => (discardOpen = true)}>
					버리기
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if result}
		<main class="state">
			<p class="headline">등록했어요</p>
			<dl class="counts">
				<div><dt>새 단어</dt><dd data-testid="result-created">{result.created.length}</dd></div>
				<div><dt>다른 Day에서 연결</dt><dd data-testid="result-linked">{result.linked.length}</dd></div>
				<div><dt>이미 있음</dt><dd data-testid="result-skipped">{result.skipped.length}</dd></div>
				<div><dt>내 단어에서 옮김</dt><dd data-testid="result-moved">{result.moved.length}</dd></div>
			</dl>
			<div class="result-actions">
				<a class="btn btn-primary" href="/days/{result.day}" data-sveltekit-replacestate>{dayLabel(result.day)}로</a>
				<a class="btn btn-secondary" href="/" data-sveltekit-replacestate>홈으로</a>
			</div>
		</main>
	{:else if draft.status === 'processing'}
		<main class="state">
			<p class="headline">AI가 단어를 읽고 있어요</p>
			<p class="elapsed">{elapsed}</p>
			<p class="sub">{dayLabel(draft.day)} · {sectionLabel(draft.section)}</p>
			<p class="sub">앱을 닫아도 계속 처리돼요.</p>
		</main>
	{:else if draft.status === 'failed'}
		<main class="state">
			<p class="headline">처리하지 못했어요</p>
			<p class="reason">{draft.error}</p>
			<p class="sub">버리고 사진을 다시 올려 주세요.</p>
		</main>
	{:else}
		<main class="preview">
			<div class="controls">
				<label class="field-label" for="draft-day">Day 번호</label>
				<input
					id="draft-day"
					class="day"
					inputmode="numeric"
					autocomplete="off"
					disabled={committing}
					bind:value={dayText}
					onchange={changeDay}
				/>
				<p class="field-error" aria-live="polite">{dayError}</p>
				<SectionChips bind:value={draft.section} disabled={committing} onchange={save} />
			</div>

			<p class="count" data-testid="item-count">{draft.items.length}단어</p>
			<ul class="items">
				{#each draft.items as item, i (i)}
					<li id="item-{i}">
						<button class="row" type="button" disabled={committing} onclick={() => (editing = i)}>
							<span class="line">
								<span class="english" class:blank={!item.english}>{item.english || '비어 있음'}</span>
								<span class="pos">{item.pos}</span>
							</span>
							{#if item.paperEnglish}
								<span class="paper">종이: {item.paperEnglish}</span>
							{/if}
							<span class="line">
								<span class="meaning" class:blank={!item.meaning}>{item.meaning || '비어 있음'}</span>
								{#if item.meaningFilled}
									<span class="tag">AI가 채움</span>
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</main>

		<div class="bottom-bar">
			<p class="commit-error" aria-live="polite">{commitError}</p>
			<button
				class="btn btn-primary"
				type="button"
				disabled={committing || draft.items.length === 0}
				onclick={commit}
			>
				{draft.items.length}단어 등록
			</button>
		</div>
	{/if}
{/if}

<DraftItemSheet item={editingItem} onclose={() => (editing = null)} onsave={saveItem} onremove={removeItem} />

<BottomSheet open={discardOpen} title="초안 버리기" onclose={() => (discardOpen = false)}>
	<p class="confirm">이 초안을 버릴까요? 처리 중이면 AI 호출을 멈춰요.</p>
	<div class="confirm-actions">
		<button class="btn btn-secondary" type="button" onclick={() => (discardOpen = false)}>취소</button>
		<button class="btn btn-danger" type="button" onclick={discard}>버리기</button>
	</div>
</BottomSheet>

<style>
	.text-btn {
		min-height: 44px;
		padding: 0 8px;
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 16px;
	}
	.state {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 48px var(--gutter) calc(var(--safe-bottom) + 32px);
	}
	.headline {
		margin: 0;
		font-size: 26px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.elapsed {
		margin: 0;
		color: var(--yellow);
		font-size: 34px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.sub {
		margin: 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.reason {
		margin: 0;
		color: var(--danger);
		line-height: 1.5;
	}
	.counts {
		display: grid;
		gap: 1px;
		margin: 12px 0 0;
		border-radius: var(--radius);
		background: var(--line);
		overflow: hidden;
	}
	.counts div {
		display: flex;
		justify-content: space-between;
		padding: 16px;
		background: var(--surface);
	}
	.counts dt {
		color: var(--muted);
	}
	.counts dd {
		margin: 0;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.result-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-top: 12px;
	}
	.preview {
		padding: 4px var(--gutter) calc(var(--safe-bottom) + 140px);
	}
	.controls {
		display: grid;
		gap: 8px;
	}
	.field-label {
		color: var(--muted);
		font-size: 14px;
	}
	.day {
		height: 50px;
		padding: 0 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 17px;
	}
	.day:focus {
		outline: none;
		border-color: var(--yellow);
	}
	.field-error {
		min-height: 18px;
		margin: 0;
		color: var(--danger);
		font-size: 14px;
	}
	.count {
		margin: 24px 0 12px;
		color: var(--orange);
		font-size: 15px;
		font-weight: 600;
	}
	.items {
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.items li + li {
		border-top: 1px solid var(--line);
	}
	.row {
		display: grid;
		gap: 4px;
		width: 100%;
		padding: 14px 16px;
		border: 0;
		background: transparent;
		text-align: left;
	}
	.line {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.english {
		font-size: 18px;
		font-weight: 600;
	}
	.pos {
		color: var(--muted);
		font-size: 14px;
	}
	.paper {
		color: var(--orange);
		font-size: 14px;
	}
	.meaning {
		color: var(--text);
	}
	.blank {
		color: var(--danger);
	}
	.tag {
		padding: 1px 8px;
		border-radius: 999px;
		border: 1px solid var(--orange);
		color: var(--orange);
		font-size: 12px;
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
	.commit-error {
		min-height: 20px;
		margin: 0 0 8px;
		color: var(--danger);
		font-size: 14px;
		text-align: center;
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

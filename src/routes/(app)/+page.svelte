<script lang="ts">
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import type { DraftSummary } from '$lib/domain/types';
	import { dayLabel, monthDay, sectionLabel } from '$lib/domain/format';
	import StudySheet from '$lib/components/StudySheet.svelte';

	let { data } = $props();
	let studyOpen = $state(false);

	function draftStatus(draft: DraftSummary): string {
		if (draft.status === 'processing') return '처리 중';
		if (draft.status === 'failed') return '실패';
		return `확인 대기 · ${draft.itemCount}단어`;
	}
</script>

<header class="top">
	<h1>단어장</h1>
	<div class="actions">
		<button class="btn btn-primary" type="button" onclick={() => (studyOpen = true)}>통합 학습</button>
		<a class="btn btn-secondary" href="/bookmarks">북마크</a>
	</div>
</header>

<main>
	{#if data.drafts.length > 0}
		<section class="drafts" aria-labelledby="drafts-title">
			<h2 id="drafts-title">사진 등록</h2>
			<ul>
				{#each data.drafts as draft (draft.id)}
					<li>
						<a href="/imports/{draft.id}">
							<!-- Day 행과 이름이 겹치지 않게 앞에 붙인다 -->
							<span class="sr-only">사진 등록 초안</span>
							<span class="draft-title">{dayLabel(draft.day)} · {sectionLabel(draft.section)}</span>
							<span class="draft-status" class:ready={draft.status === 'ready'} class:failed={draft.status === 'failed'}>
								{draftStatus(draft)}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.days.length === 0}
		<p class="empty">아직 등록된 Day가 없어요. 단어 종이 사진을 올리면 Day가 생겨요.</p>
	{:else}
		<ul class="days">
			{#each data.days as day (day.number)}
				<li>
					<a href="/days/{day.number}">
						<span class="title">{dayLabel(day.number)}</span>
						<span class="meta">
							{day.wordCount}단어 ·
							{#if day.lastStudiedOn}
								{monthDay(day.lastStudiedOn)} · {day.studyCount}회
							{:else}
								학습 전
							{/if}
						</span>
						<CaretRightIcon class="chevron" size={22} />
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<a class="photo-link" href="/imports/new">
		<CameraIcon size={22} />
		사진으로 등록
	</a>
</main>

<StudySheet
	open={studyOpen}
	onclose={() => (studyOpen = false)}
	scope="all"
	studyableCounts={data.studyableCounts}
/>

<style>
	.top {
		padding: calc(var(--safe-top) + 20px) var(--gutter) 24px;
		background: var(--surface);
		border-radius: 0 0 28px 28px;
	}
	h1 {
		margin: 0 0 22px;
		font-size: 26px;
		letter-spacing: -0.02em;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	main {
		padding: 8px var(--gutter) calc(var(--safe-bottom) + 32px);
	}
	.empty {
		margin: 40px 0;
		color: var(--muted);
		line-height: 1.6;
	}
	.days {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.days li + li {
		border-top: 1px solid var(--line);
	}
	.days a {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas: 'title chevron' 'meta chevron';
		row-gap: 6px;
		align-items: center;
		padding: 20px 0;
	}
	.title {
		grid-area: title;
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.meta {
		grid-area: meta;
		color: var(--muted);
		font-size: 15px;
	}
	.days a :global(.chevron) {
		grid-area: chevron;
		color: var(--muted);
	}
	.drafts {
		margin: 12px 0 8px;
	}
	.drafts h2 {
		margin: 0 0 8px;
		color: var(--muted);
		font-size: 14px;
		font-weight: 600;
	}
	.drafts ul {
		margin: 0;
		padding: 0;
		list-style: none;
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.drafts li + li {
		border-top: 1px solid var(--line);
	}
	.drafts a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 16px;
	}
	.draft-title {
		font-weight: 600;
	}
	.draft-status {
		color: var(--muted);
		font-size: 15px;
	}
	.draft-status.ready {
		color: var(--yellow);
	}
	.draft-status.failed {
		color: var(--danger);
	}
	.photo-link {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 52px;
		margin-top: 16px;
		border-radius: var(--radius);
		border: 1px dashed var(--line);
		color: var(--yellow);
		font-weight: 600;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>

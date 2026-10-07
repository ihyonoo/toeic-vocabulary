<script lang="ts">
	import CaretRightIcon from 'phosphor-svelte/lib/CaretRightIcon';
	import { dayLabel, monthDay } from '$lib/domain/format';
	import StudySheet from '$lib/components/StudySheet.svelte';

	let { data } = $props();
	let studyOpen = $state(false);
</script>

<header class="top">
	<h1>단어장</h1>
	<div class="actions">
		<button class="btn btn-primary" type="button" onclick={() => (studyOpen = true)}>통합 학습</button>
		<a class="btn btn-secondary" href="/bookmarks">북마크</a>
	</div>
</header>

<main>
	{#if data.days.length === 0}
		<p class="empty">아직 등록된 Day가 없어요. 단어 종이 사진을 Claude에 보내면 Day가 생겨요.</p>
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
</style>

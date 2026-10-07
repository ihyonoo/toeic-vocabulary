<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Word } from '$lib/domain/types';
	import { isEnglishMasked, isMeaningMasked, prefs } from '$lib/client/prefs.svelte';
	import MaskCell from './MaskCell.svelte';

	let { word, flipped, actions }: { word: Word; flipped: boolean; actions?: Snippet } = $props();
</script>

<article class="card" data-testid="card" aria-label="단어 카드">
	<div class="actions" data-card-action>{@render actions?.()}</div>
	{#if flipped}
		<div class="back" data-testid="card-back">
			{#if word.example}
				<p class="example">{word.example}</p>
				{#if word.exampleKo}<p class="example-ko">{word.exampleKo}</p>{/if}
			{:else}
				<p class="no-example">예문 없음</p>
			{/if}
		</div>
	{:else}
		<div class="front">
			<div class="english" data-testid="card-english">
				<MaskCell masked={isEnglishMasked(prefs.viewMode)} size="lg">{word.english}</MaskCell>
			</div>
			<div class="meaning">
				<MaskCell masked={isMeaningMasked(prefs.viewMode)} size="lg">
					{#if word.pos}<span class="pos">{word.pos}</span>{/if}
					<span>{word.meaning}</span>
				</MaskCell>
			</div>
		</div>
	{/if}
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 64px 20px 24px;
		border-radius: var(--radius);
		background: var(--surface);
		border: 1px solid var(--line);
		user-select: none;
		-webkit-user-select: none;
	}
	.actions {
		position: absolute;
		top: 10px;
		right: 10px;
		display: flex;
		gap: 4px;
	}
	.front,
	.back {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
		animation: turn 200ms ease-out;
	}
	.english {
		text-align: center;
		font-size: 40px;
		font-weight: 700;
		letter-spacing: -0.02em;
		overflow-wrap: anywhere;
	}
	.meaning {
		display: flex;
		justify-content: center;
		gap: 10px;
		padding: 16px;
		border-radius: var(--radius);
		background: var(--bg);
		font-size: 20px;
		text-align: center;
	}
	.pos {
		margin-right: 8px;
		color: var(--orange);
		font-size: 16px;
		font-weight: 600;
	}
	.back {
		gap: 14px;
	}
	.example {
		margin: 0;
		font-size: 22px;
		line-height: 1.5;
	}
	.example-ko {
		margin: 0;
		color: var(--muted);
		font-size: 17px;
		line-height: 1.5;
	}
	.no-example {
		margin: 0;
		color: var(--muted);
		text-align: center;
	}
	/* 앞뒤가 바뀌었음을 알리는 짧은 회전 */
	@keyframes turn {
		from {
			transform: perspective(800px) rotateY(-70deg);
			opacity: 0.4;
		}
	}
</style>

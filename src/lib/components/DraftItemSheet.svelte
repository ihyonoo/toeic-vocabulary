<script lang="ts">
	import { untrack } from 'svelte';
	import type { DraftItem } from '$lib/domain/types';
	import BottomSheet from './BottomSheet.svelte';

	let {
		item,
		onclose,
		onsave,
		onremove
	}: {
		// null이면 닫힌다
		item: DraftItem | null;
		onclose: () => void;
		onsave: (next: DraftItem) => void;
		onremove: () => void;
	} = $props();

	let english = $state('');
	let pos = $state('');
	let meaning = $state('');
	let example = $state('');
	let exampleKo = $state('');
	let error = $state('');

	// 열리는 순간에만 채운다
	$effect.pre(() => {
		if (!item) return;
		untrack(() => {
			({ english, pos, meaning, example, exampleKo } = item!);
			error = '';
		});
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		// required는 공백만 넣어도 통과한다
		if (!english.trim() || !meaning.trim()) {
			error = '영어와 뜻은 비울 수 없어요.';
			return;
		}
		// 표시 칸(paperEnglish, meaningFilled)은 AI가 한 일이라 그대로 둔다
		onsave({ ...item!, english: english.trim(), pos: pos.trim(), meaning: meaning.trim(), example: example.trim(), exampleKo: exampleKo.trim() });
	}
</script>

<BottomSheet open={item !== null} title="단어 고치기" {onclose}>
	<form onsubmit={submit}>
		<label for="draft-english">영어</label>
		<input id="draft-english" bind:value={english} autocapitalize="off" autocomplete="off" required />
		<label for="draft-pos">품사</label>
		<input id="draft-pos" bind:value={pos} autocomplete="off" />
		<label for="draft-meaning">뜻</label>
		<input id="draft-meaning" bind:value={meaning} autocomplete="off" required />
		<label for="draft-example">예문</label>
		<input id="draft-example" bind:value={example} autocapitalize="off" autocomplete="off" />
		<label for="draft-example-ko">해석</label>
		<input id="draft-example-ko" bind:value={exampleKo} autocomplete="off" />
		<p class="error" aria-live="polite">{error}</p>
		<button class="btn btn-primary" type="submit">저장</button>
		<button class="btn btn-secondary remove" type="button" onclick={onremove}>이 단어 빼기</button>
	</form>
</BottomSheet>

<style>
	form {
		display: grid;
		gap: 8px;
	}
	label {
		color: var(--muted);
		font-size: 14px;
	}
	input {
		height: 50px;
		margin-bottom: 8px;
		padding: 0 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--bg);
		font-size: 17px;
	}
	input:focus {
		outline: none;
		border-color: var(--yellow);
	}
	.remove {
		color: var(--danger);
	}
	.error {
		min-height: 20px;
		margin: 0;
		color: var(--danger);
		font-size: 14px;
	}
</style>

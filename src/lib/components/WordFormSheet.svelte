<script lang="ts">
	import { untrack } from 'svelte';
	import BottomSheet from './BottomSheet.svelte';

	let {
		open,
		title,
		submitLabel,
		initial = { english: '', meaning: '' },
		onclose,
		onsubmit
	}: {
		open: boolean;
		title: string;
		submitLabel: string;
		initial?: { english: string; meaning: string };
		onclose: () => void;
		// 실패하면 입력창 아래에 띄울 문구를 돌려준다
		onsubmit: (input: { english: string; meaning: string }) => Promise<string | null>;
	} = $props();

	let english = $state('');
	let meaning = $state('');
	let error = $state('');
	let pending = $state(false);
	// 열 때마다 바뀐다
	// 지난번 제출 결과가 새로 연 시트에 끼어들지 않게 한다
	let session = 0;

	// 열리는 순간에만 초기화한다
	// initial은 목록의 단어 객체라 저장 응답으로 바뀌어도 입력을 덮지 않게 추적하지 않는다
	$effect.pre(() => {
		if (!open) return;
		untrack(() => {
			session += 1;
			english = initial.english;
			meaning = initial.meaning;
			error = '';
			pending = false;
		});
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		const current = session;
		pending = true;
		const message = await onsubmit({ english, meaning });
		if (current !== session) return;
		error = message ?? '';
		pending = false;
	}
</script>

<BottomSheet {open} {title} {onclose}>
	<form onsubmit={submit}>
		<label for="word-english">영어</label>
		<input id="word-english" bind:value={english} autocapitalize="off" autocomplete="off" required />
		<label for="word-meaning">뜻</label>
		<input id="word-meaning" bind:value={meaning} autocomplete="off" required aria-describedby="word-error" />
		<p id="word-error" class="error" aria-live="polite">{error}</p>
		<button class="btn btn-primary" type="submit" disabled={pending}>
			{pending ? `${submitLabel} 중…` : submitLabel}
		</button>
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
	.error {
		min-height: 20px;
		margin: 0 0 8px;
		color: var(--danger);
		font-size: 14px;
	}
</style>

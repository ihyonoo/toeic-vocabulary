<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { ApiError, api } from '$lib/client/api';

	let password = $state('');
	let error = $state('');
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		pending = true;
		error = '';
		try {
			const { next } = await api.login(password, page.url.searchParams.get('next'));
			await goto(next, { invalidateAll: true, replaceState: true });
		} catch (e) {
			error = e instanceof ApiError ? e.message : '로그인하지 못했어요. 다시 시도해 주세요.';
		} finally {
			pending = false;
		}
	}
</script>

<main class="login">
	<h1>단어장</h1>
	<form onsubmit={submit}>
		<label for="password">비밀번호</label>
		<input
			id="password"
			type="password"
			autocomplete="current-password"
			bind:value={password}
			aria-describedby="password-error"
			required
		/>
		<p id="password-error" class="error" aria-live="polite">{error}</p>
		<button class="btn btn-primary" type="submit" disabled={pending}>로그인</button>
	</form>
</main>

<style>
	.login {
		padding: calc(var(--safe-top) + 72px) var(--gutter) 40px;
		max-width: 480px;
	}
	h1 {
		margin: 0 0 40px;
		font-size: 30px;
		letter-spacing: -0.02em;
	}
	form {
		display: grid;
		gap: 8px;
	}
	label {
		font-size: 15px;
		color: var(--muted);
	}
	input {
		height: 52px;
		padding: 0 14px;
		border-radius: var(--radius);
		border: 1px solid var(--line);
		background: var(--surface);
		font-size: 17px;
	}
	input:focus {
		outline: none;
		border-color: var(--yellow);
	}
	.error {
		min-height: 20px;
		margin: 0 0 12px;
		color: var(--danger);
		font-size: 14px;
	}
</style>

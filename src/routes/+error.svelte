<script lang="ts">
	import { page } from '$app/state';
</script>

<main class="error">
	<p class="message">{page.error?.message ?? '문제가 생겼어요.'}</p>
	<a class="btn btn-secondary" href="/">홈으로</a>
</main>

<style>
	.error {
		display: grid;
		gap: 20px;
		justify-items: start;
		padding: calc(var(--safe-top) + 64px) var(--gutter);
	}
	.message {
		margin: 0;
		font-size: 18px;
	}
</style>

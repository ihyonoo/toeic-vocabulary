<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import CameraIcon from 'phosphor-svelte/lib/CameraIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import type { Section } from '$lib/domain/types';
	import { MAX_PHOTOS } from '$lib/domain/photos';
	import { ApiError, api } from '$lib/client/api';
	import { shrinkPhoto } from '$lib/client/photos';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SectionChips from '$lib/components/SectionChips.svelte';

	let { data } = $props();

	type Picked = { file: File; url: string };
	let photos = $state<Picked[]>([]);
	let section = $state<Section>('class');
	let dayText = $state('');
	let notice = $state('');
	let pending = $state(false);

	$effect.pre(() => {
		dayText = String(data.nextDay);
	});

	const day = $derived(/^\d+$/.test(dayText.trim()) ? Number(dayText.trim()) : NaN);
	const dayValid = $derived(Number.isSafeInteger(day) && day >= 1);
	const canUpload = $derived(data.enabled && photos.length > 0 && dayValid && !pending);

	// 수업 단어는 다음 번호를 제안하고, 내 단어는 매번 직접 넣는다 (R-47)
	function changeSection(next: Section) {
		dayText = next === 'class' ? String(data.nextDay) : '';
	}

	function addPhotos(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		// 같은 사진을 다시 고를 수 있게 비운다
		input.value = '';
		const room = MAX_PHOTOS - photos.length;
		photos.push(...files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) })));
		notice = files.length > room ? `사진은 ${MAX_PHOTOS}장까지 올릴 수 있어요.` : '';
	}

	function removePhoto(index: number) {
		URL.revokeObjectURL(photos[index].url);
		photos.splice(index, 1);
		notice = '';
	}

	let left = false;
	onDestroy(() => {
		left = true;
		photos.forEach((p) => URL.revokeObjectURL(p.url));
	});

	async function upload() {
		if (!canUpload) return;
		pending = true;
		notice = '';
		// 누른 시점의 사진·번호·묶음을 보낸다
		const files = photos.map((p) => p.file);
		const target = { day, section };
		try {
			const encoded: string[] = [];
			for (const file of files) encoded.push(await shrinkPhoto(file));
			// 줄이는 동안 화면을 떠났으면 올리기를 그만둔다
			if (left) return;
			const { draft } = await api.createImport({ ...target, photos: encoded });
			// 보낸 뒤 떠났으면 끌고 오지 않는다
			// 지금 화면을 다시 읽어 홈이면 초안 줄이 보이게 한다
			if (left) await invalidateAll();
			else await goto(`/imports/${draft.id}`, { replaceState: true });
		} catch (e) {
			// 사진·묶음·번호는 그대로 두고 다시 올리게 한다 (R-52)
			notice = e instanceof ApiError ? e.message : '사진을 올리지 못했어요. 다시 올려 주세요.';
			pending = false;
		}
	}
</script>

<PageHeader title="사진으로 등록" back="/" />

<main>
	{#if !data.enabled}
		<p class="warning">OpenAI API 키가 설정되지 않았어요. 서버의 <code>.env</code>에 <code>OPENAI_API_KEY</code>를 넣어 주세요.</p>
	{/if}

	<section>
		<h2>사진 <span class="hint">쌓인 순서가 종이 순서예요</span></h2>
		{#if photos.length > 0}
			<ol class="thumbs">
				{#each photos as photo, i (photo.url)}
					<li>
						<img src={photo.url} alt="" />
						<span class="num">{i + 1}</span>
						<button
							class="remove"
							type="button"
							aria-label="사진 {i + 1} 빼기"
							disabled={pending}
							onclick={() => removePhoto(i)}
						>
							<XIcon size={16} weight="bold" />
						</button>
					</li>
				{/each}
			</ol>
		{/if}
		<label class="add" class:disabled={pending}>
			<CameraIcon size={22} />
			사진 더하기
			<input
				type="file"
				accept="image/*"
				multiple
				aria-label="사진 더하기"
				disabled={pending}
				onchange={addPhotos}
			/>
		</label>
	</section>

	<section>
		<h2>묶음</h2>
		<SectionChips bind:value={section} disabled={pending} onchange={changeSection} />
	</section>

	<section>
		<h2><label for="import-day">Day 번호</label></h2>
		<input
			id="import-day"
			class="day"
			inputmode="numeric"
			autocomplete="off"
			placeholder={section === 'mine' ? '번호를 넣어 주세요' : ''}
			disabled={pending}
			bind:value={dayText}
		/>
	</section>

	<p class="notice" aria-live="polite">{notice}</p>
</main>

<div class="bottom-bar">
	<button class="btn btn-primary" type="button" disabled={!canUpload} onclick={upload}>
		{pending ? '올리는 중…' : '올리기'}
	</button>
</div>

<style>
	main {
		padding: 4px var(--gutter) calc(var(--safe-bottom) + 112px);
	}
	section + section {
		margin-top: 28px;
	}
	h2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 0 0 12px;
		font-size: 17px;
		font-weight: 700;
	}
	.hint {
		color: var(--muted);
		font-size: 14px;
		font-weight: 400;
	}
	.warning {
		margin: 0 0 20px;
		padding: 14px 16px;
		border-radius: var(--radius);
		border: 1px solid var(--danger);
		color: var(--danger);
		line-height: 1.5;
	}
	.thumbs {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
		margin: 0 0 12px;
		padding: 0;
		list-style: none;
	}
	.thumbs li {
		position: relative;
		aspect-ratio: 3 / 4;
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface);
	}
	.thumbs img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.num {
		position: absolute;
		left: 6px;
		top: 6px;
		min-width: 24px;
		height: 24px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--yellow);
		color: #1a1608;
		font-size: 14px;
		font-weight: 700;
		line-height: 24px;
		text-align: center;
	}
	.remove {
		position: absolute;
		right: 4px;
		top: 4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.6);
	}
	.add {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 52px;
		border-radius: var(--radius);
		border: 1px dashed var(--line);
		color: var(--yellow);
		font-weight: 600;
		cursor: pointer;
	}
	.add.disabled {
		opacity: 0.4;
		cursor: default;
	}
	.add input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.day {
		width: 100%;
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
	.notice {
		min-height: 20px;
		margin: 20px 0 0;
		color: var(--danger);
		font-size: 14px;
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
</style>

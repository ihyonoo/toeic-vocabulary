import type { DatabaseSync } from 'node:sqlite';
import type { DraftSummary, Section } from '$lib/domain/types';
import { MAX_PHOTOS, PHOTO_DATA_PREFIX, PHOTO_MAX_LENGTH } from '$lib/domain/photos';
import { ExtractError, extractWords } from './extract';
import { HttpError } from './http';
import { createDraft, failDraft, finishDraft } from './repo';

// 사진 등록 처리 (docs/trd/2026-10-09-photo-import.md)
// 한 프로세스, 한 사용자라 진행 중인 처리를 메모리에 둔다
const running = new Map<number, AbortController>();

function invalid(message: string): HttpError {
	return new HttpError(400, 'invalid_request', message);
}

function cleanUpload(input: unknown): { day: number; section: Section; photos: string[] } {
	const { day, section, photos } = (input ?? {}) as { day?: unknown; section?: unknown; photos?: unknown };
	if (typeof day !== 'number' || !Number.isSafeInteger(day) || day < 1) {
		throw invalid('Day 번호는 1 이상의 정수여야 해요.');
	}
	if (section !== 'class' && section !== 'mine') throw invalid("section은 'class'나 'mine'이어야 해요.");
	if (!Array.isArray(photos) || photos.length < 1 || photos.length > MAX_PHOTOS) {
		throw invalid(`사진은 1~${MAX_PHOTOS}장이어야 해요.`);
	}
	if (!photos.every((p) => typeof p === 'string' && p.startsWith(PHOTO_DATA_PREFIX))) {
		throw invalid('사진 형식이 잘못됐어요.');
	}
	if (photos.some((p) => p.length > PHOTO_MAX_LENGTH)) throw invalid('사진이 너무 커요.');
	return { day, section, photos };
}

// 초안을 만들고 처리를 시작한다
// done은 처리가 끝나면 풀린다 (API는 기다리지 않는다)
export function startImport(
	db: DatabaseSync,
	input: unknown,
	opts: { apiKey: string; baseURL?: string }
): { draft: DraftSummary; done: Promise<void> } {
	if (!opts.apiKey) {
		throw new HttpError(503, 'openai_not_configured', 'OpenAI API 키가 설정되지 않았어요.');
	}
	const { day, section, photos } = cleanUpload(input);
	const draft = createDraft(db, { day, section, photoCount: photos.length });
	return { draft, done: runImport(db, draft.id, photos, opts) };
}

// 사진마다 따로 동시에 부른다
// 한 번에 보내면 출력이 길어 시간 제한에 걸린다
// 한 장이라도 실패하면 나머지 요청을 끊고 초안 전체를 실패로 둔다
async function runImport(db: DatabaseSync, id: number, photos: string[], opts: { apiKey: string; baseURL?: string }) {
	const controller = new AbortController();
	running.set(id, controller);
	const siblings = new AbortController();
	const signal = AbortSignal.any([controller.signal, siblings.signal]);
	const started = performance.now();
	try {
		const results = await Promise.all(
			photos.map((photo) =>
				extractWords(photo, { ...opts, signal }).catch((e: unknown) => {
					siblings.abort();
					throw e;
				})
			)
		);
		const items = results.flatMap((r) => r.items);
		finishDraft(db, id, items);
		// S-9, S-11 측정용
		// 실패한 시도의 토큰은 빠지므로 비용은 OpenAI 사용량 화면과 맞춰 본다
		const input = results.reduce((sum, r) => sum + r.usage.input, 0);
		const output = results.reduce((sum, r) => sum + r.usage.output, 0);
		console.log(
			`[import] draft=${id} photos=${photos.length} words=${items.length} input=${input} output=${output} ms=${Math.round(performance.now() - started)}`
		);
	} catch (e) {
		// 버린 초안과 서버 종료는 기록하지 않는다
		// 종료는 다음 시작 때 실패로 바뀐다
		if (controller.signal.aborted) return;
		if (!(e instanceof ExtractError)) console.error(e);
		// 아무도 이 Promise를 기다리지 않는다
		// 여기서 던지면 처리되지 않은 거부로 서버가 꺼진다
		try {
			failDraft(db, id, e instanceof ExtractError ? e.message : 'AI 처리 중 서버 오류가 났어요.');
		} catch (dbError) {
			console.error(dbError);
		}
	} finally {
		running.delete(id);
	}
}

export function cancelImport(id: number) {
	running.get(id)?.abort();
}

// adapter-node는 종료 신호에 HTTP 서버만 닫는다
// 진행 중인 요청이 최대 8분간 종료를 붙잡지 않게 끊는다
process.on('sveltekit:shutdown', () => {
	for (const controller of running.values()) controller.abort();
});

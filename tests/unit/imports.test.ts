import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { startFakeOpenAI } from '../support/fake-openai.mjs';
import { openDb } from '$lib/server/db';
import { HttpError } from '$lib/server/http';
import { cancelImport, startImport } from '$lib/server/imports';
import { deleteDraft, getDraft, listDrafts } from '$lib/server/repo';
import { MAX_PHOTOS, PHOTO_DATA_PREFIX, PHOTO_MAX_LENGTH } from '$lib/domain/photos';

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>;
let db: DatabaseSync;

beforeAll(async () => {
	fake = await startFakeOpenAI();
});

afterAll(() => fake.close());

beforeEach(() => {
	db = openDb(':memory:');
});

const PHOTO = `${PHOTO_DATA_PREFIX}AAAA`;
const opts = () => ({ apiKey: 'test-key', baseURL: fake.url });
const word = {
	english: 'apple',
	paperEnglish: null,
	meaning: '사과',
	meaningFilled: false,
	pos: '명사',
	example: 'An apple.',
	exampleKo: '사과.'
};

function expectHttpError(fn: () => unknown, status: number, code: string) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(HttpError);
		expect((e as HttpError).status).toBe(status);
		expect((e as HttpError).code).toBe(code);
		return;
	}
	throw new Error(`HttpError(${status})가 나지 않음`);
}

describe('올리기 검증', () => {
	it('API 키가 없으면 503이고 초안을 만들지 않는다 (R-51)', () => {
		expectHttpError(
			() => startImport(db, { day: 1, section: 'class', photos: [PHOTO] }, { apiKey: '' }),
			503,
			'openai_not_configured'
		);
		expect(listDrafts(db)).toEqual([]);
	});

	it('사진 형식과 크기를 다른 이유로 알린다', () => {
		const message = (photos: string[]) => {
			try {
				startImport(db, { day: 1, section: 'class', photos }, opts());
			} catch (e) {
				return (e as HttpError).message;
			}
		};
		expect(message(['data:image/png;base64,AAAA'])).toBe('사진 형식이 잘못됐어요.');
		expect(message([PHOTO_DATA_PREFIX + 'A'.repeat(PHOTO_MAX_LENGTH)])).toBe('사진이 너무 커요.');
	});

	it.each([
		['사진 0장', { day: 1, section: 'class', photos: [] }],
		['사진 6장', { day: 1, section: 'class', photos: Array(MAX_PHOTOS + 1).fill(PHOTO) }],
		['사진이 배열이 아님', { day: 1, section: 'class', photos: PHOTO }],
		['JPEG data URL이 아님', { day: 1, section: 'class', photos: ['data:image/png;base64,AAAA'] }],
		['사진이 너무 큼', { day: 1, section: 'class', photos: [PHOTO_DATA_PREFIX + 'A'.repeat(PHOTO_MAX_LENGTH)] }],
		['Day가 0', { day: 0, section: 'class', photos: [PHOTO] }],
		['묶음이 잘못됨', { day: 1, section: 'other', photos: [PHOTO] }],
		['본문이 없음', null]
	])('%s이면 400이고 초안을 만들지 않는다', (_, input) => {
		expectHttpError(() => startImport(db, input, opts()), 400, 'invalid_request');
		expect(listDrafts(db)).toEqual([]);
	});
});

describe('백그라운드 처리 (R-53, R-56)', () => {
	it('처리 중 초안을 바로 돌려주고, 끝나면 확인 대기가 된다', async () => {
		fake.setScenario({ words: [word], delayMs: 50 });
		const { draft, done } = startImport(db, { day: 4, section: 'mine', photos: [PHOTO, PHOTO] }, opts());
		expect(draft).toMatchObject({ day: 4, section: 'mine', status: 'processing' });
		await done;
		expect(getDraft(db, draft.id)).toMatchObject({ status: 'ready', items: [word, word] });
	});

	it('사진마다 따로 부르고, 늦게 끝난 사진이 있어도 쌓인 순서대로 이어 붙인다', async () => {
		const first = `${PHOTO_DATA_PREFIX}FIRST`;
		const second = `${PHOTO_DATA_PREFIX}SECOND`;
		const a1 = { ...word, english: 'alpha' };
		const a2 = { ...word, english: 'beta' };
		const b1 = { ...word, english: 'gamma' };
		fake.setScenario({ perImage: { [first]: { words: [a1, a2], delayMs: 300 }, [second]: { words: [b1] } } });
		const { draft, done } = startImport(db, { day: 4, section: 'class', photos: [first, second] }, opts());
		await done;
		expect(fake.requests).toHaveLength(2);
		expect(getDraft(db, draft.id).items.map((i) => i.english)).toEqual(['alpha', 'beta', 'gamma']);
	});

	it('한 장이라도 실패하면 초안 전체가 실패하고 나머지 요청을 끊는다', async () => {
		const ok = `${PHOTO_DATA_PREFIX}OK`;
		const bad = `${PHOTO_DATA_PREFIX}BAD`;
		fake.setScenario({
			perImage: { [ok]: { words: [word], delayMs: 5000 }, [bad]: { kind: 'error', status: 401 } }
		});
		const started = performance.now();
		const { draft, done } = startImport(db, { day: 4, section: 'class', photos: [ok, bad] }, opts());
		await done;
		expect(performance.now() - started).toBeLessThan(4000);
		expect(getDraft(db, draft.id)).toMatchObject({ status: 'failed', error: 'OpenAI API 키가 잘못됐어요.' });
		const sibling = () => fake.requests.find((r) => r.body.input[0].content[0].image_url === ok);
		await vi.waitFor(() => expect(sibling()?.aborted).toBe(true));
	});

	it('추출이 실패하면 이유와 함께 실패가 된다', async () => {
		fake.setScenario({ kind: 'error', status: 401 });
		const { draft, done } = startImport(db, { day: 4, section: 'class', photos: [PHOTO] }, opts());
		await done;
		expect(getDraft(db, draft.id)).toMatchObject({ status: 'failed', error: 'OpenAI API 키가 잘못됐어요.' });
	});

	it('버리면 진행 중인 요청을 끊고 초안이 남지 않는다 (R-66)', async () => {
		fake.setScenario({ words: [word], delayMs: 5000 });
		const { draft, done } = startImport(db, { day: 4, section: 'class', photos: [PHOTO] }, opts());
		await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
		deleteDraft(db, draft.id);
		cancelImport(draft.id);
		await done;
		expect(listDrafts(db)).toEqual([]);
	});
});

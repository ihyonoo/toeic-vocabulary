import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '$lib/server/db';
import {
	RepoError,
	commitDraft,
	createDraft,
	deleteDraft,
	failDraft,
	failInterruptedDrafts,
	finishDraft,
	getDayWords,
	getDraft,
	importDay,
	listDrafts,
	nextClassDay,
	saveDraft
} from '$lib/server/repo';
import type { DraftItem } from '$lib/domain/types';

let db: DatabaseSync;

beforeEach(() => {
	db = openDb(':memory:');
});

function expectRepoError(fn: () => unknown, code: string) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(RepoError);
		expect((e as RepoError).code).toBe(code);
		return;
	}
	throw new Error(`RepoError(${code})가 나지 않음`);
}

function item(english: string, meaning: string, extra: Partial<DraftItem> = {}): DraftItem {
	return {
		english,
		meaning,
		pos: '명사',
		example: `An ${english}.`,
		exampleKo: `${meaning}.`,
		paperEnglish: null,
		meaningFilled: false,
		...extra
	};
}

function readyDraft(day = 3, items = [item('apple', '사과')], section: 'class' | 'mine' = 'class') {
	const draft = createDraft(db, { day, section, photoCount: 1 });
	finishDraft(db, draft.id, items);
	return draft.id;
}

describe('초안 상태 전이', () => {
	it('만들면 처리 중이고 단어가 없다', () => {
		const draft = createDraft(db, { day: 3, section: 'class', photoCount: 2 });
		expect(draft).toMatchObject({ day: 3, section: 'class', status: 'processing', itemCount: 0, error: null });
		expect(getDraft(db, draft.id).items).toEqual([]);
	});

	it('처리가 끝나면 확인 대기가 되고 단어가 담긴다', () => {
		const id = readyDraft(3, [item('apple', '사과', { paperEnglish: 'aple' }), item('river', '강')]);
		const draft = getDraft(db, id);
		expect(draft).toMatchObject({ status: 'ready', itemCount: 2, error: null });
		expect(draft.items[0]).toEqual(item('apple', '사과', { paperEnglish: 'aple' }));
	});

	it('실패하면 이유가 남는다', () => {
		const { id } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		failDraft(db, id, 'AI 호출에 실패했어요 (500).');
		expect(getDraft(db, id)).toMatchObject({ status: 'failed', error: 'AI 호출에 실패했어요 (500).' });
	});

	it('처리 중이 아닌 초안은 끝나거나 실패해도 바뀌지 않는다', () => {
		const { id: failed } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		failDraft(db, failed, '서버가 다시 시작돼 처리가 멈췄어요.');
		finishDraft(db, failed, [item('apple', '사과')]);
		expect(getDraft(db, failed)).toMatchObject({ status: 'failed', itemCount: 0 });

		const ready = readyDraft();
		failDraft(db, ready, '늦게 온 실패');
		expect(getDraft(db, ready)).toMatchObject({ status: 'ready', error: null });
	});

	it('버린 초안은 처리가 끝나도 되살아나지 않는다', () => {
		const { id } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		deleteDraft(db, id);
		finishDraft(db, id, [item('apple', '사과')]);
		failDraft(db, id, '실패');
		expect(listDrafts(db)).toEqual([]);
	});

	it('서버가 시작할 때 처리 중이던 초안만 실패로 바꾼다', () => {
		const { id: processing } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		const ready = readyDraft(4);
		expect(failInterruptedDrafts(db)).toBe(1);
		expect(getDraft(db, processing)).toMatchObject({
			status: 'failed',
			error: '서버가 다시 시작돼 처리가 멈췄어요. 사진을 다시 올려 주세요.'
		});
		expect(getDraft(db, ready).status).toBe('ready');
	});

	it('목록은 올린 순서다', () => {
		const a = createDraft(db, { day: 5, section: 'class', photoCount: 1 });
		const b = createDraft(db, { day: 2, section: 'mine', photoCount: 3 });
		expect(listDrafts(db).map((d) => d.id)).toEqual([a.id, b.id]);
	});

	it('확인 대기와 실패 초안도 지울 수 있다', () => {
		const ready = readyDraft();
		const { id: failed } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		failDraft(db, failed, '실패');
		deleteDraft(db, ready);
		deleteDraft(db, failed);
		expect(listDrafts(db)).toEqual([]);
	});

	it('없는 초안은 draft_not_found다', () => {
		expectRepoError(() => getDraft(db, 99), 'draft_not_found');
		expectRepoError(() => deleteDraft(db, 99), 'draft_not_found');
	});
});

describe('수업 단어 기본 Day 번호 (R-47)', () => {
	it('Day도 초안도 없으면 1이다', () => {
		expect(nextClassDay(db)).toBe(1);
	});

	it('가장 큰 Day + 1이다', () => {
		importDay(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		expect(nextClassDay(db)).toBe(4);
	});

	it('처리 중이거나 확인 대기인 수업 단어 초안의 번호도 센다', () => {
		importDay(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		createDraft(db, { day: 4, section: 'class', photoCount: 1 });
		expect(nextClassDay(db)).toBe(5);
		readyDraft(6);
		expect(nextClassDay(db)).toBe(7);
	});

	it('실패한 초안과 내 단어 초안은 세지 않는다', () => {
		importDay(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		const { id } = createDraft(db, { day: 8, section: 'class', photoCount: 1 });
		failDraft(db, id, '실패');
		createDraft(db, { day: 9, section: 'mine', photoCount: 1 });
		expect(nextClassDay(db)).toBe(4);
	});
});

describe('미리보기 저장 (R-63, R-67)', () => {
	it('Day, 묶음, 단어를 바꿔 저장한다. 편집 중에는 빈 영어·뜻을 허용한다', () => {
		const id = readyDraft();
		const items = [item('apple', '사과'), item('', '')];
		const saved = saveDraft(db, id, { day: 7, section: 'mine', items });
		expect(saved).toMatchObject({ day: 7, section: 'mine', status: 'ready', itemCount: 2 });
		expect(getDraft(db, id).items).toEqual(items);
	});

	it('확인 대기가 아니면 draft_not_ready다', () => {
		const { id } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		expectRepoError(() => saveDraft(db, id, { day: 3, section: 'class', items: [] }), 'draft_not_ready');
	});

	it('없는 초안은 draft_not_found다', () => {
		expectRepoError(() => saveDraft(db, 99, { day: 3, section: 'class', items: [] }), 'draft_not_found');
	});

	it.each([
		['Day가 0', { day: 0, section: 'class', items: [] }],
		['Day가 소수', { day: 1.5, section: 'class', items: [] }],
		['묶음이 잘못됨', { day: 3, section: 'other', items: [] }],
		['단어 목록이 배열이 아님', { day: 3, section: 'class', items: {} }],
		['칸이 문자열이 아님', { day: 3, section: 'class', items: [{ ...item('a', 'b'), pos: 1 }] }],
		['원래 철자가 문자열·null이 아님', { day: 3, section: 'class', items: [{ ...item('a', 'b'), paperEnglish: 1 }] }],
		['채움 표시가 불리언이 아님', { day: 3, section: 'class', items: [{ ...item('a', 'b'), meaningFilled: 'y' }] }],
		['본문이 없음', null]
	])('%s이면 invalid_request다', (_, input) => {
		const id = readyDraft();
		expectRepoError(() => saveDraft(db, id, input), 'invalid_request');
	});
});

describe('등록 (R-64, R-65)', () => {
	it('보낸 내용으로 등록하고 초안을 지운다. 겹친 줄은 이미 있음으로 센다', () => {
		const id = readyDraft(3, [item('stale', '저장된 값')]);
		const result = commitDraft(db, id, {
			day: 5,
			section: 'class',
			items: [item('apple', '사과'), item('river', '강'), item('apple', '사과')]
		});
		expect(result.created.map((w) => w.english)).toEqual(['apple', 'river']);
		expect(result.skipped.map((w) => w.english)).toEqual(['apple']);
		expect(getDayWords(db, 5)!.map((w) => w.english)).toEqual(['apple', 'river']);
		expect(getDayWords(db, 5)![0]).toMatchObject({ pos: '명사', example: 'An apple.', exampleKo: '사과.' });
		expect(listDrafts(db)).toEqual([]);
	});

	it('수업 단어로 등록하면 같은 Day의 내 단어를 옮긴다', () => {
		importDay(db, { day: 5, section: 'mine', words: [{ english: 'apple', meaning: '사과' }] });
		const id = readyDraft(5);
		const result = commitDraft(db, id, { day: 5, section: 'class', items: [item('apple', '사과')] });
		expect(result.moved.map((w) => w.english)).toEqual(['apple']);
	});

	it('빈 영어나 뜻이 있으면 등록하지 않고 초안을 남긴다', () => {
		const id = readyDraft();
		expectRepoError(
			() => commitDraft(db, id, { day: 5, section: 'class', items: [item('apple', '사과'), item('river', '')] }),
			'invalid_request'
		);
		expect(getDayWords(db, 5)).toBeNull();
		expect(getDraft(db, id).status).toBe('ready');
	});

	it('확인 대기가 아니면 draft_not_ready, 두 번째 등록은 draft_not_found다', () => {
		const { id: processing } = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		const input = { day: 3, section: 'class', items: [item('apple', '사과')] };
		expectRepoError(() => commitDraft(db, processing, input), 'draft_not_ready');

		const id = readyDraft();
		commitDraft(db, id, input);
		expectRepoError(() => commitDraft(db, id, input), 'draft_not_found');
		expect(getDayWords(db, 3)!.length).toBe(1);
	});
});

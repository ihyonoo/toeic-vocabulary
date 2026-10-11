import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '$lib/server/db';
import {
	RepoError,
	addWordToDay,
	commitDraft,
	countStudyableWords,
	createDraft,
	finishDraft,
	getAllWords,
	getDayWords,
	getDraft,
	listCustomSections,
	listDrafts,
	saveDraft,
	setSection
} from '$lib/server/repo';
import { register } from '../support/register';
import type { DraftItem } from '$lib/domain/types';

// 커스텀 묶음 (docs/design/2026-10-11-custom-sections.md)

let db: DatabaseSync;

beforeEach(() => {
	db = openDb(':memory:');
});

function expectRepoError(fn: () => unknown, code: string, message?: string) {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(RepoError);
		expect((e as RepoError).code).toBe(code);
		if (message) expect((e as RepoError).message).toBe(message);
		return;
	}
	throw new Error(`RepoError(${code})가 나지 않음`);
}

function item(english: string, meaning: string): DraftItem {
	return { english, meaning, pos: '', example: '', exampleKo: '', paperEnglish: null, meaningFilled: false };
}

// 사진 초안을 거쳐 커스텀 묶음으로 등록한다
function commitCustom(day: number, customName: string, items: DraftItem[]) {
	const draft = createDraft(db, { day, section: 'custom', customName, photoCount: 1 });
	finishDraft(db, draft.id, items);
	return commitDraft(db, draft.id, { day, section: 'custom', customName, items });
}

const view = (day: number) =>
	getDayWords(db, day)!.map((w) => [w.section, w.customName, w.english].filter(Boolean).join(':'));

describe('커스텀 묶음 등록', () => {
	it('커스텀 묶음 단어는 그 Day의 숙제 단어·내 단어 뒤에 이름과 함께 놓인다', () => {
		register(db, { day: 3, section: 'mine', words: [{ english: 'river', meaning: '강' }] });
		commitCustom(3, '독해', [item('cloud', '구름')]);
		register(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		expect(view(3)).toEqual(['class:apple', 'mine:river', 'custom:독해:cloud']);
	});

	it('커스텀 묶음끼리는 만든 순서, 안에서는 등록 순서다', () => {
		commitCustom(3, '나중', [item('b1', '비1')]);
		commitCustom(3, '독해', [item('a1', '에이1')]);
		commitCustom(3, '나중', [item('b2', '비2')]);
		expect(view(3)).toEqual(['custom:나중:b1', 'custom:나중:b2', 'custom:독해:a1']);
	});

	it('같은 Day의 내 단어는 커스텀 묶음 끝으로 옮기고, 숙제 단어·다른 묶음 단어는 건너뛴다', () => {
		register(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		register(db, { day: 3, section: 'mine', words: [{ english: 'river', meaning: '강' }] });
		commitCustom(3, '독해', [item('cloud', '구름')]);
		const result = commitCustom(3, '어휘', [item('apple', '사과'), item('river', '강'), item('cloud', '구름')]);
		expect(result.moved.map((w) => w.english)).toEqual(['river']);
		expect(result.skipped.map((w) => w.english)).toEqual(['apple', 'cloud']);
		expect(view(3)).toEqual(['class:apple', 'custom:독해:cloud', 'custom:어휘:river']);
	});

	it('이름은 앞뒤 공백을 지우고 연속 공백을 줄여, 같은 이름이면 같은 묶음이다', () => {
		commitCustom(3, '  독해   파트 ', [item('a1', '에이1')]);
		commitCustom(3, '독해 파트', [item('a2', '에이2')]);
		expect(view(3)).toEqual(['custom:독해 파트:a1', 'custom:독해 파트:a2']);
	});

	it('Claude Code 등록 API는 커스텀 묶음을 받지 않는다', () => {
		expectRepoError(
			() =>
				register(db, {
					day: 3,
					section: 'custom',
					customName: '독해',
					words: [{ english: 'apple', meaning: '사과' }]
				} as never),
			'invalid_request'
		);
	});
});

describe('커스텀 묶음 이름 검증', () => {
	it.each([
		['이름이 없음', { section: 'custom' }],
		['이름이 공백뿐', { section: 'custom', customName: '   ' }],
		['이름이 13자', { section: 'custom', customName: '가'.repeat(13) }],
		['숙제 단어', { section: 'custom', customName: '숙제 단어' }],
		['내 단어', { section: 'custom', customName: '내 단어' }],
		['숨긴 단어', { section: 'custom', customName: '숨긴  단어' }],
		['이름이 문자열이 아님', { section: 'custom', customName: 3 }],
		['기본 묶음에 이름을 붙임', { section: 'class', customName: '독해' }]
	])('%s이면 invalid_request다', (_, target) => {
		const draft = createDraft(db, { day: 3, section: 'class', photoCount: 1 });
		finishDraft(db, draft.id, [item('apple', '사과')]);
		expectRepoError(() => saveDraft(db, draft.id, { day: 3, items: [], ...target } as never), 'invalid_request');
		expectRepoError(
			() => commitDraft(db, draft.id, { day: 3, items: [item('apple', '사과')], ...target } as never),
			'invalid_request'
		);
	});

	it('12자 이름은 받는다', () => {
		commitCustom(3, '가'.repeat(12), [item('apple', '사과')]);
		expect(view(3)).toEqual([`custom:${'가'.repeat(12)}:apple`]);
	});
});

describe('커스텀 묶음 초안', () => {
	it('초안이 묶음 이름을 들고 있고, 기본 묶음으로 바꾸면 이름이 빠진다', () => {
		const draft = createDraft(db, { day: 3, section: 'custom', customName: '독해', photoCount: 1 });
		expect(draft).toMatchObject({ section: 'custom', customName: '독해' });
		expect(listDrafts(db)[0]).toMatchObject({ section: 'custom', customName: '독해' });
		finishDraft(db, draft.id, []);
		expect(saveDraft(db, draft.id, { day: 3, section: 'mine', items: [] })).toMatchObject({
			section: 'mine',
			customName: null
		});
		expect(getDraft(db, draft.id)).toMatchObject({ section: 'mine', customName: null });
	});

	it('Day마다 커스텀 묶음 이름을 만든 순서로 돌려준다', () => {
		commitCustom(5, '어휘', [item('b1', '비1')]);
		commitCustom(3, '독해', [item('a1', '에이1')]);
		commitCustom(3, '듣기', [item('a2', '에이2')]);
		register(db, { day: 4, words: [{ english: 'apple', meaning: '사과' }] });
		expect(listCustomSections(db)).toEqual({ 3: ['독해', '듣기'], 5: ['어휘'] });
	});
});

describe('커스텀 묶음 단어 다루기', () => {
	it('커스텀 묶음에 있는 단어를 앱에서 추가하면 그 묶음 이름으로 알린다', () => {
		commitCustom(3, '독해', [item('cloud', '구름')]);
		expectRepoError(
			() => addWordToDay(db, 3, { english: 'cloud', meaning: '구름' }),
			'already_in_day',
			'이 Day의 독해에 이미 있어요.'
		);
	});

	it('묶음 수정 API로 내 단어로 옮기면 이름이 빠지고, 커스텀으로는 옮길 수 없다', () => {
		commitCustom(3, '독해', [item('cloud', '구름')]);
		const id = getDayWords(db, 3)![0].id;
		expect(setSection(db, 3, id, 'mine')).toMatchObject({ section: 'mine', customName: null });
		expectRepoError(() => setSection(db, 3, id, 'custom' as never), 'invalid_request');
	});

	it('통합 학습에서 커스텀 묶음 단어는 전체에만 들어간다', () => {
		register(db, { day: 3, words: [{ english: 'apple', meaning: '사과' }] });
		commitCustom(3, '독해', [item('cloud', '구름')]);
		expect(getAllWords(db, { includeHidden: false }).map((w) => w.english)).toEqual(['apple', 'cloud']);
		expect(getAllWords(db, { includeHidden: false, group: 'class' }).map((w) => w.english)).toEqual(['apple']);
		expect(getAllWords(db, { includeHidden: false, group: 'mine' })).toEqual([]);
		expect(countStudyableWords(db)).toEqual({ all: 2, class: 1, mine: 0 });
	});
});

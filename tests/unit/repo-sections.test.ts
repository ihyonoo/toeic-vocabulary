import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '$lib/server/db';
import {
	RepoError,
	addWordToDay,
	countStudyableWords,
	getAllWords,
	getBookmarkedWords,
	getDayWords,
	importDay,
	setSection,
	updateWord
} from '$lib/server/repo';

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

const view = (day: number) => getDayWords(db, day)!.map((w) => `${w.section}:${w.english}`);
const idOf = (english: string) =>
	(db.prepare('SELECT id FROM words WHERE english = ?').get(english) as { id: number }).id;

describe('묶음 등록', () => {
	it('section을 생략하면 수업 단어, mine이면 내 단어로 담는다', () => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		importDay(db, { day: 1, section: 'mine', words: [{ english: 'river', meaning: '강' }] });
		expect(view(1)).toEqual(['class:apple', 'mine:river']);
	});

	it.each([['other'], [null], [3]])('section이 %s이면 요청 전체를 거부한다', (section) => {
		expectRepoError(
			() => importDay(db, { day: 1, section, words: [{ english: 'apple', meaning: '사과' }] } as never),
			'invalid_request'
		);
	});

	it('Day 화면 순서는 등록 순서와 관계없이 수업 단어 → 내 단어다', () => {
		importDay(db, { day: 1, section: 'mine', words: [{ english: 'mine1', meaning: '내것1' }] });
		importDay(db, { day: 1, words: [{ english: 'class1', meaning: '수업1' }, { english: 'class2', meaning: '수업2' }] });
		importDay(db, { day: 1, section: 'mine', words: [{ english: 'mine2', meaning: '내것2' }] });
		expect(view(1)).toEqual(['class:class1', 'class:class2', 'mine:mine1', 'mine:mine2']);
	});

	it('단어가 지금 속한 묶음들을 sections로 돌려준다', () => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		importDay(db, { day: 2, section: 'mine', words: [{ english: 'apple', meaning: '사과' }, { english: 'river', meaning: '강' }] });
		expect(getDayWords(db, 2)!.map((w) => w.sections)).toEqual([['class', 'mine'], ['mine']]);
		expect(updateWord(db, idOf('apple'), { bookmarked: true }).sections).toEqual(['class', 'mine']);
	});
});

describe('겹침 (같은 Day)', () => {
	beforeEach(() => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		importDay(db, { day: 1, section: 'mine', words: [{ english: 'river', meaning: '강' }] });
	});

	it('수업 단어에 있는 단어를 앱에서 추가하면 409와 묶음을 알린다', () => {
		expectRepoError(
			() => addWordToDay(db, 1, { english: 'Apple', meaning: '사과' }),
			'already_in_day',
			'이 Day의 수업 단어에 이미 있어요.'
		);
	});

	it('내 단어에 있는 단어를 앱에서 추가하면 409와 묶음을 알린다', () => {
		expectRepoError(
			() => addWordToDay(db, 1, { english: 'river', meaning: '강' }),
			'already_in_day',
			'이 Day의 내 단어에 이미 있어요.'
		);
	});

	it('mine 등록은 이미 있는 단어를 묶음과 관계없이 건너뛴다', () => {
		const result = importDay(db, {
			day: 1,
			section: 'mine',
			words: [{ english: 'apple', meaning: '사과' }, { english: 'river', meaning: '강' }]
		});
		expect(result.skipped.map((w) => w.english)).toEqual(['apple', 'river']);
		expect(result.moved).toEqual([]);
		expect(view(1)).toEqual(['class:apple', 'mine:river']);
	});

	it('class 등록은 수업 단어는 건너뛰고, 내 단어는 수업 단어 끝으로 옮긴다', () => {
		const result = importDay(db, {
			day: 1,
			words: [{ english: 'river', meaning: '강' }, { english: 'apple', meaning: '사과' }, { english: 'stone', meaning: '돌' }]
		});
		expect(result.moved.map((w) => w.english)).toEqual(['river']);
		expect(result.skipped.map((w) => w.english)).toEqual(['apple']);
		expect(result.created.map((w) => w.english)).toEqual(['stone']);
		expect(view(1)).toEqual(['class:apple', 'class:river', 'class:stone']);
	});
});

describe('종이 우선 옮기기', () => {
	it('내 단어를 수업 단어로 옮길 때 비어 있던 품사·예문을 종이 값으로 채운다', () => {
		importDay(db, { day: 1, words: [{ english: 'base', meaning: '기준' }] });
		addWordToDay(db, 1, { english: 'lamp', meaning: '등' });
		importDay(db, {
			day: 1,
			words: [{ english: 'lamp', meaning: '등', pos: '명사', example: 'Turn on the lamp.', exampleKo: '등을 켜라.' }]
		});
		expect(getDayWords(db, 1)!.find((w) => w.english === 'lamp')).toMatchObject({
			section: 'class',
			pos: '명사',
			example: 'Turn on the lamp.',
			exampleKo: '등을 켜라.'
		});
	});
});

describe('단어 추가와 묶음 바꾸기', () => {
	it('앱에서 추가한 단어는 내 단어 끝에 붙는다', () => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		const { word } = addWordToDay(db, 1, { english: 'river', meaning: '강' });
		expect(word).toMatchObject({ english: 'river', section: 'mine', sections: ['mine'] });
		expect(view(1)).toEqual(['class:apple', 'mine:river']);
	});

	it('setSection은 그 Day 소속의 묶음만 바꾼다', () => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		importDay(db, { day: 2, words: [{ english: 'apple', meaning: '사과' }] });
		expect(setSection(db, 1, idOf('apple'), 'mine')).toMatchObject({ section: 'mine', sections: ['class', 'mine'] });
		expect(view(1)).toEqual(['mine:apple']);
		expect(view(2)).toEqual(['class:apple']);
	});

	it('setSection은 소속이 없으면 word_not_found, 값이 잘못되면 invalid_request다', () => {
		importDay(db, { day: 1, words: [{ english: 'apple', meaning: '사과' }] });
		expectRepoError(() => setSection(db, 2, idOf('apple'), 'mine'), 'word_not_found');
		expectRepoError(() => setSection(db, 1, idOf('apple'), 'other' as never), 'invalid_request');
	});
});

describe('묶음별 학습 목록', () => {
	beforeEach(() => {
		importDay(db, { day: 1, words: [{ english: 'x', meaning: '엑스' }, { english: 'y', meaning: '와이' }] });
		importDay(db, { day: 1, section: 'mine', words: [{ english: 'z', meaning: '제트' }] });
		importDay(db, { day: 2, section: 'mine', words: [{ english: 'y', meaning: '와이' }] });
		importDay(db, { day: 2, words: [{ english: 'z', meaning: '제트' }] });
	});

	it('통합 교재순은 (Day, 묶음, 위치)이고 묶음을 고르면 그 묶음 소속만으로 정한다', () => {
		const list = (group?: 'all' | 'class' | 'mine') =>
			getAllWords(db, { includeHidden: true, group }).map((w) => w.english);
		expect(list()).toEqual(['x', 'y', 'z']);
		expect(list('class')).toEqual(['x', 'y', 'z']);
		expect(list('mine')).toEqual(['z', 'y']);
	});

	it('북마크도 묶음을 고를 수 있다', () => {
		updateWord(db, idOf('x'), { bookmarked: true });
		updateWord(db, idOf('y'), { bookmarked: true });
		expect(getBookmarkedWords(db, { includeHidden: true, group: 'mine' }).map((w) => w.english)).toEqual(['y']);
		expect(getBookmarkedWords(db, { includeHidden: true, group: 'class' }).map((w) => w.english)).toEqual(['x', 'y']);
	});

	it('학습할 단어 수를 묶음별로 센다 (숨김 제외, 단어마다 한 번)', () => {
		updateWord(db, idOf('x'), { hidden: true });
		expect(countStudyableWords(db)).toEqual({ all: 2, class: 2, mine: 2 });
	});
});

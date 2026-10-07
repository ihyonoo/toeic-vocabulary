import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '$lib/server/db';
import {
	RepoError,
	addWordToDay,
	deleteDay,
	deleteWord,
	getAllWords,
	getBookmarkedWords,
	getDayWords,
	importDay,
	listDays,
	recordStudy,
	updateWord
} from '$lib/server/repo';

let db: DatabaseSync;

beforeEach(() => {
	db = openDb(':memory:');
});

function idOf(english: string, meaning?: string) {
	const row = db
		.prepare('SELECT id FROM words WHERE english = ? AND (? IS NULL OR meaning = ?)')
		.get(english, meaning ?? null, meaning ?? null) as { id: number };
	return row.id;
}

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

describe('updateWord', () => {
	beforeEach(() => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }, { english: 'tiger', meaning: '호랑이' }] });
		importDay(db, { day: 2, words: [{ english: 'garden', meaning: '정원' }] });
	});

	it('북마크와 숨김은 그 단어가 속한 모든 Day에 같이 적용된다 (R-2)', () => {
		const word = updateWord(db, idOf('garden'), { bookmarked: true, hidden: true });
		expect(word).toMatchObject({ english: 'garden', bookmarked: true, hidden: true });
		expect(getDayWords(db, 1)![0]).toMatchObject({ bookmarked: true, hidden: true });
		expect(getDayWords(db, 2)![0]).toMatchObject({ bookmarked: true, hidden: true });
	});

	it('영어·뜻을 정규화해 고치고, 품사·예문·해석도 고친다 (R-7, R-21)', () => {
		const word = updateWord(db, idOf('tiger'), {
			english: '  Tiger ',
			meaning: '호랑이 ,범',
			pos: ' 명사 ',
			example: 'The tiger roared.',
			exampleKo: '호랑이가 크게 울었다.'
		});
		expect(word).toMatchObject({
			english: 'Tiger',
			meaning: '호랑이, 범',
			pos: '명사',
			example: 'The tiger roared.',
			exampleKo: '호랑이가 크게 울었다.'
		});
	});

	it('고친 결과가 다른 단어와 같아지면 duplicate_word다', () => {
		expectRepoError(() => updateWord(db, idOf('tiger'), { english: 'GARDEN', meaning: '정원' }), 'duplicate_word');
	});

	it('영어나 뜻을 빈 값으로 고치면 invalid_request다', () => {
		expectRepoError(() => updateWord(db, idOf('tiger'), { meaning: '  ' }), 'invalid_request');
	});

	it('고칠 칸이 없거나 형식이 틀리면 invalid_request다', () => {
		expectRepoError(() => updateWord(db, idOf('tiger'), {}), 'invalid_request');
		expectRepoError(() => updateWord(db, idOf('tiger'), { hidden: 'yes' } as never), 'invalid_request');
	});

	it.each(['toString', 'constructor', '__proto__'])('객체 기본 속성 이름(%s)은 고칠 칸이 아니다', (key) => {
		expectRepoError(() => updateWord(db, idOf('tiger'), JSON.parse(`{"${key}":"x"}`)), 'invalid_request');
	});

	it('없는 단어면 word_not_found다', () => {
		expectRepoError(() => updateWord(db, 999, { hidden: true }), 'word_not_found');
	});
});

describe('deleteWord (R-21)', () => {
	it('그 단어를 모든 Day에서 지운다', () => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }, { english: 'tiger', meaning: '호랑이' }] });
		importDay(db, { day: 2, words: [{ english: 'garden', meaning: '정원' }] });

		expect(deleteWord(db, idOf('garden'))).toBe(true);
		expect(getDayWords(db, 1)!.map((w) => w.english)).toEqual(['tiger']);
		expect(getDayWords(db, 2)).toEqual([]);
		expect(deleteWord(db, 999)).toBe(false);
	});
});

describe('deleteDay (R-8)', () => {
	it('그 Day를 지우고 어느 Day에도 없게 된 단어만 함께 지운다', () => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }, { english: 'tiger', meaning: '호랑이' }] });
		importDay(db, { day: 2, words: [{ english: 'garden', meaning: '정원' }] });

		expect(deleteDay(db, 1)).toEqual({ deletedWords: 1 });
		expect(getDayWords(db, 1)).toBeNull();
		expect(getDayWords(db, 2)!.map((w) => w.english)).toEqual(['garden']);
		expect(db.prepare('SELECT COUNT(*) AS n FROM words').get()).toEqual({ n: 1 });
	});

	it('없는 Day면 null이다', () => {
		expect(deleteDay(db, 5)).toBeNull();
	});
});

describe('addWordToDay (R-22)', () => {
	beforeEach(() => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }] });
		importDay(db, { day: 2, words: [{ english: 'cousin', meaning: '사촌', pos: '명사', example: 'My cousin visited.' }] });
	});

	it('처음 보는 단어는 만들어 Day 끝에 붙인다', () => {
		const { word, result } = addWordToDay(db, 1, { english: ' penguin ', meaning: '펭귄' });
		expect(result).toBe('created');
		expect(word).toMatchObject({ english: 'penguin', meaning: '펭귄', pos: '' });
		expect(getDayWords(db, 1)!.map((w) => w.english)).toEqual(['garden', 'penguin']);
	});

	it('다른 Day에 있는 단어는 연결해 기존 품사·예문을 유지하고 숨김을 푼다', () => {
		updateWord(db, idOf('cousin'), { hidden: true });
		const { word, result } = addWordToDay(db, 1, { english: 'Cousin', meaning: '사촌' });
		expect(result).toBe('linked');
		expect(word).toMatchObject({ english: 'cousin', pos: '명사', example: 'My cousin visited.', hidden: false });
	});

	it('이 Day에 이미 있으면 already_in_day다', () => {
		expectRepoError(() => addWordToDay(db, 1, { english: 'GARDEN', meaning: '정원' }), 'already_in_day');
	});

	it('영어나 뜻이 비면 invalid_request, 없는 Day면 day_not_found다', () => {
		expectRepoError(() => addWordToDay(db, 1, { english: 'x', meaning: ' ' }), 'invalid_request');
		expectRepoError(() => addWordToDay(db, 9, { english: 'x', meaning: '엑스' }), 'day_not_found');
	});
});

describe('getAllWords와 getBookmarkedWords (R-24, R-39)', () => {
	beforeEach(() => {
		importDay(db, { day: 2, words: [{ english: 'b1', meaning: '비1' }, { english: 'shared', meaning: '공통' }] });
		importDay(db, {
			day: 1,
			words: [{ english: 'a1', meaning: '에이1' }, { english: 'a2', meaning: '에이2' }, { english: 'shared', meaning: '공통' }]
		});
	});

	it('통합은 Day 오름차순 → Day 안 순서이고, 여러 Day의 단어는 처음 나온 위치에 한 번만 나온다', () => {
		expect(getAllWords(db, { includeHidden: true }).map((w) => w.english)).toEqual(['a1', 'a2', 'shared', 'b1']);
	});

	it('아주 큰 Day 번호에서도 (Day, 위치) 순서를 지킨다', () => {
		const big = Number.MAX_SAFE_INTEGER;
		importDay(db, { day: big, words: [{ english: 'z1', meaning: '제트1' }, { english: 'z2', meaning: '제트2' }] });
		importDay(db, { day: big - 1, words: [{ english: 'y1', meaning: '와이1' }] });
		const tail = getAllWords(db, { includeHidden: true }).map((w) => w.english).slice(-3);
		expect(tail).toEqual(['y1', 'z1', 'z2']);
	});

	it('숨김 제외를 고르면 숨긴 단어가 빠진다', () => {
		updateWord(db, idOf('a2'), { hidden: true });
		expect(getAllWords(db, { includeHidden: false }).map((w) => w.english)).toEqual(['a1', 'shared', 'b1']);
	});

	it('북마크는 같은 교재순으로 북마크한 단어만, 숨김 포함 여부를 고를 수 있다', () => {
		updateWord(db, idOf('b1'), { bookmarked: true });
		updateWord(db, idOf('shared'), { bookmarked: true, hidden: true });
		updateWord(db, idOf('a1'), { bookmarked: true });

		expect(getBookmarkedWords(db, { includeHidden: true }).map((w) => w.english)).toEqual(['a1', 'shared', 'b1']);
		expect(getBookmarkedWords(db, { includeHidden: false }).map((w) => w.english)).toEqual(['a1', 'b1']);
	});
});

describe('recordStudy (R-13)', () => {
	it('서울 날짜로 기록하고 횟수와 마지막 학습일을 돌려준다', () => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }] });

		// 서울 10-07 23:59
		expect(recordStudy(db, 1, new Date('2026-10-07T14:59:00Z'))).toEqual({ studyCount: 1, lastStudiedOn: '2026-10-07' });
		// 서울 10-08 00:30
		expect(recordStudy(db, 1, new Date('2026-10-07T15:30:00Z'))).toEqual({ studyCount: 2, lastStudiedOn: '2026-10-08' });
		expect(listDays(db)[0]).toMatchObject({ studyCount: 2, lastStudiedOn: '2026-10-08' });
	});

	it('없는 Day면 null이다', () => {
		expect(recordStudy(db, 3, new Date())).toBeNull();
	});
});

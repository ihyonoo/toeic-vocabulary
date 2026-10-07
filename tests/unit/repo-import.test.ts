import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { openDb } from '$lib/server/db';
import {
	RepoError,
	countStudyableWords,
	getDayWords,
	importDay,
	listDays
} from '$lib/server/repo';

let db: DatabaseSync;

beforeEach(() => {
	db = openDb(':memory:');
});

function englishOf(day: number) {
	return getDayWords(db, day)!.map((w) => w.english);
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

describe('importDay', () => {
	it('새 Day를 만들고 단어를 요청 순서대로 담는다', () => {
		const result = importDay(db, {
			day: 1,
			words: [
				{ english: 'telescope', meaning: '망원경', pos: '명사', example: 'A telescope arrived.', exampleKo: '망원경이 도착했다.' },
				{ english: 'rattle', meaning: '덜거덕거리다' }
			]
		});

		expect(result.created.map((w) => w.english)).toEqual(['telescope', 'rattle']);
		expect(result.linked).toEqual([]);
		expect(result.skipped).toEqual([]);
		expect(englishOf(1)).toEqual(['telescope', 'rattle']);
		expect(getDayWords(db, 1)![0]).toMatchObject({
			pos: '명사',
			example: 'A telescope arrived.',
			exampleKo: '망원경이 도착했다.',
			bookmarked: false,
			hidden: false
		});
	});

	it('요청 안에서 같은 단어가 여러 번 오면 첫 번째만 쓰고 나머지는 건너뛴다', () => {
		const result = importDay(db, {
			day: 1,
			words: [
				{ english: 'rabbit', meaning: '토끼', example: '첫 예문' },
				{ english: 'castle', meaning: '성, 성채' },
				{ english: ' Rabbit', meaning: '토끼 ', example: '둘째 예문' }
			]
		});

		expect(result.created.map((w) => w.english)).toEqual(['rabbit', 'castle']);
		expect(result.skipped.map((w) => w.english)).toEqual(['rabbit']);
		expect(englishOf(1)).toEqual(['rabbit', 'castle']);
		expect(getDayWords(db, 1)![0].example).toBe('첫 예문');
	});

	it('철자가 같아도 뜻이 다르면 다른 단어로 담는다', () => {
		importDay(db, {
			day: 1,
			words: [
				{ english: 'lead', meaning: '이끌다' },
				{ english: 'lead', meaning: '납, 연필심' }
			]
		});

		expect(getDayWords(db, 1)!.map((w) => w.meaning)).toEqual(['이끌다', '납, 연필심']);
	});

	it('다른 Day에 있는 단어는 연결하고 기존 값은 유지하며 빈 칸만 채운다', () => {
		importDay(db, { day: 1, words: [{ english: 'sunflower', meaning: '해바라기, 꽃', pos: '명사' }] });
		const id = getDayWords(db, 1)![0].id;
		db.prepare('UPDATE words SET hidden = 1, bookmarked = 1 WHERE id = ?').run(id);

		const result = importDay(db, {
			day: 2,
			words: [{ english: 'sunflower', meaning: '해바라기,꽃', pos: '동사', example: '새 예문' }]
		});

		expect(result.linked).toEqual([{ id, english: 'sunflower', meaning: '해바라기, 꽃' }]);
		expect(result.created).toEqual([]);
		const word = getDayWords(db, 2)![0];
		expect(word).toMatchObject({ id, pos: '명사', example: '새 예문', hidden: true, bookmarked: true });
	});

	it('같은 Day에 다시 등록하면 이미 있는 단어는 건너뛰고 새 단어는 끝에 붙인다', () => {
		importDay(db, { day: 3, words: [{ english: 'garden', meaning: '정원' }, { english: 'forest', meaning: '숲' }] });

		const result = importDay(db, {
			day: 3,
			words: [{ english: 'forest', meaning: '숲' }, { english: 'penguin', meaning: '펭귄' }]
		});

		expect(result.skipped.map((w) => w.english)).toEqual(['forest']);
		expect(result.created.map((w) => w.english)).toEqual(['penguin']);
		expect(englishOf(3)).toEqual(['garden', 'forest', 'penguin']);
	});

	it('삭제로 위치에 빈 번호가 생겨도 새 단어는 가장 큰 위치 뒤에 붙는다', () => {
		importDay(db, {
			day: 1,
			words: [{ english: 'a1', meaning: '하나' }, { english: 'a2', meaning: '둘' }, { english: 'a3', meaning: '셋' }]
		});
		db.prepare("DELETE FROM words WHERE english = 'a2'").run();

		importDay(db, { day: 1, words: [{ english: 'a4', meaning: '넷' }] });

		expect(englishOf(1)).toEqual(['a1', 'a3', 'a4']);
	});

	it.each([
		['영어가 공백뿐인 항목', { day: 1, words: [{ english: '  ', meaning: '뜻' }] }],
		['뜻이 빈 항목', { day: 1, words: [{ english: 'garden', meaning: '' }] }],
		['Day가 0', { day: 0, words: [{ english: 'garden', meaning: '정원' }] }],
		['Day가 정수가 아님', { day: 1.5, words: [{ english: 'garden', meaning: '정원' }] }],
		['Day가 문자열', { day: '1', words: [{ english: 'garden', meaning: '정원' }] }],
		['Day가 안전한 정수 범위 밖', { day: 1e20, words: [{ english: 'garden', meaning: '정원' }] }],
		['단어 목록이 빔', { day: 1, words: [] }],
		['단어 목록이 배열이 아님', { day: 1, words: 'garden' }],
		['선택 칸이 문자열이 아님', { day: 1, words: [{ english: 'garden', meaning: '정원', pos: 3 }] }]
	])('%s이면 요청 전체를 거부한다', (_label, input) => {
		expectRepoError(() => importDay(db, input as never), 'invalid_request');
	});

	it('항목 하나라도 잘못되면 아무것도 저장하지 않는다', () => {
		expectRepoError(
			() =>
				importDay(db, {
					day: 1,
					words: [{ english: 'garden', meaning: '정원' }, { english: 'forest', meaning: ' ' }]
				}),
			'invalid_request'
		);

		expect(listDays(db)).toEqual([]);
		expect(getDayWords(db, 1)).toBeNull();
	});
});

describe('listDays', () => {
	it('Day 번호 오름차순으로, 숨긴 단어를 포함한 단어 수와 함께 돌려준다', () => {
		importDay(db, { day: 2, words: [{ english: 'garden', meaning: '정원' }] });
		importDay(db, { day: 1, words: [{ english: 'feather', meaning: '깃털, 깃' }, { english: 'tiger', meaning: '호랑이' }] });
		db.prepare("UPDATE words SET hidden = 1 WHERE english = 'tiger'").run();

		expect(listDays(db)).toEqual([
			{ number: 1, wordCount: 2, studyCount: 0, lastStudiedOn: null },
			{ number: 2, wordCount: 1, studyCount: 0, lastStudiedOn: null }
		]);
	});
});

describe('getDayWords', () => {
	it('없는 Day면 null을 돌려준다', () => {
		expect(getDayWords(db, 9)).toBeNull();
	});
});

describe('countStudyableWords', () => {
	it('여러 Day에 속한 단어는 한 번만 세고 숨긴 단어는 뺀다', () => {
		importDay(db, { day: 1, words: [{ english: 'garden', meaning: '정원' }, { english: 'tiger', meaning: '호랑이' }] });
		importDay(db, { day: 2, words: [{ english: 'garden', meaning: '정원' }, { english: 'cotton', meaning: '면' }] });
		db.prepare("UPDATE words SET hidden = 1 WHERE english = 'cotton'").run();

		expect(countStudyableWords(db)).toBe(2);
	});
});

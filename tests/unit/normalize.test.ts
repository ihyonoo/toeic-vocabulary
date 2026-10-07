import { describe, expect, it } from 'vitest';
import { englishKey, normalizeEnglish, normalizeMeaning } from '$lib/domain/normalize';

describe('normalizeEnglish', () => {
	it('앞뒤 공백을 지우고 연속 공백을 하나로 줄인다', () => {
		expect(normalizeEnglish('  climb   the\tmountain ')).toBe('climb the mountain');
	});

	it('대소문자는 입력 그대로 둔다', () => {
		expect(normalizeEnglish('Garden')).toBe('Garden');
	});
});

describe('englishKey', () => {
	it('대소문자와 공백 차이를 무시한다', () => {
		expect(englishKey(' Front  Porch')).toBe('front porch');
		expect(englishKey('Rabbit')).toBe(englishKey(' rabbit '));
	});
});

describe('normalizeMeaning', () => {
	it('쉼표·세미콜론 앞 공백을 없애고 뒤 공백을 하나로 맞춘다', () => {
		expect(normalizeMeaning('노래하다 ,부르다')).toBe('노래하다, 부르다');
		expect(normalizeMeaning('사과, 능금;과일,  열매')).toBe('사과, 능금; 과일, 열매');
	});

	it('끝에 붙은 쉼표 뒤에 공백을 남기지 않는다', () => {
		expect(normalizeMeaning(' 사과, 능금, ')).toBe('사과, 능금,');
	});

	it('공백만 있으면 빈 문자열이 된다', () => {
		expect(normalizeMeaning('   ')).toBe('');
	});

	it('뜻 항목의 순서는 바꾸지 않는다 (순서가 다르면 다른 단어)', () => {
		expect(normalizeMeaning('덜거덕거리다, 딸랑이')).not.toBe(normalizeMeaning('딸랑이, 덜거덕거리다'));
	});
});

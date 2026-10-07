import { describe, expect, it } from 'vitest';
import { dayLabel, monthDay } from '$lib/domain/format';

describe('dayLabel', () => {
	it('두 자리로 맞춘다', () => {
		expect(dayLabel(1)).toBe('Day 01');
		expect(dayLabel(12)).toBe('Day 12');
	});

	it('세 자리 이상은 그대로 쓴다', () => {
		expect(dayLabel(101)).toBe('Day 101');
	});
});

describe('monthDay', () => {
	it('YYYY-MM-DD에서 연도를 뺀다', () => {
		expect(monthDay('2026-10-07')).toBe('10-07');
	});
});

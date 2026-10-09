import { describe, expect, it } from 'vitest';
import { createLimiter } from '$lib/server/rateLimit';

const WINDOW = 15 * 60_000;
const limiter = () => createLimiter({ max: 10, windowMs: WINDOW });

function failTimes(l: ReturnType<typeof limiter>, key: string, times: number, at = 0) {
	for (let i = 0; i < times; i++) l.fail(key, at);
}

describe('비밀번호 시도 제한', () => {
	it('9번 틀려도 막지 않고 10번째에 막는다', () => {
		const l = limiter();
		failTimes(l, '1.1.1.1', 9);
		expect(l.blocked('1.1.1.1', 0)).toBe(false);
		l.fail('1.1.1.1', 0);
		expect(l.blocked('1.1.1.1', 0)).toBe(true);
	});

	it('10번째 실패부터 15분 동안 막는다', () => {
		const l = limiter();
		failTimes(l, 'ip', 9, 0);
		l.fail('ip', 10 * 60_000);
		expect(l.blocked('ip', 10 * 60_000 + WINDOW - 1)).toBe(true);
		expect(l.blocked('ip', 10 * 60_000 + WINDOW)).toBe(false);
	});

	it('15분이 지나면 센 횟수를 처음부터 다시 센다', () => {
		const l = limiter();
		failTimes(l, 'ip', 9, 0);
		l.fail('ip', WINDOW);
		expect(l.blocked('ip', WINDOW)).toBe(false);
	});

	it('막힌 뒤 풀리면 다시 10번을 허용한다', () => {
		const l = limiter();
		failTimes(l, 'ip', 10, 0);
		failTimes(l, 'ip', 9, WINDOW);
		expect(l.blocked('ip', WINDOW)).toBe(false);
	});

	it('성공하면 기록을 지운다', () => {
		const l = limiter();
		failTimes(l, 'ip', 9);
		l.reset('ip');
		l.fail('ip', 0);
		expect(l.blocked('ip', 0)).toBe(false);
	});

	it('IP마다 따로 센다', () => {
		const l = limiter();
		failTimes(l, 'a', 10);
		expect(l.blocked('a', 0)).toBe(true);
		expect(l.blocked('b', 0)).toBe(false);
	});
});

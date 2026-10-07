import { describe, expect, it } from 'vitest';
import { checkPassword, isAuthorized, safeNext, sessionToken } from '$lib/server/auth';

const PASSWORD = 'correct horse';

describe('checkPassword', () => {
	it('같은 비밀번호면 참이다', () => {
		expect(checkPassword('correct horse', PASSWORD)).toBe(true);
	});

	it('길이가 다른 비밀번호도 예외 없이 거짓이다', () => {
		expect(checkPassword('x', PASSWORD)).toBe(false);
		expect(checkPassword('correct horse battery staple', PASSWORD)).toBe(false);
	});

	it('설정된 비밀번호가 비어 있으면 무엇을 넣어도 거짓이다', () => {
		expect(checkPassword('', '')).toBe(false);
	});
});

describe('isAuthorized', () => {
	it('세션 쿠키가 맞으면 통과한다', () => {
		expect(isAuthorized({ cookie: sessionToken(PASSWORD), authorization: null }, PASSWORD)).toBe(true);
	});

	it('다른 비밀번호로 만든 쿠키는 통과하지 못한다', () => {
		expect(isAuthorized({ cookie: sessionToken('old password'), authorization: null }, PASSWORD)).toBe(false);
	});

	it('Bearer 토큰이 비밀번호와 같으면 통과한다', () => {
		expect(isAuthorized({ cookie: undefined, authorization: `Bearer ${PASSWORD}` }, PASSWORD)).toBe(true);
	});

	it('Bearer 토큰이 틀리거나 형식이 다르면 통과하지 못한다', () => {
		expect(isAuthorized({ cookie: undefined, authorization: 'Bearer nope' }, PASSWORD)).toBe(false);
		expect(isAuthorized({ cookie: undefined, authorization: PASSWORD }, PASSWORD)).toBe(false);
		expect(isAuthorized({ cookie: undefined, authorization: null }, PASSWORD)).toBe(false);
	});
});

describe('safeNext', () => {
	it('같은 사이트 상대 경로는 쿼리까지 그대로 쓴다', () => {
		expect(safeNext('/study?scope=day&day=1')).toBe('/study?scope=day&day=1');
	});

	it.each([
		'//evil.com',
		'/\\evil.com',
		'/\t/evil.com',
		'/\n/evil.com',
		'/.//evil.com',
		'/..//evil.com',
		'/%2e//evil.com',
		'/a/..//evil.com',
		'//[',
		'/\\[',
		'https://evil.com',
		'days/1',
		'',
		null
	])(
		'%s는 홈으로 바꾼다',
		(next) => {
			expect(safeNext(next)).toBe('/');
		}
	);
});

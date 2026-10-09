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
	const SECRET = 'server-only-secret';
	const keys = { password: PASSWORD, secret: SECRET };

	it('세션 쿠키가 맞으면 통과한다', () => {
		expect(isAuthorized({ cookie: sessionToken(PASSWORD, SECRET), authorization: null }, keys)).toBe(true);
	});

	it('다른 비밀번호로 만든 쿠키는 통과하지 못한다', () => {
		expect(isAuthorized({ cookie: sessionToken('old password', SECRET), authorization: null }, keys)).toBe(false);
	});

	// 저장소가 공개라 계산법이 알려져 있다
	// 비밀값 없이 비밀번호만으로 쿠키를 만들 수 있으면 로그인 제한을 우회해 비밀번호를 맞혀 본다
	it('비밀번호를 알아도 서버 비밀값이 다르면 쿠키를 만들 수 없다', () => {
		expect(isAuthorized({ cookie: sessionToken(PASSWORD, 'guessed'), authorization: null }, keys)).toBe(false);
		expect(isAuthorized({ cookie: sessionToken(PASSWORD, ''), authorization: null }, keys)).toBe(false);
	});

	it('서버 비밀값이 비어 있으면 쿠키로 통과하지 못한다', () => {
		const noSecret = { password: PASSWORD, secret: '' };
		expect(isAuthorized({ cookie: sessionToken(PASSWORD, ''), authorization: null }, noSecret)).toBe(false);
	});

	it('Bearer 토큰이 비밀번호와 같으면 통과한다', () => {
		expect(isAuthorized({ cookie: undefined, authorization: `Bearer ${PASSWORD}` }, keys)).toBe(true);
	});

	it('Bearer 토큰이 틀리거나 형식이 다르면 통과하지 못한다', () => {
		expect(isAuthorized({ cookie: undefined, authorization: 'Bearer nope' }, keys)).toBe(false);
		expect(isAuthorized({ cookie: undefined, authorization: PASSWORD }, keys)).toBe(false);
		expect(isAuthorized({ cookie: undefined, authorization: null }, keys)).toBe(false);
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

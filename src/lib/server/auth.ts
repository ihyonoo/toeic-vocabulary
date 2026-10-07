import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'vocab_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

function digest(key: string, value: string): Buffer {
	return createHmac('sha256', key).update(value).digest();
}

// 길이가 달라도 예외 없이 비교하려고 고정 길이 다이제스트끼리 비교한다
function sameSecret(given: string, expected: string): boolean {
	if (!expected) return false;
	return timingSafeEqual(digest('compare', given), digest('compare', expected));
}

export function sessionToken(password: string): string {
	return digest(password, 'vocab-session-v1').toString('hex');
}

export function checkPassword(given: string, password: string): boolean {
	return sameSecret(given, password);
}

export function isAuthorized(
	req: { cookie: string | undefined; authorization: string | null },
	password: string
): boolean {
	if (!password) return false;
	if (req.cookie && sameSecret(req.cookie, sessionToken(password))) return true;
	const match = req.authorization?.match(/^Bearer (.+)$/);
	return match ? sameSecret(match[1], password) : false;
}

// URL 파서가 탭·줄바꿈을 지우고 \를 /로 읽으므로 파싱한 결과의 출처로 판정한다
// /.//evil.com처럼 점 경로가 풀리면 //로 시작할 수 있어 결과도 다시 검사한다
export function safeNext(next: string | null | undefined): string {
	if (!next?.startsWith('/')) return '/';
	const base = 'http://same.origin';
	let url: URL;
	try {
		url = new URL(next, base);
	} catch {
		return '/';
	}
	const path = url.pathname + url.search;
	return url.origin === base && !path.startsWith('//') ? path : '/';
}

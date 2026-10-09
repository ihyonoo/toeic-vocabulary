import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, safeNext, sessionToken } from '$lib/server/auth';
import { appPassword, sessionSecret } from '$lib/server/env';
import { HttpError, handleApi, readJson } from '$lib/server/http';
import { TOO_MANY_ATTEMPTS, passwordLimiter } from '$lib/server/rateLimit';

export const POST: RequestHandler = ({ request, cookies, url, getClientAddress }) =>
	handleApi(async () => {
		const ip = getClientAddress();
		const body = (await readJson(request)) as { password?: unknown; next?: unknown } | null;
		// 본문을 기다린 뒤에 확인한다
		// 먼저 확인하면 본문을 늦게 보낸 요청들이 차단 전에 모두 비밀번호를 확인받는다
		if (passwordLimiter.blocked(ip)) throw new HttpError(429, 'too_many_attempts', TOO_MANY_ATTEMPTS);
		const password = typeof body?.password === 'string' ? body.password : '';
		if (!checkPassword(password, appPassword())) {
			passwordLimiter.fail(ip);
			throw new HttpError(400, 'wrong_password', '비밀번호가 맞지 않아요.');
		}
		passwordLimiter.reset(ip);
		cookies.set(SESSION_COOKIE, sessionToken(appPassword(), sessionSecret()), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE,
			// 와이파이 안 HTTP 접속에서도 쿠키가 저장되게
			secure: url.protocol === 'https:'
		});
		return json({ next: safeNext(typeof body?.next === 'string' ? body.next : null) });
	});

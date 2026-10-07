import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE, SESSION_MAX_AGE, checkPassword, safeNext, sessionToken } from '$lib/server/auth';
import { appPassword } from '$lib/server/env';
import { HttpError, handleApi, readJson } from '$lib/server/http';

export const POST: RequestHandler = ({ request, cookies, url }) =>
	handleApi(async () => {
		const body = (await readJson(request)) as { password?: unknown; next?: unknown } | null;
		const password = typeof body?.password === 'string' ? body.password : '';
		if (!checkPassword(password, appPassword())) {
			throw new HttpError(400, 'wrong_password', '비밀번호가 맞지 않아요.');
		}
		cookies.set(SESSION_COOKIE, sessionToken(appPassword()), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: SESSION_MAX_AGE,
			// 와이파이 안 HTTP 접속에서도 쿠키가 저장되게
			secure: url.protocol === 'https:'
		});
		return json({ next: safeNext(typeof body?.next === 'string' ? body.next : null) });
	});

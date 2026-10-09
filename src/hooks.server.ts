import type { Handle, ServerInit } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE, isAuthorized } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { appPassword } from '$lib/server/env';
import { apiError } from '$lib/server/http';
import { failInterruptedDrafts } from '$lib/server/repo';

export const init: ServerInit = () => {
	if (building) return;
	if (!env.APP_PASSWORD) throw new Error('APP_PASSWORD 환경 변수가 없습니다');
	// ORIGIN이 없으면 adapter-node가 HTTP 요청을 https로 판정한다
	if (!dev && !env.ORIGIN) throw new Error('ORIGIN 환경 변수가 없습니다');
	// 지난 실행에서 처리 중이던 사진 등록은 이어 갈 수 없다
	failInterruptedDrafts(getDb());
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.authed = isAuthorized(
		{
			cookie: event.cookies.get(SESSION_COOKIE),
			authorization: event.request.headers.get('authorization')
		},
		appPassword()
	);

	// 원문 경로는 퍼센트 인코딩으로 우회되므로(/%61pi/...) 매칭된 라우트로 판정한다
	const route = event.route.id;
	if (route?.startsWith('/api/') && route !== '/api/login' && !event.locals.authed) {
		return apiError(401, 'unauthorized', '로그인이 필요해요.');
	}
	return resolve(event);
};

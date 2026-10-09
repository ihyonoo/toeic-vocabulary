import type { Handle, ServerInit } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { SESSION_COOKIE, isAuthorized } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { appPassword, sessionSecret } from '$lib/server/env';
import { apiError } from '$lib/server/http';
import { TOO_MANY_ATTEMPTS, passwordLimiter } from '$lib/server/rateLimit';
import { failInterruptedDrafts } from '$lib/server/repo';

export const init: ServerInit = () => {
	if (building) return;
	if (!env.APP_PASSWORD) throw new Error('APP_PASSWORD 환경 변수가 없습니다');
	// 쿠키는 시도 횟수를 세지 않으므로 이 값을 맞힐 수 없어야 한다
	if ((env.SESSION_SECRET ?? '').length < 32) throw new Error('SESSION_SECRET은 32자 이상이어야 합니다');
	// ORIGIN이 없으면 adapter-node가 HTTP 요청을 https로 판정한다
	if (!dev && !env.ORIGIN) throw new Error('ORIGIN 환경 변수가 없습니다');
	// 지난 실행에서 처리 중이던 사진 등록은 이어 갈 수 없다
	failInterruptedDrafts(getDb());
};

export const handle: Handle = async ({ event, resolve }) => {
	const authorization = event.request.headers.get('authorization');
	// Bearer는 비밀번호를 직접 맞혀 보는 요청이라 로그인과 같이 센다
	// 로그인 API는 핸들러가 따로 세므로 여기서는 세지 않는다
	// 쿠키는 서버 비밀값으로 서명해 맞힐 수 없어 세지 않는다
	const checksBearer = Boolean(authorization) && event.route.id !== '/api/login';
	// 주소가 빈 문자열이어도 그대로 키로 쓴다
	const ip = checksBearer ? event.getClientAddress() : '';
	if (checksBearer && passwordLimiter.blocked(ip)) return apiError(429, 'too_many_attempts', TOO_MANY_ATTEMPTS);

	event.locals.authed = isAuthorized(
		{ cookie: event.cookies.get(SESSION_COOKIE), authorization },
		{ password: appPassword(), secret: sessionSecret() }
	);
	if (checksBearer && !event.locals.authed) passwordLimiter.fail(ip);

	// 원문 경로는 퍼센트 인코딩으로 우회되므로(/%61pi/...) 매칭된 라우트로 판정한다
	const route = event.route.id;
	if (route?.startsWith('/api/') && route !== '/api/login' && !event.locals.authed) {
		return apiError(401, 'unauthorized', '로그인이 필요해요.');
	}
	return resolve(event);
};

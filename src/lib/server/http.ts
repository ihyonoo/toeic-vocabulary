import { json } from '@sveltejs/kit';
import { RepoError, type RepoErrorCode } from './repo';

const REPO_STATUS: Record<RepoErrorCode, number> = {
	invalid_request: 400,
	day_not_found: 404,
	word_not_found: 404,
	already_in_day: 409,
	duplicate_word: 409
};

export class HttpError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

export function apiError(status: number, code: string, message: string): Response {
	return json({ error: { code, message } }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
	if (!request.headers.get('content-type')?.includes('application/json')) {
		throw new HttpError(415, 'unsupported_media_type', 'JSON 본문만 받아요.');
	}
	try {
		return await request.json();
	} catch {
		throw new HttpError(400, 'invalid_request', 'JSON 형식이 잘못됐어요.');
	}
}

export function parseId(value: string): number {
	const n = Number(value);
	if (!/^\d+$/.test(value) || n < 1) throw new HttpError(400, 'invalid_request', '번호가 잘못됐어요.');
	return n;
}

export async function handleApi(fn: () => Response | Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof HttpError) return apiError(e.status, e.code, e.message);
		if (e instanceof RepoError) return apiError(REPO_STATUS[e.code], e.code, e.message);
		console.error(e);
		return apiError(500, 'internal_error', '서버 오류가 났어요.');
	}
}

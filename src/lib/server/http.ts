import { json } from '@sveltejs/kit';
import { RepoError, type RepoErrorCode } from './repo';

const REPO_STATUS: Record<RepoErrorCode, number> = {
	invalid_request: 400,
	day_not_found: 404,
	word_not_found: 404,
	already_in_day: 409,
	duplicate_word: 409,
	draft_not_found: 404,
	draft_not_ready: 409
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
	} catch (e) {
		// BODY_SIZE_LIMIT를 넘으면 본문 읽기가 413으로 끝난다
		if ((e as { status?: number })?.status === 413) {
			throw new HttpError(413, 'payload_too_large', '요청이 너무 커요. 사진 수를 줄여 주세요.');
		}
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

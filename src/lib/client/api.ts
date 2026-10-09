import type {
	DayWord,
	Draft,
	DraftInput,
	DraftSummary,
	ImportResult,
	Section,
	Word,
	WordPatch
} from '$lib/domain/types';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message: string
	) {
		super(message);
	}
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method,
		headers: body === undefined ? undefined : { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (res.status === 204) return undefined as T;
	const data = await res.json().catch(() => null);
	if (!res.ok) {
		throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? '요청에 실패했어요.');
	}
	return data as T;
}

export const api = {
	login: (password: string, next: string | null) =>
		request<{ next: string }>('POST', '/api/login', { password, next }),
	patchWord: (id: number, patch: WordPatch) =>
		request<{ word: Word }>('PATCH', `/api/words/${id}`, patch),
	deleteWord: (id: number) => request<void>('DELETE', `/api/words/${id}`),
	addWord: (day: number, input: { english: string; meaning: string }) =>
		request<{ word: DayWord; result: 'created' | 'linked' }>('POST', `/api/days/${day}/words`, input),
	recordStudy: (day: number) =>
		request<{ studyCount: number; lastStudiedOn: string }>('POST', `/api/days/${day}/study-log`),
	createImport: (input: { day: number; section: Section; photos: string[] }) =>
		request<{ draft: DraftSummary }>('POST', '/api/imports', input),
	getImport: (id: number) => request<{ draft: Draft }>('GET', `/api/imports/${id}`),
	saveImport: (id: number, input: DraftInput) => request<{ draft: Draft }>('PUT', `/api/imports/${id}`, input),
	commitImport: (id: number, input: DraftInput) =>
		request<ImportResult>('POST', `/api/imports/${id}/commit`, input),
	discardImport: (id: number) => request<void>('DELETE', `/api/imports/${id}`)
};

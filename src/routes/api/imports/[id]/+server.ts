import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { handleApi, parseId, readJson } from '$lib/server/http';
import { cancelImport } from '$lib/server/imports';
import { deleteDraft, getDraft, saveDraft } from '$lib/server/repo';

export const GET: RequestHandler = ({ params }) =>
	handleApi(() => json({ draft: getDraft(getDb(), parseId(params.id)) }));

export const PUT: RequestHandler = ({ params, request }) =>
	handleApi(async () => {
		const id = parseId(params.id);
		return json({ draft: saveDraft(getDb(), id, await readJson(request)) });
	});

// 처리 중이면 OpenAI 요청도 끊는다
export const DELETE: RequestHandler = ({ params }) =>
	handleApi(() => {
		const id = parseId(params.id);
		deleteDraft(getDb(), id);
		cancelImport(id);
		return new Response(null, { status: 204 });
	});

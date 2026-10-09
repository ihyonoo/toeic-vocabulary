import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { handleApi, parseId, readJson } from '$lib/server/http';
import { commitDraft } from '$lib/server/repo';

export const POST: RequestHandler = ({ params, request }) =>
	handleApi(async () => {
		const id = parseId(params.id);
		return json(commitDraft(getDb(), id, await readJson(request)));
	});

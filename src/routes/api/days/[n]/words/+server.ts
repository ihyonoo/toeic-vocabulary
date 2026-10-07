import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { handleApi, parseId, readJson } from '$lib/server/http';
import { addWordToDay } from '$lib/server/repo';

export const POST: RequestHandler = ({ params, request }) =>
	handleApi(async () => {
		const day = parseId(params.n);
		const body = (await readJson(request)) as { english: string; meaning: string };
		return json(addWordToDay(getDb(), day, body), { status: 201 });
	});

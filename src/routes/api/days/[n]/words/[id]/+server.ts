import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Section } from '$lib/domain/types';
import { getDb } from '$lib/server/db';
import { handleApi, parseId, readJson } from '$lib/server/http';
import { setSection } from '$lib/server/repo';

export const PATCH: RequestHandler = ({ params, request }) =>
	handleApi(async () => {
		const day = parseId(params.n);
		const id = parseId(params.id);
		const body = (await readJson(request)) as { section?: Section } | null;
		return json({ word: setSection(getDb(), day, id, body?.section as Section) });
	});

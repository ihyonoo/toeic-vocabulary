import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { openaiApiKey } from '$lib/server/env';
import { handleApi, readJson } from '$lib/server/http';
import { startImport } from '$lib/server/imports';

// 처리를 기다리지 않고 처리 중 초안을 돌려준다
export const POST: RequestHandler = ({ request }) =>
	handleApi(async () => {
		const { draft } = startImport(getDb(), await readJson(request), { apiKey: openaiApiKey() });
		return json({ draft }, { status: 201 });
	});

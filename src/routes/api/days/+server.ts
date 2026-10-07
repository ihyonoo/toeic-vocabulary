import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { ImportInput } from '$lib/domain/types';
import { getDb } from '$lib/server/db';
import { handleApi, readJson } from '$lib/server/http';
import { importDay, listDays } from '$lib/server/repo';

export const GET: RequestHandler = () => handleApi(() => json({ days: listDays(getDb()) }));

export const POST: RequestHandler = ({ request }) =>
	handleApi(async () => json(importDay(getDb(), (await readJson(request)) as ImportInput)));

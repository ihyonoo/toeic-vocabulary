import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { handleApi } from '$lib/server/http';
import { listDays } from '$lib/server/repo';

export const GET: RequestHandler = () => handleApi(() => json({ days: listDays(getDb()) }));

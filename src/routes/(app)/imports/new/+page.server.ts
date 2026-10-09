import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { openaiApiKey } from '$lib/server/env';
import { nextClassDay } from '$lib/server/repo';

export const load: PageServerLoad = () => ({
	nextDay: nextClassDay(getDb()),
	enabled: openaiApiKey() !== ''
});

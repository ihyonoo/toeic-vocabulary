import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { countStudyableWords, listDays } from '$lib/server/repo';

export const load: PageServerLoad = () => {
	const db = getDb();
	return { days: listDays(db), studyableCounts: countStudyableWords(db) };
};

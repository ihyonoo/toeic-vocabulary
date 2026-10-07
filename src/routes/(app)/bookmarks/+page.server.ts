import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getBookmarkedWords } from '$lib/server/repo';

export const load: PageServerLoad = () => ({
	words: getBookmarkedWords(getDb(), { includeHidden: true })
});

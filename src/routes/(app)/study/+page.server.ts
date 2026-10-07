import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Order, Repeat, StudyScope, Word } from '$lib/domain/types';
import { getDb } from '$lib/server/db';
import { getAllWords, getBookmarkedWords, getDayWords } from '$lib/server/repo';

const SCOPES: StudyScope[] = ['day', 'all', 'bookmarks'];
const ORDERS: Order[] = ['textbook', 'random', 'alpha'];
const REPEATS: Record<string, Repeat> = { '1': 1, '2': 2, '3': 3, loop: 'loop' };
const INVALID = '학습 설정이 잘못됐어요.';

export const load: PageServerLoad = ({ url }) => {
	const scope = url.searchParams.get('scope') as StudyScope;
	const order = url.searchParams.get('order') as Order;
	const repeat = REPEATS[url.searchParams.get('repeat') ?? ''];
	if (!SCOPES.includes(scope) || !ORDERS.includes(order) || repeat === undefined) error(400, INVALID);

	const db = getDb();
	let words: Word[];
	let day: number | null = null;
	if (scope === 'day') {
		const raw = url.searchParams.get('day') ?? '';
		day = Number(raw);
		if (!/^\d+$/.test(raw) || day < 1) error(400, INVALID);
		const dayWords = getDayWords(db, day);
		if (!dayWords) error(404, 'Day를 찾을 수 없어요.');
		words = dayWords;
	} else if (scope === 'all') {
		words = getAllWords(db, { includeHidden: false });
	} else {
		words = getBookmarkedWords(db, { includeHidden: false });
	}
	return { scope, day, order, repeat, words: words.filter((w) => !w.hidden) };
};

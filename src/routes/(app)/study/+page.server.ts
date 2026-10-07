import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Order, Repeat, StudyGroup, StudyScope, Word } from '$lib/domain/types';
import { getDb } from '$lib/server/db';
import { getAllWords, getBookmarkedWords, getDayWords } from '$lib/server/repo';

const SCOPES: StudyScope[] = ['day', 'all', 'bookmarks'];
const ORDERS: Order[] = ['textbook', 'random', 'alpha'];
const REPEATS: Record<string, Repeat> = { '1': 1, '2': 2, '3': 3, loop: 'loop' };
const GROUPS: StudyGroup[] = ['all', 'class', 'mine'];
const INVALID = '학습 설정이 잘못됐어요.';

// 카드 보기: 목록에서 누른 단어부터 넘겨 본다
// 목록과 같은 단어(숨김 포함), 같은 순서이고 학습 기록은 남기지 않는다
function loadBrowse(url: URL) {
	const scope = url.searchParams.get('scope');
	const startRaw = url.searchParams.get('start');
	if (startRaw !== null && !/^\d+$/.test(startRaw)) error(400, INVALID);
	const start = startRaw === null ? null : Number(startRaw);
	const db = getDb();
	const base = { mode: 'browse' as const, order: 'textbook' as Order, repeat: 1 as Repeat, group: 'all' as StudyGroup, start };
	if (scope === 'bookmarks') {
		const words = getBookmarkedWords(db, { includeHidden: true, alsoId: start ?? undefined });
		return { ...base, scope: 'bookmarks' as const, day: null, words };
	}
	const raw = url.searchParams.get('day') ?? '';
	const day = Number(raw);
	if (scope !== 'day' || !/^\d+$/.test(raw) || day < 1) error(400, INVALID);
	const words = getDayWords(db, day);
	if (!words) error(404, 'Day를 찾을 수 없어요.');
	return { ...base, scope: 'day' as const, day, words: words as Word[] };
}

export const load: PageServerLoad = ({ url }) => {
	const mode = url.searchParams.get('mode');
	if (mode === 'browse') return loadBrowse(url);
	if (mode !== null) error(400, INVALID);
	const scope = url.searchParams.get('scope') as StudyScope;
	const order = url.searchParams.get('order') as Order;
	const repeat = REPEATS[url.searchParams.get('repeat') ?? ''];
	const group = (url.searchParams.get('group') ?? 'all') as StudyGroup;
	if (!SCOPES.includes(scope) || !ORDERS.includes(order) || repeat === undefined || !GROUPS.includes(group)) {
		error(400, INVALID);
	}

	const db = getDb();
	let words: Word[];
	let day: number | null = null;
	if (scope === 'day') {
		const raw = url.searchParams.get('day') ?? '';
		day = Number(raw);
		if (!/^\d+$/.test(raw) || day < 1) error(400, INVALID);
		const dayWords = getDayWords(db, day);
		if (!dayWords) error(404, 'Day를 찾을 수 없어요.');
		words = group === 'all' ? dayWords : dayWords.filter((w) => w.section === group);
	} else if (scope === 'all') {
		words = getAllWords(db, { includeHidden: false, group });
	} else {
		words = getBookmarkedWords(db, { includeHidden: false, group });
	}
	return { mode: 'study' as const, scope, day, order, repeat, group, start: null, words: words.filter((w) => !w.hidden) };
};

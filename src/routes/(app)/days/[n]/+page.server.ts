import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getDayWords } from '$lib/server/repo';

export const load: PageServerLoad = ({ params }) => {
	const day = Number(params.n);
	const words = /^\d+$/.test(params.n) && day >= 1 ? getDayWords(getDb(), day) : null;
	if (!words) error(404, 'Day를 찾을 수 없어요.');
	return { day, words };
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { HttpError, handleApi, parseId } from '$lib/server/http';
import { deleteDay, getDayWords } from '$lib/server/repo';

// Claude가 단어 id를 찾아 예문을 채우거나 묶음을 바로잡을 때 쓴다
export const GET: RequestHandler = ({ params }) =>
	handleApi(() => {
		const day = parseId(params.n);
		const words = getDayWords(getDb(), day);
		if (!words) throw new HttpError(404, 'day_not_found', 'Day를 찾을 수 없어요.');
		return json({ day, words });
	});

export const DELETE: RequestHandler = ({ params }) =>
	handleApi(() => {
		const day = parseId(params.n);
		const result = deleteDay(getDb(), day);
		if (!result) throw new HttpError(404, 'day_not_found', 'Day를 찾을 수 없어요.');
		return json({ day, ...result });
	});

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { HttpError, handleApi, parseId } from '$lib/server/http';
import { deleteDay } from '$lib/server/repo';

export const DELETE: RequestHandler = ({ params }) =>
	handleApi(() => {
		const day = parseId(params.n);
		const result = deleteDay(getDb(), day);
		if (!result) throw new HttpError(404, 'day_not_found', 'Day를 찾을 수 없어요.');
		return json({ day, ...result });
	});

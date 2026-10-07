import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { HttpError, handleApi, parseId } from '$lib/server/http';
import { recordStudy } from '$lib/server/repo';

export const POST: RequestHandler = ({ params }) =>
	handleApi(() => {
		const result = recordStudy(getDb(), parseId(params.n), new Date());
		if (!result) throw new HttpError(404, 'day_not_found', 'Day를 찾을 수 없어요.');
		return json(result);
	});

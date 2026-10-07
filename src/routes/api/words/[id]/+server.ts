import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { WordPatch } from '$lib/domain/types';
import { getDb } from '$lib/server/db';
import { HttpError, handleApi, parseId, readJson } from '$lib/server/http';
import { deleteWord, updateWord } from '$lib/server/repo';

export const PATCH: RequestHandler = ({ params, request }) =>
	handleApi(async () => {
		const id = parseId(params.id);
		const patch = (await readJson(request)) as WordPatch;
		return json({ word: updateWord(getDb(), id, patch) });
	});

export const DELETE: RequestHandler = ({ params }) =>
	handleApi(() => {
		if (!deleteWord(getDb(), parseId(params.id))) {
			throw new HttpError(404, 'word_not_found', '단어를 찾을 수 없어요.');
		}
		return new Response(null, { status: 204 });
	});

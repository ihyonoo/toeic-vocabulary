import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { RepoError, getDraft } from '$lib/server/repo';

export const load: PageServerLoad = ({ params }) => {
	if (!/^\d+$/.test(params.id)) error(404, '초안을 찾을 수 없어요.');
	try {
		return { draft: getDraft(getDb(), Number(params.id)) };
	} catch (e) {
		if (e instanceof RepoError) error(404, '초안을 찾을 수 없어요.');
		throw e;
	}
};

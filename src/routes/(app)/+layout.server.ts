import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.authed) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
};

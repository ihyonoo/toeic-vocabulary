import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_PASSWORD, FAKE_OPENAI } from '../../playwright.config';

export const AUTH = { Authorization: `Bearer ${E2E_PASSWORD}` };

export type Item = { english: string; meaning: string; pos?: string; example?: string; exampleKo?: string };

type Target = { day: number; section: 'class' | 'mine' } | { day: number; section: 'custom'; customName: string };

// 단어는 사진 등록으로만 들어간다
// 가짜 OpenAI가 그 단어들을 읽은 초안을 만들고 등록한다
async function seedDraft(request: APIRequestContext, target: Target, words: Item[]) {
	const items = words.map((w) => ({
		english: w.english,
		meaning: w.meaning,
		pos: w.pos ?? '',
		example: w.example ?? '',
		exampleKo: w.exampleKo ?? '',
		paperEnglish: null,
		meaningFilled: false
	}));
	const scenario = await request.post(`${FAKE_OPENAI}/__scenario`, { data: { words: items } });
	expect(scenario.status()).toBe(204);
	const created = await request.post('/api/imports', {
		headers: AUTH,
		data: { ...target, photos: ['data:image/jpeg;base64,AAAA'] }
	});
	expect(created.status()).toBe(201);
	const { draft } = await created.json();
	await expect
		.poll(async () => (await (await request.get(`/api/imports/${draft.id}`, { headers: AUTH })).json()).draft.status)
		.toBe('ready');
	const res = await request.post(`/api/imports/${draft.id}/commit`, { headers: AUTH, data: { ...target, items } });
	expect(res.status()).toBe(200);
	return res.json();
}

export async function seedDay(
	request: APIRequestContext,
	day: number,
	words: Item[],
	section: 'class' | 'mine' = 'class'
) {
	return seedDraft(request, { day, section }, words);
}

export async function seedCustom(request: APIRequestContext, day: number, customName: string, words: Item[]) {
	const filled = words.map((w) => ({
		english: w.english,
		meaning: w.meaning,
		pos: '명사',
		example: `The ${w.english}.`,
		exampleKo: `${w.meaning}.`
	}));
	return seedDraft(request, { day, section: 'custom', customName }, filled);
}

export function synthetic(prefix: string, count: number): Item[] {
	return Array.from({ length: count }, (_, i) => {
		const n = String(i + 1).padStart(3, '0');
		return { english: `${prefix}${n}`, meaning: `뜻${prefix}${n}`, pos: '명사' };
	});
}

export async function login(page: Page) {
	const res = await page.request.post('/api/login', { data: { password: E2E_PASSWORD } });
	expect(res.status()).toBe(200);
}

export async function swipeRow(page: Page, row: import('@playwright/test').Locator) {
	const box = (await row.boundingBox())!;
	const y = box.y + box.height / 2;
	await page.mouse.move(box.x + box.width * 0.9, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * 0.2, y, { steps: 4 });
	await page.mouse.up();
}

export async function swipeCard(page: Page, direction: 'left' | 'right') {
	const box = (await page.getByTestId('card').boundingBox())!;
	const y = box.y + box.height * 0.85;
	const [from, to] = direction === 'left' ? [0.85, 0.1] : [0.15, 0.9];
	await page.mouse.move(box.x + box.width * from, y);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width * to, y, { steps: 4 });
	await page.mouse.up();
}

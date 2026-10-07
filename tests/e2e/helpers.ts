import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';

export const AUTH = { Authorization: `Bearer ${E2E_PASSWORD}` };

export type Item = { english: string; meaning: string; pos?: string; example?: string; exampleKo?: string };

export async function seedDay(
	request: APIRequestContext,
	day: number,
	words: Item[],
	section: 'class' | 'mine' = 'class'
) {
	const res = await request.post('/api/days', { headers: AUTH, data: { day, section, words } });
	expect(res.status()).toBe(200);
	return res.json();
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

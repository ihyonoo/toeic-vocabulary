import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay, swipeCard } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

async function openSheet(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('dialog', { name: '학습 설정' })).toBeVisible();
}

test('알파벳순을 고르면 영어 알파벳 순서로 나온다 (R-26)', async ({ page, request }) => {
	await seedDay(request, 701, [
		{ english: 'puzzle', meaning: '퍼즐' },
		{ english: 'Anchor', meaning: '닻' },
		{ english: 'garden', meaning: '정원' }
	]);
	await page.goto('/days/701');
	await openSheet(page);
	await page.getByText('알파벳순', { exact: true }).click();
	await page.getByRole('button', { name: '학습 시작' }).click();

	await expect(page.getByTestId('card-english')).toHaveText('Anchor');
	await swipeCard(page, 'left');
	await expect(page.getByTestId('card-english')).toHaveText('garden');
});

test('마지막으로 고른 순서·반복을 기억해 다음 학습 설정에 미리 선택한다 (R-29)', async ({ page, request }) => {
	await seedDay(request, 702, [{ english: 'pack702', meaning: '칠하다' }]);
	await page.goto('/days/702');
	await openSheet(page);
	await page.getByText('랜덤', { exact: true }).click();
	await page.getByText('3회', { exact: true }).click();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/order=random&repeat=3/);

	await page.goto('/days/702');
	await openSheet(page);
	await expect(page.getByRole('radio', { name: '랜덤' })).toBeChecked();
	await expect(page.getByRole('radio', { name: '3회' })).toBeChecked();
});

test('완료 화면의 다시 학습은 숨긴 단어를 뺀 새 세션을 만들고 학습 기록도 새로 남긴다 (R-38, S-4)', async ({
	page,
	request
}) => {
	await seedDay(request, 703, [
		{ english: 'keep703', meaning: '남김' },
		{ english: 'drop703', meaning: '숨김' },
		{ english: 'stay703', meaning: '머묾' }
	]);
	await page.goto('/study?scope=day&day=703&order=textbook&repeat=1');
	await swipeCard(page, 'left');
	await page.getByTestId('card').getByRole('button', { name: '숨기기' }).click();
	await expect(page.getByTestId('card-english')).toHaveText('stay703');
	await swipeCard(page, 'left');
	await expect(page.getByText('학습을 마쳤어요')).toBeVisible();

	await page.getByRole('button', { name: '다시 학습' }).click();
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
	const seen: string[] = [];
	for (let i = 1; i <= 2; i++) {
		await expect(page.getByTestId('progress')).toHaveText(`${i} / 2`);
		seen.push((await page.getByTestId('card-english').textContent())!.trim());
		await swipeCard(page, 'left');
	}
	expect(seen).toEqual(['keep703', 'stay703']);

	await expect
		.poll(async () => {
			const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
			return days.find((d: { number: number }) => d.number === 703).studyCount;
		})
		.toBe(2);
});

test('홈 화면 앱 정보와 아이콘을 제공한다 (R-43)', async ({ request }) => {
	const manifest = await request.get('/manifest.webmanifest');
	expect(manifest.status()).toBe(200);
	const body = await manifest.json();
	expect(body).toMatchObject({ display: 'standalone', start_url: '/' });
	for (const icon of body.icons) {
		const res = await request.get(icon.src);
		expect(res.status(), icon.src).toBe(200);
		expect(res.headers()['content-type']).toBe('image/png');
	}
	expect((await request.get('/icons/icon-180.png')).status()).toBe(200);
});

test('학습 화면에서 화면 꺼짐 방지를 요청한다 (R-40)', async ({ page, request }) => {
	await page.addInitScript(() => {
		const calls: string[] = [];
		(window as unknown as { wakeCalls: string[] }).wakeCalls = calls;
		Object.defineProperty(navigator, 'wakeLock', {
			value: {
				request: async (type: string) => {
					calls.push(type);
					return { release: async () => {}, addEventListener() {} };
				}
			}
		});
	});
	await seedDay(request, 704, [{ english: 'awake704', meaning: '깨어 있는' }]);
	await page.goto('/study?scope=day&day=704&order=textbook&repeat=1');
	await expect(page.getByTestId('card')).toBeVisible();
	await expect.poll(() => page.evaluate(() => (window as unknown as { wakeCalls: string[] }).wakeCalls)).toEqual([
		'screen'
	]);
});

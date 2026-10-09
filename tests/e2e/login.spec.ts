import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';
import { seedDay } from './helpers';

test('로그인하지 않으면 로그인 화면으로 보내고, 로그인 뒤 원래 화면으로 돌아온다 (R-42)', async ({
	page,
	request
}) => {
	await seedDay(request, 201, [{ english: 'cousin', meaning: '사촌, 친척' }]);

	await page.goto('/days/201');
	await expect(page).toHaveURL(/\/login\?next=%2Fdays%2F201/);

	await page.getByLabel('비밀번호').fill('틀린 비밀번호');
	await page.getByRole('button', { name: '로그인' }).click();
	await expect(page.getByText('비밀번호가 맞지 않아요')).toBeVisible();

	await page.getByLabel('비밀번호').fill(E2E_PASSWORD);
	await page.getByRole('button', { name: '로그인' }).click();
	await expect(page).toHaveURL(/\/days\/201$/);
	await expect(page.getByText('cousin')).toBeVisible();
});

// 다른 테스트의 로그인이 막히지 않게 이 테스트만 다른 IP로 보낸다 (playwright.config.ts의 ADDRESS_HEADER)
test.describe('비밀번호 시도 제한', () => {
	test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.77' } });

	test('같은 IP가 10번 틀리면 맞는 비밀번호와 Bearer도 429로 막는다', async ({ request }) => {
		for (let i = 0; i < 9; i++) {
			expect((await request.post('/api/login', { data: { password: `wrong-${i}` } })).status()).toBe(400);
		}
		// 10번째는 Bearer 실패로 센다
		expect((await request.get('/api/days', { headers: { Authorization: 'Bearer wrong' } })).status()).toBe(401);

		const login = await request.post('/api/login', { data: { password: E2E_PASSWORD } });
		expect(login.status()).toBe(429);
		expect((await login.json()).error.message).toBe('로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.');
		expect(
			(await request.get('/api/days', { headers: { Authorization: `Bearer ${E2E_PASSWORD}` } })).status()
		).toBe(429);

		// 다른 IP는 그대로다
		const other = await request.post('/api/login', {
			data: { password: E2E_PASSWORD },
			headers: { 'x-forwarded-for': '203.0.113.78' }
		});
		expect(other.status()).toBe(200);
	});
});

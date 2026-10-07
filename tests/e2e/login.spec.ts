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

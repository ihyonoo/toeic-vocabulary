import { expect, test } from '@playwright/test';
import { login, seedDay } from './helpers';

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('홈은 Day를 오름차순으로 보여주고 단어 수와 학습 전 표시를 담는다 (R-10, R-12, R-14)', async ({
	page,
	request
}) => {
	await seedDay(request, 2, [{ english: 'garden', meaning: '정원' }]);
	await seedDay(request, 1, [
		{ english: 'feather', meaning: '깃털, 깃' },
		{ english: 'tiger', meaning: '호랑이' }
	]);

	await page.goto('/');
	const rows = page.getByRole('link', { name: /^Day \d+/ });
	await expect(rows.first()).toContainText('Day 01');
	await expect(rows.nth(1)).toContainText('Day 02');
	await expect(rows.first()).toContainText('2단어');
	await expect(rows.first()).toContainText('학습 전');
	await expect(page.getByRole('button', { name: '통합 학습' })).toBeVisible();
	await expect(page.getByRole('link', { name: '북마크' })).toBeVisible();

	await rows.first().click();
	await expect(page).toHaveURL(/\/days\/1$/);
});

test('Day 목록은 영어·뜻을 교재순으로 보여준다 (R-15)', async ({ page, request }) => {
	await seedDay(request, 301, [
		{ english: 'cloud', meaning: '구름, 먹구름' },
		{ english: 'arrest', meaning: '체포하다, 붙잡다' },
		{ english: 'shell', meaning: '조개껍데기, 껍질' }
	]);

	await page.goto('/days/301');
	await expect(page.getByRole('heading', { name: 'Day 301' })).toBeVisible();
	const rows = page.getByRole('listitem');
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText('cloud');
	await expect(rows.nth(0)).toContainText('구름, 먹구름');
	await expect(rows.nth(2)).toContainText('shell');
	await expect(page.getByRole('button', { name: '학습하기' })).toBeVisible();
});

test('없는 Day는 찾을 수 없다고 알린다', async ({ page }) => {
	await page.goto('/days/999');
	await expect(page.getByText('Day를 찾을 수 없어요')).toBeVisible();
});

test('보기 모드를 바꾸면 칸이 가려지고, 누르면 드러났다가 다시 가려진다 (R-16)', async ({
	page,
	request
}) => {
	await seedDay(request, 302, [
		{ english: 'squirrel', meaning: '다람쥐' },
		{ english: 'puzzle', meaning: '퍼즐' }
	]);
	await page.goto('/days/302');
	const toggle = page.getByRole('button', { name: /보기$/ });
	const row = page.getByRole('listitem').first();

	await expect(row).toContainText('squirrel');
	await expect(toggle).toHaveText('영어/뜻 보기');
	await toggle.click();
	await expect(toggle).toHaveText('영어만 보기');
	await expect(row).toContainText('터치하세요');
	await expect(row).not.toContainText('다람쥐');

	await row.getByRole('button', { name: '터치하세요' }).click();
	await expect(row).toContainText('다람쥐');
	await row.getByRole('button', { name: '다람쥐' }).click();
	await expect(row).not.toContainText('다람쥐');

	await toggle.click();
	await expect(toggle).toHaveText('뜻만 보기');
	await expect(row).toContainText('다람쥐');
	await expect(row).not.toContainText('squirrel');

	await toggle.click();
	await expect(toggle).toHaveText('영어/뜻 보기');
	await expect(row).toContainText('squirrel');
});

test('드러낸 칸은 보기 모드를 바꾸면 다시 가려진다 (R-16)', async ({ page, request }) => {
	await seedDay(request, 303, [{ english: 'paint', meaning: '칠하다' }]);
	await page.goto('/days/303');
	const toggle = page.getByRole('button', { name: /보기$/ });
	const row = page.getByRole('listitem').first();

	await toggle.click(); // 영어만
	await row.getByRole('button', { name: '터치하세요' }).click();
	await expect(row).toContainText('칠하다');
	await toggle.click(); // 뜻만
	await toggle.click(); // 둘 다
	await toggle.click(); // 영어만
	await expect(row).not.toContainText('칠하다');
});

test('보기 모드는 새로 열어도 유지되고 다른 화면에도 적용된다 (R-17, R-18)', async ({
	page,
	request
}) => {
	await seedDay(request, 304, [{ english: 'otter', meaning: '수달, 해달' }]);
	await seedDay(request, 305, [{ english: 'nibble', meaning: '조금씩 먹다' }]);

	await page.goto('/days/304');
	await page.getByRole('button', { name: /보기$/ }).click();
	await expect(page.getByRole('button', { name: /보기$/ })).toHaveText('영어만 보기');

	await page.reload();
	await expect(page.getByRole('button', { name: /보기$/ })).toHaveText('영어만 보기');

	await page.goto('/days/305');
	await expect(page.getByRole('button', { name: /보기$/ })).toHaveText('영어만 보기');
	await expect(page.getByRole('listitem').first()).not.toContainText('조금씩 먹다');
});

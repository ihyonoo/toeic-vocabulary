import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('Day 화면은 수업 단어와 내 단어를 머리줄과 함께 이어서 보여준다', async ({ page, request }) => {
	await seedDay(request, 911, [{ english: 'mine911', meaning: '내것' }], 'mine');
	await seedDay(request, 911, [
		{ english: 'class911a', meaning: '수업가' },
		{ english: 'class911b', meaning: '수업나' }
	]);
	await page.goto('/days/911');

	await expect(page.getByRole('heading', { name: /수업 단어/ })).toContainText('2');
	await expect(page.getByRole('heading', { name: /내 단어/ })).toContainText('1');
	const rows = page.getByRole('listitem');
	await expect(rows).toHaveCount(3);
	await expect(rows.nth(0)).toContainText('class911a');
	await expect(rows.nth(1)).toContainText('class911b');
	await expect(rows.nth(2)).toContainText('mine911');
});

test('내 단어가 없으면 머리줄 아래에 아직 없다고 적고, 단어 추가는 내 단어 끝에 붙는다', async ({ page, request }) => {
	await seedDay(request, 912, [{ english: 'class912', meaning: '수업' }]);
	await page.goto('/days/912');
	const mineHeading = page.getByRole('heading', { name: /내 단어/ });
	await expect(mineHeading).toContainText('0');
	await expect(page.getByText('아직 없어요')).toBeVisible();

	await page.getByRole('button', { name: '단어 추가' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 추가' });
	await sheet.getByLabel('영어').fill('added912');
	await sheet.getByLabel('뜻').fill('추가함');
	await sheet.getByRole('button', { name: '추가' }).click();
	await expect(sheet).toBeHidden();

	await expect(mineHeading).toContainText('1');
	await expect(page.getByText('아직 없어요')).toHaveCount(0);
	await expect(page.getByRole('listitem').last()).toContainText('added912');
	await expect(page.getByRole('heading', { name: /수업 단어/ })).toContainText('1');
});

test('내 단어에 이미 있는 단어를 추가하면 내 단어에 있다고 알린다', async ({ page, request }) => {
	await seedDay(request, 913, [{ english: 'mine913', meaning: '내것' }], 'mine');
	await page.goto('/days/913');
	await page.getByRole('button', { name: '단어 추가' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 추가' });
	await sheet.getByLabel('영어').fill('mine913');
	await sheet.getByLabel('뜻').fill('내것');
	await sheet.getByRole('button', { name: '추가' }).click();
	await expect(sheet.getByText('이 Day의 내 단어에 이미 있어요.')).toBeVisible();
});

test('Day 학습에서 묶음을 고르면 그 묶음 단어만 나온다', async ({ page, request }) => {
	await seedDay(request, 921, [{ english: 'class921', meaning: '수업' }]);
	await seedDay(request, 921, [{ english: 'mine921', meaning: '내것' }], 'mine');
	await page.goto('/days/921');
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('radio', { name: '둘 다' })).toBeChecked();
	await page.getByText('내 단어', { exact: true }).last().click();
	await page.getByRole('button', { name: '학습 시작' }).click();

	await expect(page).toHaveURL(/\/study\?scope=day&day=921&order=textbook&repeat=1&group=mine$/);
	await expect(page.getByTestId('progress')).toHaveText('1 / 1');
	await expect(page.getByTestId('card-english')).toHaveText('mine921');

	await page.goto('/study?scope=day&day=921&order=textbook&repeat=1&group=class');
	await expect(page.getByTestId('progress')).toHaveText('1 / 1');
	await expect(page.getByTestId('card-english')).toHaveText('class921');

	await page.goto('/study?scope=day&day=921&order=textbook&repeat=1');
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
});

test('기억한 묶음에 단어가 없는 Day는 둘 다로 열고, 직접 고르면 이유를 보여준다', async ({ page, request }) => {
	await seedDay(request, 922, [{ english: 'mine922', meaning: '내것' }], 'mine');
	await seedDay(request, 923, [{ english: 'class923', meaning: '수업' }]);

	await page.goto('/days/922');
	await page.getByRole('button', { name: '학습하기' }).click();
	await page.getByText('내 단어', { exact: true }).last().click();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/group=mine$/);

	await page.goto('/days/923');
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('radio', { name: '둘 다' })).toBeChecked();
	await expect(page.getByRole('button', { name: '학습 시작' })).toBeEnabled();

	await page.getByText('내 단어', { exact: true }).last().click();
	await expect(page.getByText('이 묶음에는 학습할 단어가 없어요.')).toBeVisible();
	await expect(page.getByRole('button', { name: '학습 시작' })).toBeDisabled();
});

test('통합 학습과 북마크 학습도 묶음을 고를 수 있다', async ({ page, request }) => {
	const seeded = await seedDay(request, 924, [{ english: 'class924', meaning: '수업' }]);
	const mine = await seedDay(request, 924, [{ english: 'mine924', meaning: '내것' }], 'mine');
	for (const id of [seeded.created[0].id, mine.created[0].id]) {
		await request.patch(`/api/words/${id}`, { headers: AUTH, data: { bookmarked: true } });
	}

	await page.goto('/');
	await page.getByRole('button', { name: '통합 학습' }).click();
	await page.getByText('내 단어', { exact: true }).last().click();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/\/study\?scope=all&order=textbook&repeat=1&group=mine$/);
	await expect(page.getByTestId('card')).toBeVisible();

	const all = await (await page.request.get('/study/__data.json?scope=all&order=textbook&repeat=1&group=mine')).text();
	expect(all).toContain('mine924');
	expect(all).not.toContain('class924');
	const marks = await (
		await page.request.get('/study/__data.json?scope=bookmarks&order=textbook&repeat=1&group=class')
	).text();
	expect(marks).toContain('class924');
	expect(marks).not.toContain('mine924');

	expect((await page.request.get('/study?scope=all&order=textbook&repeat=1&group=other')).status()).toBe(200);
	await page.goto('/study?scope=all&order=textbook&repeat=1&group=other');
	await expect(page.getByText('학습 설정이 잘못됐어요')).toBeVisible();
});

test('고른 묶음을 기억해 내 단어가 있는 다른 Day에서도 미리 선택한다', async ({ page, request }) => {
	await seedDay(request, 925, [{ english: 'mine925', meaning: '내것' }], 'mine');
	await seedDay(request, 926, [{ english: 'mine926', meaning: '내것' }], 'mine');
	await page.goto('/days/925');
	await page.getByRole('button', { name: '학습하기' }).click();
	await page.getByText('내 단어', { exact: true }).last().click();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/group=mine$/);

	await page.goto('/days/926');
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('radio', { name: '내 단어' })).toBeChecked();
});

test('예전 형식으로 저장된 학습 설정도 순서·반복은 살리고 묶음은 둘 다로 연다', async ({ page, request }) => {
	await seedDay(request, 927, [{ english: 'old927', meaning: '예전' }]);
	await page.addInitScript(() => {
		localStorage.setItem('vocab.studyPrefs', JSON.stringify({ order: 'random', repeat: 2 }));
	});
	await page.goto('/days/927');
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('radio', { name: '랜덤' })).toBeChecked();
	await expect(page.getByRole('radio', { name: '2회' })).toBeChecked();
	await expect(page.getByRole('radio', { name: '둘 다' })).toBeChecked();
});

test('북마크 화면의 학습 설정에서 묶음을 고르면 그 묶음 북마크만 학습한다', async ({ page, request }) => {
	const cls = await seedDay(request, 928, [{ english: 'class928', meaning: '수업' }]);
	const mine = await seedDay(request, 928, [{ english: 'mine928', meaning: '내것' }], 'mine');
	for (const id of [cls.created[0].id, mine.created[0].id]) {
		await request.patch(`/api/words/${id}`, { headers: AUTH, data: { bookmarked: true } });
	}
	await page.goto('/bookmarks');
	await page.getByRole('button', { name: '학습하기' }).click();
	await page.getByText('내 단어', { exact: true }).last().click();
	await expect(page.getByRole('button', { name: '학습 시작' })).toBeEnabled();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/\/study\?scope=bookmarks&order=textbook&repeat=1&group=mine$/);
	await expect(page.getByTestId('card')).toBeVisible();
});

test('내 단어만 학습해도 Day 학습 기록이 1회 오른다', async ({ page, request }) => {
	await seedDay(request, 929, [{ english: 'class929', meaning: '수업' }]);
	await seedDay(request, 929, [{ english: 'mine929', meaning: '내것' }], 'mine');
	await page.goto('/study?scope=day&day=929&order=textbook&repeat=1&group=mine');
	await expect(page.getByTestId('card-english')).toHaveText('mine929');
	await expect
		.poll(async () => {
			const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
			return days.find((d: { number: number }) => d.number === 929).studyCount;
		})
		.toBe(1);
});

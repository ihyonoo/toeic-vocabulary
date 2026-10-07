import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay, swipeCard } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('북마크 화면은 북마크한 단어를 교재순으로 모으고, 끈 행은 떠날 때까지 남는다 (R-24)', async ({
	page,
	request
}) => {
	const a = await seedDay(request, 601, [{ english: 'blanket', meaning: '안내 책자' }, { english: 'pass601', meaning: '통과' }]);
	const b = await seedDay(request, 602, [{ english: 'dolphin', meaning: '돌고래' }]);
	for (const word of [b.created[0], a.created[0]]) {
		await request.patch(`/api/words/${word.id}`, { headers: AUTH, data: { bookmarked: true } });
	}

	await page.goto('/');
	await page.getByRole('link', { name: '북마크' }).click();
	await expect(page).toHaveURL(/\/bookmarks$/);
	const rows = page.getByRole('listitem');
	const brochure = rows.filter({ hasText: 'blanket' });
	const delay = rows.filter({ hasText: 'dolphin' });
	await expect(brochure).toBeVisible();
	await expect(delay).toBeVisible();
	expect(await rows.allTextContents()).toEqual(
		expect.arrayContaining([expect.stringContaining('blanket'), expect.stringContaining('dolphin')])
	);
	const texts = await rows.allTextContents();
	expect(texts.findIndex((t) => t.includes('blanket'))).toBeLessThan(texts.findIndex((t) => t.includes('dolphin')));
	await expect(page.getByRole('button', { name: '단어 추가' })).toHaveCount(0);

	await delay.getByRole('button', { name: '북마크' }).click();
	await expect(delay).toBeVisible();
	await expect(delay.getByRole('button', { name: '북마크' })).toHaveAttribute('aria-pressed', 'false');
	await page.reload();
	await expect(page.getByRole('listitem').filter({ hasText: 'dolphin' })).toHaveCount(0);
});

test('학습 카드에서 북마크를 켜면 북마크 화면에 나온다 (R-27, R-34)', async ({ page, request }) => {
	await seedDay(request, 603, [{ english: 'wear603', meaning: '걸치다' }]);
	await page.goto('/study?scope=day&day=603&order=textbook&repeat=1');
	const mark = page.getByTestId('card').getByRole('button', { name: '북마크' });

	await mark.click();
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByTestId('card-back')).toBeHidden();
	await page.goto('/bookmarks');
	await expect(page.getByRole('listitem').filter({ hasText: 'wear603' })).toBeVisible();
});

test('카드에서 숨기면 바로 다음 카드로 가고 장수가 줄며, 숨긴 단어는 어떤 학습에도 나오지 않는다 (R-35, R-36, S-4)', async ({
	page,
	request
}) => {
	const seeded = await seedDay(request, 604, [
		{ english: 'hide604', meaning: '숨길 단어' },
		{ english: 'keep604', meaning: '남길 단어' }
	]);
	await request.patch(`/api/words/${seeded.created[0].id}`, { headers: AUTH, data: { bookmarked: true } });
	await request.patch(`/api/words/${seeded.created[1].id}`, { headers: AUTH, data: { bookmarked: true } });

	await page.goto('/study?scope=day&day=604&order=textbook&repeat=1');
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
	await page.getByTestId('card').getByRole('button', { name: '숨기기' }).click();
	await expect(page.getByTestId('card-english')).toHaveText('keep604');
	await expect(page.getByTestId('progress')).toHaveText('1 / 1');

	// Day·북마크 학습은 실제로 끝까지 넘겨 본다
	for (const url of [
		'/study?scope=day&day=604&order=textbook&repeat=1',
		'/study?scope=bookmarks&order=textbook&repeat=1'
	]) {
		await page.goto(url);
		// 카드가 그려지기 전에 반복이 끝나 빈 검사로 통과하지 않게 첫 카드를 기다린다
		await expect(page.getByTestId('progress')).toBeVisible();
		const seen: string[] = [];
		while (await page.getByTestId('card').isVisible()) {
			const progress = await page.getByTestId('progress').textContent();
			seen.push((await page.getByTestId('card-english').textContent())!.trim());
			await swipeCard(page, 'left');
			await expect(page.getByTestId('progress').or(page.getByText('학습을 마쳤어요'))).not.toHaveText(progress!);
		}
		expect(seen, url).toContain('keep604');
		expect(seen, url).not.toContain('hide604');
	}

	// 통합 학습은 E2E 전체 단어가 들어 있어 넘기는 대신 학습 화면이 받는 데이터로 확인한다
	const all = await (await page.request.get('/study/__data.json?scope=all&order=textbook&repeat=1')).text();
	expect(all).toContain('keep604');
	expect(all).not.toContain('hide604');
});

test('모든 단어를 숨긴 Day는 학습을 시작할 수 없고 이유를 보여준다 (R-36)', async ({ page, request }) => {
	const seeded = await seedDay(request, 605, [{ english: 'only605', meaning: '하나뿐' }]);
	await request.patch(`/api/words/${seeded.created[0].id}`, { headers: AUTH, data: { hidden: true } });

	await page.goto('/days/605');
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByText('학습할 단어가 없어요')).toBeVisible();
	await expect(page.getByRole('button', { name: '학습 시작' })).toBeDisabled();
});

test('학습 중 남은 단어를 모두 숨기면 이유와 함께 끝난다 (R-36)', async ({ page, request }) => {
	await seedDay(request, 606, [{ english: 'last606', meaning: '마지막' }]);
	await page.goto('/study?scope=day&day=606&order=textbook&repeat=loop');
	await page.getByTestId('card').getByRole('button', { name: '숨기기' }).click();
	await expect(page.getByText('학습할 단어가 없어요')).toBeVisible();
});

test('통합 학습은 홈에서 바로 설정으로 가고, 끝나면 홈으로 돌아간다 (R-11, R-37, R-39)', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: '통합 학습' }).click();
	await page.getByRole('button', { name: '학습 시작' }).click();
	await expect(page).toHaveURL(/\/study\?scope=all&order=textbook&repeat=1/);
	await expect(page.getByTestId('card')).toBeVisible();
	await page.getByRole('link', { name: '뒤로' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('Day 학습에서 첫 바퀴를 끝내면 학습 기록이 1회 오르고 홈에 날짜가 보인다 (R-12, R-13)', async ({
	page,
	request
}) => {
	await seedDay(request, 607, [{ english: 'one607', meaning: '하나' }, { english: 'two607', meaning: '둘' }]);
	await page.goto('/study?scope=day&day=607&order=textbook&repeat=2');
	await swipeCard(page, 'left');
	await expect(page.getByTestId('card-english')).toHaveText('two607');

	await expect
		.poll(async () => {
			const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
			return days.find((d: { number: number }) => d.number === 607).studyCount;
		})
		.toBe(1);

	// 같은 세션에서 두 번째 바퀴를 끝내도 다시 기록하지 않는다
	await swipeCard(page, 'left');
	await swipeCard(page, 'left');
	await swipeCard(page, 'left');
	await expect(page.getByText('학습을 마쳤어요')).toBeVisible();
	const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
	expect(days.find((d: { number: number }) => d.number === 607).studyCount).toBe(1);

	await page.goto('/');
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).slice(5);
	await expect(page.getByRole('link', { name: /^Day 607/ })).toContainText(`${today} · 1회`);
});

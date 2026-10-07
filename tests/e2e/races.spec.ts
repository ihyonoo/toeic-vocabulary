import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay, swipeRow } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('숨기기를 빠르게 두 번 눌러도 처음 카드만 숨긴다', async ({ page, request }) => {
	await seedDay(request, 801, [
		{ english: 'first801', meaning: '첫째' },
		{ english: 'second801', meaning: '둘째' },
		{ english: 'third801', meaning: '셋째' }
	]);
	await page.goto('/study?scope=day&day=801&order=textbook&repeat=1');
	await expect(page.getByTestId('card-english')).toHaveText('first801');

	await page.getByTestId('card').getByRole('button', { name: '숨기기' }).dblclick();
	await expect(page.getByTestId('card-english')).toHaveText('second801');
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');

	await page.goto('/study?scope=day&day=801&order=textbook&repeat=1');
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
	await expect(page.getByTestId('card-english')).toHaveText('second801');
});

test('저장 중에 수정 시트를 닫아도 저장 결과가 목록에 반영되고 실패 안내가 뜨지 않는다', async ({
	page,
	request
}) => {
	await seedDay(request, 802, [{ english: 'slow802', meaning: '느림' }]);
	await page.route('**/api/words/*', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 600));
		await route.continue();
	});
	await page.goto('/days/802');
	const row = page.getByRole('listitem').first();
	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 수정' });
	await sheet.getByLabel('뜻').fill('느림, 천천히');
	await sheet.getByRole('button', { name: '저장' }).click();
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();

	await expect(row).toContainText('느림, 천천히');
	await expect(page.getByText('수정하지 못했어요')).toHaveCount(0);
});

async function serverWord(request: import('@playwright/test').APIRequestContext, id: number) {
	// 단어 하나를 읽는 API가 없어, 값이 바뀌지 않는 빈 품사 수정으로 응답의 현재 값을 받는다
	const res = await request.patch(`/api/words/${id}`, { headers: AUTH, data: { pos: '' } });
	return (await res.json()).word as { bookmarked: boolean; hidden: boolean; meaning: string };
}

for (const scenario of [
	{ day: 805, name: '첫 요청만 늦게 실패', fail: [1], delays: [300, 0] },
	{ day: 806, name: '두 요청이 보낸 순서대로 늦게 실패', fail: [1, 2], delays: [300, 600] },
	{ day: 807, name: '첫 요청이 늦게 도착', fail: [], delays: [300, 0] }
]) {
	test(`카드 북마크를 연타할 때 ${scenario.name}해도 화면과 서버 값이 같다`, async ({ page, request }) => {
		const seeded = await seedDay(request, scenario.day, [{ english: `mark${scenario.day}`, meaning: '표시' }]);
		let calls = 0;
		await page.route('**/api/words/*', async (route) => {
			calls += 1;
			const n = calls;
			await new Promise((resolve) => setTimeout(resolve, scenario.delays[n - 1] ?? 0));
			if (scenario.fail.includes(n)) await route.abort();
			else await route.continue();
		});
		await page.goto(`/study?scope=day&day=${scenario.day}&order=textbook&repeat=1`);
		const mark = page.getByTestId('card').getByRole('button', { name: '북마크' });

		await mark.click(); // 켜기
		await mark.click(); // 끄기
		await expect.poll(() => calls).toBe(2);
		await page.waitForTimeout(800);

		const server = await serverWord(request, seeded.created[0].id);
		await expect(mark).toHaveAttribute('aria-pressed', String(server.bookmarked));
	});
}

test('수정 저장 중에 시트를 닫으면 이미 있는 단어 오류를 토스트로 알린다', async ({ page, request }) => {
	await seedDay(request, 830, [
		{ english: 'dup830', meaning: '중복' },
		{ english: 'edit830', meaning: '고칠 단어' }
	]);
	await page.route('**/api/words/*', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 600));
		await route.continue();
	});
	await page.goto('/days/830');
	const row = page.getByRole('listitem').nth(1);
	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 수정' });
	await sheet.getByLabel('영어').fill('dup830');
	await sheet.getByLabel('뜻').fill('중복');
	await sheet.getByRole('button', { name: '저장' }).click();
	await page.keyboard.press('Escape');

	await expect(page.getByRole('status')).toContainText('이미 있는 단어예요');
	await expect(row).toContainText('edit830');
});

test('수정 저장 중에 같은 행의 북마크를 켜도 수정 응답이 북마크를 덮어쓰지 않는다', async ({ page, request }) => {
	await seedDay(request, 831, [{ english: 'both831', meaning: '둘 다' }]);
	// 서버는 수정을 먼저 처리하고, 응답만 늦게 도착시킨다
	await page.route('**/api/words/*', async (route) => {
		const response = await route.fetch();
		if (route.request().postDataJSON()?.meaning) await new Promise((resolve) => setTimeout(resolve, 600));
		await route.fulfill({ response });
	});
	await page.goto('/days/831');
	const row = page.getByRole('listitem').first();
	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 수정' });
	await sheet.getByLabel('뜻').fill('둘 다, 양쪽');
	await sheet.getByRole('button', { name: '저장' }).click();
	await page.keyboard.press('Escape');
	await row.getByRole('button', { name: '북마크' }).click();

	await expect(row).toContainText('둘 다, 양쪽');
	await expect(row.getByRole('button', { name: '북마크' })).toHaveAttribute('aria-pressed', 'true');
});

test('화면 꺼짐 방지를 받기 전에 학습 화면을 떠나도 잠금을 해제한다', async ({ page, request }) => {
	await page.addInitScript(() => {
		const w = window as unknown as { wakeReleased: number; grantWake: () => void };
		w.wakeReleased = 0;
		Object.defineProperty(navigator, 'wakeLock', {
			value: {
				// 테스트가 grantWake를 부를 때까지 잠금을 주지 않는다
				request: () =>
					new Promise((resolve) => {
						w.grantWake = () => resolve({ release: async () => void (w.wakeReleased += 1) });
					})
			}
		});
	});
	await seedDay(request, 804, [{ english: 'quick804', meaning: '빠름' }]);
	await page.goto('/study?scope=day&day=804&order=textbook&repeat=1');
	await expect(page.getByTestId('card')).toBeVisible();
	await page.getByRole('link', { name: '뒤로' }).click();
	await expect(page).toHaveURL(/\/days\/804$/);
	await page.evaluate(() => (window as unknown as { grantWake: () => void }).grantWake());

	await expect
		.poll(() => page.evaluate(() => (window as unknown as { wakeReleased: number }).wakeReleased))
		.toBe(1);
});

test('수정 시트를 닫았다 다시 열어 입력하는 중에 이전 저장 응답이 와도 입력이 덮이지 않는다', async ({
	page,
	request
}) => {
	await seedDay(request, 832, [{ english: 'keep832', meaning: '유지' }]);
	await page.route('**/api/words/*', async (route) => {
		const response = await route.fetch();
		await new Promise((resolve) => setTimeout(resolve, 800));
		await route.fulfill({ response });
	});
	await page.goto('/days/832');
	const row = page.getByRole('listitem').first();
	const sheet = page.getByRole('dialog', { name: '단어 수정' });

	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	await sheet.getByLabel('뜻').fill('유지, 보존');
	await sheet.getByRole('button', { name: '저장' }).click();
	await page.keyboard.press('Escape');

	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	await sheet.getByLabel('뜻').fill('새로 치는 중');
	await page.waitForTimeout(1200);

	await expect(sheet.getByLabel('뜻')).toHaveValue('새로 치는 중');
	await expect(row).toContainText('유지, 보존');
});

test('단어 추가 시트를 닫았다 다시 열면 이전 추가 응답이 새 시트를 닫지 않는다', async ({ page, request }) => {
	await seedDay(request, 833, [{ english: 'base833', meaning: '기준' }]);
	await page.route('**/api/days/833/words', async (route) => {
		const response = await route.fetch();
		await new Promise((resolve) => setTimeout(resolve, 800));
		await route.fulfill({ response });
	});
	await page.goto('/days/833');
	const sheet = page.getByRole('dialog', { name: '단어 추가' });

	await page.getByRole('button', { name: '단어 추가' }).click();
	await sheet.getByLabel('영어').fill('first833');
	await sheet.getByLabel('뜻').fill('첫째');
	await sheet.getByRole('button', { name: '추가' }).click();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: '단어 추가' }).click();
	await sheet.getByLabel('영어').fill('second833');
	await page.waitForTimeout(1200);

	await expect(sheet).toBeVisible();
	await expect(sheet.getByLabel('영어')).toHaveValue('second833');
	await expect(page.getByRole('listitem').last()).toContainText('first833');
});

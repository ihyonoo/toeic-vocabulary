import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay, swipeCard, swipeRow, synthetic } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

async function studyCount(request: import('@playwright/test').APIRequestContext, day: number) {
	const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
	return days.find((d: { number: number }) => d.number === day).studyCount;
}

test('Day 목록에서 단어를 누르면 그 단어 카드부터 보고, 끝에서 다 봤다고 알리며 학습 기록은 늘지 않는다', async ({
	page,
	request
}) => {
	await seedDay(request, 931, [
		{ english: 'one931', meaning: '하나' },
		{ english: 'two931', meaning: '둘' }
	]);
	await seedDay(request, 931, [{ english: 'mine931', meaning: '내것' }], 'mine');
	await page.goto('/days/931');

	await page.getByRole('listitem').nth(1).getByText('two931').click();
	await expect(page).toHaveURL(/\/study\?scope=day&day=931&mode=browse&start=\d+$/);
	await expect(page.getByTestId('card-english')).toHaveText('two931');
	await expect(page.getByTestId('progress')).toHaveText('2 / 3');

	await swipeCard(page, 'right');
	await expect(page.getByTestId('card-english')).toHaveText('one931');
	await swipeCard(page, 'left');
	await swipeCard(page, 'left');
	await expect(page.getByTestId('card-english')).toHaveText('mine931');
	await swipeCard(page, 'left');
	await expect(page.getByText('다 봤어요')).toBeVisible();
	await expect(page.getByRole('button', { name: '다시 학습' })).toHaveCount(0);
	expect(await studyCount(request, 931)).toBe(0);

	await page.getByRole('link', { name: '목록으로' }).click();
	await expect(page).toHaveURL(/\/days\/931$/);
});

test('가린 칸을 누르면 카드로 가지 않고 칸만 드러난다', async ({ page, request }) => {
	await seedDay(request, 932, [{ english: 'mask932', meaning: '가림' }]);
	await page.goto('/days/932');
	await page.getByRole('button', { name: /보기$/ }).click(); // 영어만
	const row = page.getByRole('listitem').first();
	await row.getByRole('button', { name: '터치하세요' }).click();
	await expect(row).toContainText('가림');
	await expect(page).toHaveURL(/\/days\/932$/);
});

test('카드 보기에는 숨긴 단어도 나오고, 숨기기는 카드를 빼지 않고 숨김만 켜고 끈다', async ({ page, request }) => {
	const seeded = await seedDay(request, 933, [
		{ english: 'seen933', meaning: '보임' },
		{ english: 'hidden933', meaning: '숨김' }
	]);
	await request.patch(`/api/words/${seeded.created[1].id}`, { headers: AUTH, data: { hidden: true } });
	await page.goto('/days/933');

	await page.getByRole('listitem').first().getByText('seen933').click();
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
	await swipeCard(page, 'left');
	await expect(page.getByTestId('card-english')).toHaveText('hidden933');
	await expect(page.getByTestId('card')).toContainText('숨긴 단어');

	await page.getByTestId('card').getByRole('button', { name: '숨김 해제' }).click();
	await expect(page.getByTestId('card')).not.toContainText('숨긴 단어');
	await expect(page.getByTestId('card-english')).toHaveText('hidden933');
	await expect(page.getByTestId('progress')).toHaveText('2 / 2');

	await page.getByTestId('card').getByRole('button', { name: '숨기기' }).click();
	await expect(page.getByTestId('card')).toContainText('숨긴 단어');
	await expect(page.getByTestId('progress')).toHaveText('2 / 2');
});

test('뒤로를 누르면 목록으로 돌아간다', async ({ page, request }) => {
	await seedDay(request, 934, [{ english: 'back934', meaning: '뒤로' }]);
	await page.goto('/days/934');
	await page.getByRole('listitem').first().getByText('back934').click();
	await expect(page.getByTestId('card-english')).toHaveText('back934');
	await page.getByRole('link', { name: '뒤로' }).click();
	await expect(page).toHaveURL(/\/days\/934$/);
});

test('북마크 목록에서도 단어를 누르면 카드로 본다', async ({ page, request }) => {
	const seeded = await seedDay(request, 935, [{ english: 'mark935', meaning: '표시' }]);
	await request.patch(`/api/words/${seeded.created[0].id}`, { headers: AUTH, data: { bookmarked: true } });
	await page.goto('/bookmarks');
	await page.getByRole('listitem').filter({ hasText: 'mark935' }).getByText('mark935').click();
	await expect(page).toHaveURL(/\/study\?scope=bookmarks&mode=browse&start=\d+$/);
	await expect(page.getByTestId('card-english')).toHaveText('mark935');
});

test('긴 목록 아래쪽 단어를 열었다가 뒤로 오면 스크롤 위치가 그대로다', async ({ page, request }) => {
	await seedDay(request, 936, synthetic('long936-', 40));
	await page.goto('/days/936');
	const target = page.getByRole('listitem').nth(30);
	await target.scrollIntoViewIfNeeded();
	const before = await page.evaluate(() => window.scrollY);
	expect(before).toBeGreaterThan(500);

	await target.getByText('long936-031', { exact: true }).click();
	await expect(page.getByTestId('card-english')).toHaveText('long936-031');
	await page.getByRole('link', { name: '뒤로' }).click();
	await expect(page).toHaveURL(/\/days\/936$/);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 50);
});

test('북마크를 끈 채 남아 있는 행을 눌러도 그 단어 카드가 열린다', async ({ page, request }) => {
	const seeded = await seedDay(request, 937, [
		{ english: 'keep937', meaning: '남김' },
		{ english: 'off937', meaning: '끔' }
	]);
	for (const word of seeded.created) {
		await request.patch(`/api/words/${word.id}`, { headers: AUTH, data: { bookmarked: true } });
	}
	await page.goto('/bookmarks');
	const row = page.getByRole('listitem').filter({ hasText: 'off937' });
	await row.getByRole('button', { name: '북마크' }).click();
	await expect(row.getByRole('button', { name: '북마크' })).toHaveAttribute('aria-pressed', 'false');
	await row.getByText('off937', { exact: true }).click();
	await expect(page.getByTestId('card-english')).toHaveText('off937');
});

test('행의 북마크 버튼은 카드로 가지 않고, 열린 밀기 메뉴는 누르면 닫히기만 한다', async ({ page, request }) => {
	await seedDay(request, 938, [
		{ english: 'first938', meaning: '첫째' },
		{ english: 'second938', meaning: '둘째' }
	]);
	await page.goto('/days/938');
	const first = page.getByRole('listitem').first();
	await first.getByRole('button', { name: '북마크' }).click();
	await expect(page).toHaveURL(/\/days\/938$/);

	await swipeRow(page, first);
	await expect(first.getByRole('button', { name: '숨기기' })).toBeVisible();
	await page.getByRole('listitem').nth(1).getByText('second938', { exact: true }).click();
	await expect(first.getByRole('button', { name: '숨기기' })).toHaveCount(0);
	await expect(page).toHaveURL(/\/days\/938$/);

	// 같은 행의 보이는 부분을 눌러도 메뉴만 닫힌다
	await swipeRow(page, first);
	await expect(first.getByRole('button', { name: '숨기기' })).toBeVisible();
	await first.click({ position: { x: 60, y: 20 } });
	await expect(first.getByRole('button', { name: '숨기기' })).toHaveCount(0);
	await expect(page).toHaveURL(/\/days\/938$/);
});

test('목록을 거치지 않고 카드 보기로 들어오면 뒤로는 그 목록 주소로 간다', async ({ page, request }) => {
	await seedDay(request, 939, [{ english: 'direct939', meaning: '바로' }]);
	await page.goto('/study?scope=day&day=939&mode=browse');
	await expect(page.getByTestId('card-english')).toHaveText('direct939');
	await page.getByRole('link', { name: '뒤로' }).click();
	await expect(page).toHaveURL(/\/days\/939$/);
});

test('카드 보기에서 뒤로를 연달아 눌러도 목록에서 멈춘다', async ({ page, request }) => {
	await seedDay(request, 940, [{ english: 'twice940', meaning: '두 번' }]);
	await page.goto('/');
	await page.goto('/days/940');
	await page.getByRole('listitem').first().getByText('twice940', { exact: true }).click();
	await expect(page.getByTestId('card-english')).toHaveText('twice940');
	await page.getByRole('link', { name: '뒤로' }).dblclick();
	await expect(page).toHaveURL(/\/days\/940$/);
	await page.waitForTimeout(300);
	await expect(page).toHaveURL(/\/days\/940$/);
});

test('카드 보기는 순서·반복·묶음 설정을 쓰지 않고 목록 순서 그대로다', async ({ page, request }) => {
	await seedDay(request, 941, [{ english: 'b941', meaning: '비' }, { english: 'a941', meaning: '에이' }]);
	await seedDay(request, 941, [{ english: 'c941', meaning: '씨' }], 'mine');
	await page.goto('/study?scope=day&day=941&mode=browse&order=alpha&repeat=3&group=mine');
	await expect(page.getByTestId('progress')).toHaveText('1 / 3');
	await expect(page.getByTestId('card-english')).toHaveText('b941');
	await expect(page.getByTestId('round')).toHaveCount(0);
});

test('카드 보기 주소의 mode·start가 잘못되면 이유를 보여준다', async ({ page }) => {
	await page.goto('/study?scope=day&day=941&mode=peek');
	await expect(page.getByText('학습 설정이 잘못됐어요')).toBeVisible();
	await page.goto('/study?scope=day&day=941&mode=browse&start=abc');
	await expect(page.getByText('학습 설정이 잘못됐어요')).toBeVisible();
});

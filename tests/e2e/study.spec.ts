import { expect, test, type Page } from '@playwright/test';
import { login, seedDay, swipeCard, synthetic } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

async function tapCardMargin(page: Page) {
	await page.getByTestId('card').click({ position: { x: 24, y: 24 } });
}

const english = (page: Page) => page.getByTestId('card-english');

test('홈에서 탭 3번으로 Day 학습의 첫 카드가 나온다 (S-2, R-28)', async ({ page, request }) => {
	await seedDay(request, 401, [
		{ english: 'swim', meaning: '수영하다' },
		{ english: 'arrive', meaning: '도착하다' }
	]);
	await page.goto('/');

	await page.getByRole('link', { name: /^Day 401/ }).click();
	await page.getByRole('button', { name: '학습하기' }).click();
	await expect(page.getByRole('radio', { name: '교재순' })).toBeChecked();
	await expect(page.getByRole('radio', { name: '1회' })).toBeChecked();
	await page.getByRole('button', { name: '학습 시작' }).click();

	await expect(page).toHaveURL(/\/study\?scope=day&day=401&order=textbook&repeat=1/);
	await expect(english(page)).toHaveText('swim');
	await expect(page.getByTestId('progress')).toHaveText('1 / 2');
});

test('왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전 카드이고 첫 카드에서는 움직이지 않는다 (R-31)', async ({
	page,
	request
}) => {
	await seedDay(request, 402, [
		{ english: 'hike', meaning: '도보 여행하다' },
		{ english: 'hum', meaning: '콧노래를 부르다, 웅웅거리다' },
		{ english: 'giggle', meaning: '킥킥 웃다, 낄낄대다' }
	]);
	await page.goto('/study?scope=day&day=402&order=textbook&repeat=1');

	await expect(english(page)).toHaveText('hike');
	await swipeCard(page, 'right');
	await expect(english(page)).toHaveText('hike');
	await swipeCard(page, 'left');
	await expect(english(page)).toHaveText('hum');
	await expect(page.getByTestId('progress')).toHaveText('2 / 3');
	await swipeCard(page, 'right');
	await expect(english(page)).toHaveText('hike');
});

test('카드의 칸 바깥을 누르면 뒷면 예문이 나오고 다시 누르면 앞면이다 (R-33)', async ({ page, request }) => {
	await seedDay(request, 403, [
		{
			english: 'roar',
			meaning: '으르렁거리다',
			pos: '동사',
			example: 'The lion roared loudly.',
			exampleKo: '사자가 크게 으르렁거렸다.'
		},
		{ english: 'castle', meaning: '성, 성채' }
	]);
	await page.goto('/study?scope=day&day=403&order=textbook&repeat=1');

	await expect(page.getByTestId('card')).toContainText('동사');
	await tapCardMargin(page);
	await expect(page.getByTestId('card-back')).toContainText('The lion roared loudly.');
	await expect(page.getByTestId('card-back')).toContainText('사자가 크게 으르렁거렸다.');
	await tapCardMargin(page);
	await expect(page.getByTestId('card-back')).toBeHidden();

	await swipeCard(page, 'left');
	await tapCardMargin(page);
	await expect(page.getByTestId('card-back')).toContainText('예문 없음');
});

test('학습 화면에서도 보기 모드를 바꾸고, 가린 칸은 누를 때마다 드러났다 가려지며, 다음 카드는 다시 가려진다 (R-17, R-32, R-33)', async ({
	page,
	request
}) => {
	await seedDay(request, 404, [
		{ english: 'forest', meaning: '숲', pos: '명사' },
		{ english: 'apple', meaning: '사과', pos: '명사' }
	]);
	await page.goto('/study?scope=day&day=404&order=textbook&repeat=1');
	const card = page.getByTestId('card');

	await page.getByRole('button', { name: /보기$/ }).click();
	await expect(page.getByRole('button', { name: /보기$/ })).toHaveText('영어만 보기');
	await expect(card).not.toContainText('숲');
	await expect(card).not.toContainText('명사');

	await card.getByRole('button', { name: '터치하세요' }).click();
	await expect(card).toContainText('숲');
	await expect(page.getByTestId('card-back')).toBeHidden();
	await card.getByRole('button', { name: /숲/ }).click();
	await expect(card).not.toContainText('숲');

	await card.getByRole('button', { name: '터치하세요' }).click();
	await swipeCard(page, 'left');
	await expect(english(page)).toHaveText('apple');
	await expect(card).not.toContainText('사과');
});

test('반복 1회면 바퀴 표시가 없고, 2회면 바퀴를 보여준다 (R-31)', async ({ page, request }) => {
	await seedDay(request, 405, [
		{ english: 'sweater', meaning: '스웨터' },
		{ english: 'pretend', meaning: '~인 척하다' }
	]);
	await page.goto('/study?scope=day&day=405&order=textbook&repeat=1');
	await expect(page.getByTestId('round')).toHaveCount(0);

	await page.goto('/study?scope=day&day=405&order=textbook&repeat=2');
	await expect(page.getByTestId('round')).toHaveText('1 / 2회');
	await swipeCard(page, 'left');
	await swipeCard(page, 'left');
	await expect(page.getByTestId('round')).toHaveText('2 / 2회');

	await page.goto('/study?scope=day&day=405&order=textbook&repeat=loop');
	await expect(page.getByTestId('round')).toHaveText('1회차');
});

test('마지막 카드에서 한 번 더 밀면 완료 화면이고, 목록으로 누르면 그 Day로 돌아간다 (R-37)', async ({
	page,
	request
}) => {
	await seedDay(request, 406, [
		{ english: 'umbrella', meaning: '우산' },
		{ english: 'praise', meaning: '칭찬하다, 찬양하다' }
	]);
	await page.goto('/study?scope=day&day=406&order=textbook&repeat=1');

	await swipeCard(page, 'left');
	await expect(english(page)).toHaveText('praise');
	await swipeCard(page, 'left');
	await expect(page.getByText('학습을 마쳤어요')).toBeVisible();
	await page.getByRole('link', { name: '목록으로' }).click();
	await expect(page).toHaveURL(/\/days\/406$/);
});

test('잘못된 학습 주소는 이유를 보여준다', async ({ page }) => {
	await page.goto('/study?scope=day&day=999&order=textbook&repeat=1');
	await expect(page.getByText('Day를 찾을 수 없어요')).toBeVisible();

	await page.goto('/study?scope=day&day=1&order=sideways&repeat=1');
	await expect(page.getByText('학습 설정이 잘못됐어요')).toBeVisible();
});

for (const order of ['textbook', 'random'] as const) {
	test(`99단어 Day를 ${order}로 끝까지 넘기면 99장이 빠짐없이 한 번씩 나온다 (S-3)`, async ({
		page,
		request
	}) => {
		const day = order === 'textbook' ? 407 : 408;
		await seedDay(request, day, synthetic(`s${day}-`, 99));
		await page.goto(`/study?scope=day&day=${day}&order=${order}&repeat=1`);

		const seen: string[] = [];
		for (let i = 1; i <= 99; i++) {
			await expect(page.getByTestId('progress')).toHaveText(`${i} / 99`);
			seen.push((await english(page).textContent())!.trim());
			await swipeCard(page, 'left');
		}
		await expect(page.getByText('학습을 마쳤어요')).toBeVisible();
		expect(seen).toHaveLength(99);
		expect(new Set(seen).size).toBe(99);
	});
}

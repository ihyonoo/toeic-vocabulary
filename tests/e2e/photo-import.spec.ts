import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { FAKE_OPENAI } from '../../playwright.config';
import { AUTH, login, seedDay } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

// 1×1 PNG. 앱이 JPEG로 다시 줄여 보낸다
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);
const photo = (n: number) => ({ name: `sheet${n}.png`, mimeType: 'image/png', buffer: PNG });

function word(english: string, meaning: string, extra: Record<string, unknown> = {}) {
	return {
		english,
		paperEnglish: null,
		meaning,
		meaningFilled: false,
		pos: '명사',
		example: `The ${english} is here.`,
		exampleKo: `${meaning}이 여기 있다.`,
		...extra
	};
}

async function scenario(request: APIRequestContext, next: Record<string, unknown>) {
	const res = await request.post(`${FAKE_OPENAI}/__scenario`, { data: next });
	expect(res.status()).toBe(204);
}

// 라디오는 라벨이 덮고 있어 라벨을 누른다
async function pickSection(page: Page, name: '수업 단어' | '내 단어') {
	await page.getByRole('radiogroup', { name: '묶음' }).getByText(name, { exact: true }).click();
}

async function upload(page: Page, opts: { day?: number; section?: '수업 단어' | '내 단어'; photos?: number }) {
	await page.goto('/imports/new');
	if (opts.section) await pickSection(page, opts.section);
	if (opts.day !== undefined) await page.getByLabel('Day 번호').fill(String(opts.day));
	await page
		.getByLabel('사진 더하기')
		.setInputFiles(Array.from({ length: opts.photos ?? 1 }, (_, i) => photo(i + 1)));
	await page.getByRole('button', { name: '올리기' }).click();
	await expect(page).toHaveURL(/\/imports\/\d+$/);
}

test('홈 Day 목록 끝에서 시작하고, 수업 단어 기본 번호는 마지막 + 1이다 (R-45, R-47)', async ({ page, request }) => {
	await seedDay(request, 990, [{ english: 'last990', meaning: '마지막' }]);
	await page.goto('/');
	const link = page.getByRole('link', { name: '사진으로 등록' });
	await expect(page.locator('main li').last()).toContainText('Day 990');
	await link.click();
	await expect(page).toHaveURL('/imports/new');

	const day = page.getByLabel('Day 번호');
	await expect(day).toHaveValue('991');
	await page.getByLabel('사진 더하기').setInputFiles([photo(1)]);
	await expect(page.getByRole('button', { name: '올리기' })).toBeEnabled();

	await pickSection(page, '내 단어');
	await expect(day).toHaveValue('');
	await expect(page.getByRole('button', { name: '올리기' })).toBeDisabled();
	await pickSection(page, '수업 단어');
	await expect(day).toHaveValue('991');
});

test('사진은 5장까지 쌓이고 하나씩 뺄 수 있다 (R-46)', async ({ page }) => {
	await page.goto('/imports/new');
	const input = page.getByLabel('사진 더하기');
	await input.setInputFiles([photo(1), photo(2), photo(3)]);
	await input.setInputFiles([photo(4), photo(5), photo(6)]);
	const thumbs = page.getByRole('listitem');
	await expect(thumbs).toHaveCount(5);
	await expect(page.getByText('사진은 5장까지 올릴 수 있어요.')).toBeVisible();

	await page.getByRole('button', { name: '사진 2 빼기' }).click();
	await expect(thumbs).toHaveCount(4);
	await expect(thumbs.nth(1)).toContainText('2');
});

test('수업 단어: 처리 중 → 미리보기 → 고치고 빼고 등록 → 결과 (R-52~R-65)', async ({ page, request }) => {
	// 가짜 서버는 사진마다 같은 두 단어를 돌려준다 → apple, river, apple, river
	await scenario(request, {
		delayMs: 1500,
		words: [word('apple', '사과', { paperEnglish: 'aple' }), word('river', '강', { meaningFilled: true })]
	});
	await upload(page, { day: 951, photos: 2 });
	await expect(page.getByText('AI가 단어를 읽고 있어요')).toBeVisible();

	// 다시 열지 않아도 미리보기로 바뀐다
	await expect(page.getByTestId('item-count')).toHaveText('4단어', { timeout: 10_000 });
	const rows = page.getByRole('listitem');
	await expect(rows.nth(0)).toContainText('종이: aple');
	await expect(rows.nth(1)).toContainText('AI가 채움');

	// 사진마다 따로, JPEG로 줄여 보낸다
	const sent: { body: { input: { content: { type: string; image_url: string }[] }[] } }[] = await (
		await request.get(`${FAKE_OPENAI}/__requests`)
	).json();
	expect(sent).toHaveLength(2);
	for (const { body } of sent) {
		expect(body.input[0].content).toHaveLength(1);
		expect(body.input[0].content[0].image_url).toMatch(/^data:image\/jpeg;base64,/);
	}

	await rows.nth(1).click();
	const sheet = page.getByRole('dialog', { name: '단어 고치기' });
	await sheet.getByLabel('뜻').fill('강, 하천');
	await sheet.getByLabel('예문', { exact: true }).fill('The river is wide.');
	await sheet.getByRole('button', { name: '저장' }).click();
	await expect(sheet).toBeHidden();
	await expect(rows.nth(1)).toContainText('강, 하천');

	// 빼기의 저장이 끝난 뒤 다시 연다
	const saved = page.waitForResponse(
		(r) => r.request().method() === 'PUT' && r.request().postDataJSON().items.length === 3
	);
	await rows.nth(3).click();
	await page.getByRole('dialog', { name: '단어 고치기' }).getByRole('button', { name: '이 단어 빼기' }).click();
	await expect(page.getByTestId('item-count')).toHaveText('3단어');
	expect((await saved).ok()).toBe(true);

	// 고친 내용은 서버에 저장된다 (R-67)
	await page.reload();
	await expect(page.getByTestId('item-count')).toHaveText('3단어');
	await expect(rows.nth(1)).toContainText('강, 하천');
	await expect(rows.nth(1)).toContainText('AI가 채움');

	await page.getByRole('button', { name: '3단어 등록' }).click();
	await expect(page.getByText('등록했어요')).toBeVisible();
	await expect(page.getByTestId('result-created')).toHaveText('2');
	await expect(page.getByTestId('result-skipped')).toHaveText('1');
	await expect(page.getByTestId('result-linked')).toHaveText('0');
	await expect(page.getByTestId('result-moved')).toHaveText('0');

	await page.getByRole('link', { name: 'Day 951로' }).click();
	await expect(page).toHaveURL('/days/951');
	await expect(page.getByRole('heading', { name: /수업 단어/ })).toContainText('2');
	const day = await (await request.get('/api/days/951', { headers: AUTH })).json();
	expect(day.words.find((w: { english: string }) => w.english === 'river')).toMatchObject({
		meaning: '강, 하천',
		example: 'The river is wide.'
	});

	// 등록한 초안은 홈에서 사라진다
	await page.goto('/');
	await expect(page.getByText('Day 951 · 수업 단어')).toHaveCount(0);
});

test('내 단어: 번호를 넣어야 올리고, 등록하면 내 단어 묶음에 들어간다', async ({ page, request }) => {
	await scenario(request, { words: [word('lamp952', '등')] });
	await page.goto('/imports/new');
	await pickSection(page, '내 단어');
	await page.getByLabel('사진 더하기').setInputFiles([photo(1)]);
	await expect(page.getByRole('button', { name: '올리기' })).toBeDisabled();
	await page.getByLabel('Day 번호').fill('952');
	await page.getByRole('button', { name: '올리기' }).click();

	await expect(page.getByRole('button', { name: '1단어 등록' })).toBeVisible({ timeout: 10_000 });
	await expect(page.getByRole('radio', { name: '내 단어' })).toBeChecked();
	await page.getByRole('button', { name: '1단어 등록' }).click();
	await page.getByRole('link', { name: 'Day 952로' }).click();
	await expect(page.getByRole('heading', { name: /내 단어/ })).toContainText('1');
});

test('미리보기에서 Day 번호와 묶음을 바꿔 등록한다 (R-63)', async ({ page, request }) => {
	await scenario(request, { words: [word('moved955', '옮김')] });
	await upload(page, { day: 954 });
	await expect(page.getByRole('button', { name: '1단어 등록' })).toBeVisible({ timeout: 10_000 });
	await page.getByLabel('Day 번호').fill('955');
	await pickSection(page, '내 단어');
	await expect(page.getByLabel('Day 번호')).toHaveValue('955');
	await page.getByRole('button', { name: '1단어 등록' }).click();
	await page.getByRole('link', { name: 'Day 955로' }).click();
	await expect(page.getByRole('heading', { name: /내 단어/ })).toContainText('1');
	expect((await request.get('/api/days/954', { headers: AUTH })).status()).toBe(404);
});

test('뜻이 빈 행이 있으면 등록하지 않는다 (R-64)', async ({ page, request }) => {
	await scenario(request, { words: [word('ok956', '좋음'), word('blank956', '')] });
	await upload(page, { day: 956 });
	await expect(page.getByTestId('item-count')).toHaveText('2단어', { timeout: 10_000 });
	await expect(page.getByRole('listitem').nth(1)).toContainText('비어 있음');
	await page.getByRole('button', { name: '2단어 등록' }).click();
	await expect(page.getByText('영어와 뜻이 빈 단어가 있어요.')).toBeVisible();
	await expect(page.getByText('등록했어요')).toHaveCount(0);
	expect((await request.get('/api/days/956', { headers: AUTH })).status()).toBe(404);
});

test('실패: 홈 줄에 실패가 보이고, 초안 화면에서 이유를 보고 버린다 (R-56, R-57, R-66)', async ({ page, request }) => {
	await scenario(request, { kind: 'error', status: 401 });
	await upload(page, { day: 957 });
	await expect(page.getByText('처리하지 못했어요')).toBeVisible({ timeout: 10_000 });
	await expect(page.getByText('OpenAI API 키가 잘못됐어요.')).toBeVisible();

	await page.goto('/');
	const row = page.getByRole('link', { name: /Day 957 · 수업 단어/ });
	await expect(row).toContainText('실패');
	await row.click();
	await page.getByRole('button', { name: '버리기' }).click();
	await page.getByRole('dialog', { name: '초안 버리기' }).getByRole('button', { name: '버리기' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: /Day 957/ })).toHaveCount(0);
});

test('처리 중인 초안도 버릴 수 있다 (R-66)', async ({ page, request }) => {
	await scenario(request, { words: [word('slow958', '느림')], delayMs: 30_000 });
	await upload(page, { day: 958 });
	await expect(page.getByText('AI가 단어를 읽고 있어요')).toBeVisible();

	await page.goto('/');
	await expect(page.getByRole('link', { name: /Day 958 · 수업 단어/ })).toContainText('처리 중');
	await page.getByRole('link', { name: /Day 958/ }).click();
	await page.getByRole('button', { name: '버리기' }).click();
	await page.getByRole('dialog', { name: '초안 버리기' }).getByRole('button', { name: '버리기' }).click();
	await expect(page).toHaveURL('/');
	await expect(page.getByRole('link', { name: /Day 958/ })).toHaveCount(0);
});

test('로그인하지 않은 사진 등록 API는 401이다', async ({ request }) => {
	expect((await request.post('/api/imports', { data: {} })).status()).toBe(401);
	expect((await request.get('/api/imports/1')).status()).toBe(401);
});

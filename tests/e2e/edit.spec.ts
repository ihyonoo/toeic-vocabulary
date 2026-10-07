import { expect, test } from '@playwright/test';
import { AUTH, login, seedDay, swipeRow } from './helpers';

test.use({ reducedMotion: 'reduce' });

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('행 북마크를 켜고 끄면 저장된다 (R-19)', async ({ page, request }) => {
	await seedDay(request, 501, [{ english: 'eagle', meaning: '독수리, 맹금' }]);
	await page.goto('/days/501');
	const mark = page.getByRole('listitem').first().getByRole('button', { name: '북마크' });

	await expect(mark).toHaveAttribute('aria-pressed', 'false');
	await mark.click();
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	await page.reload();
	await expect(page.getByRole('listitem').first().getByRole('button', { name: '북마크' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('행을 왼쪽으로 밀어 숨기면 흐리게 보이고, 숨김 해제로 되돌린다 (R-20)', async ({ page, request }) => {
	await seedDay(request, 502, [{ english: 'narrow', meaning: '좁은' }]);
	await page.goto('/days/502');
	const row = page.getByRole('listitem').first();

	await swipeRow(page, row);
	await row.getByRole('button', { name: '숨기기' }).click();
	await expect(row).toHaveCSS('opacity', '0.4');
	await page.reload();
	await expect(page.getByRole('listitem').first()).toHaveCSS('opacity', '0.4');

	await swipeRow(page, page.getByRole('listitem').first());
	await page.getByRole('button', { name: '숨김 해제' }).click();
	await expect(page.getByRole('listitem').first()).toHaveCSS('opacity', '1');
});

test('행을 밀어 영어·뜻을 고치고, 다른 단어와 겹치면 시트에 이유를 보여준다 (R-21)', async ({
	page,
	request
}) => {
	await seedDay(request, 503, [
		{ english: 'rescue', meaning: '구조하다' },
		{ english: 'pumpkin', meaning: '호박' }
	]);
	await page.goto('/days/503');
	const row = page.getByRole('listitem').nth(1);

	await swipeRow(page, row);
	await row.getByRole('button', { name: '수정' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 수정' });
	await sheet.getByLabel('영어').fill('Rescue');
	await sheet.getByLabel('뜻').fill('구조하다');
	await sheet.getByRole('button', { name: '저장' }).click();
	await expect(sheet.getByText('이미 있는 단어예요')).toBeVisible();

	await sheet.getByLabel('영어').fill('pumpkin');
	await sheet.getByLabel('뜻').fill('호박 ,애호박');
	await sheet.getByRole('button', { name: '저장' }).click();
	await expect(sheet).toBeHidden();
	await expect(row).toContainText('호박, 애호박');
});

test('행을 밀어 삭제하면 확인을 거쳐 모든 Day에서 사라진다 (R-21)', async ({ page, request }) => {
	await seedDay(request, 504, [{ english: 'fountain', meaning: '분수대' }, { english: 'collect', meaning: '모으다' }]);
	await seedDay(request, 505, [{ english: 'fountain', meaning: '분수대' }]);
	await page.goto('/days/504');
	const row = page.getByRole('listitem').first();

	await swipeRow(page, row);
	await row.getByRole('button', { name: '삭제' }).click();
	const confirm = page.getByRole('dialog', { name: '단어 삭제' });
	await expect(confirm).toContainText('모든 Day에서 지워져요');
	await confirm.getByRole('button', { name: '삭제' }).click();
	await expect(page.getByRole('listitem')).toHaveCount(1);

	await page.goto('/days/505');
	await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('단어 추가로 영어·뜻을 넣으면 Day 끝에 붙고, 이미 있으면 이유를 보여준다 (R-22)', async ({
	page,
	request
}) => {
	await seedDay(request, 506, [{ english: 'orbit', meaning: '궤도' }]);
	await page.goto('/days/506');

	await page.getByRole('button', { name: '단어 추가' }).click();
	const sheet = page.getByRole('dialog', { name: '단어 추가' });
	await sheet.getByLabel('영어').fill('sail');
	await sheet.getByLabel('뜻').fill('항해하다, 돛');
	await sheet.getByRole('button', { name: '추가' }).click();
	await expect(sheet).toBeHidden();
	await expect(page.getByRole('listitem').last()).toContainText('sail');

	await page.getByRole('button', { name: '단어 추가' }).click();
	await sheet.getByLabel('영어').fill('Orbit');
	await sheet.getByLabel('뜻').fill('궤도');
	await sheet.getByRole('button', { name: '추가' }).click();
	await expect(sheet.getByText('이 Day에 이미 있는 단어예요')).toBeVisible();
});

test('단어 수정 API는 409와 정규화된 값을, Day 삭제 API는 지운 단어 수를 돌려준다 (R-7, R-8)', async ({
	request
}) => {
	const created = await seedDay(request, 507, [
		{ english: 'pebble', meaning: '조약돌, 자갈' },
		{ english: 'cotton', meaning: '면' }
	]);
	const [policy, cost] = created.created;

	const conflict = await request.patch(`/api/words/${cost.id}`, {
		headers: AUTH,
		data: { english: 'pebble', meaning: '조약돌,자갈' }
	});
	expect(conflict.status()).toBe(409);
	expect((await conflict.json()).error.code).toBe('duplicate_word');

	const ok = await request.patch(`/api/words/${policy.id}`, {
		headers: AUTH,
		data: { example: 'The pebble was smooth.', exampleKo: '조약돌이 매끄러웠다.' }
	});
	expect((await ok.json()).word).toMatchObject({ example: 'The pebble was smooth.' });

	const removed = await request.delete('/api/days/507', { headers: AUTH });
	expect(await removed.json()).toEqual({ day: 507, deletedWords: 2 });
	expect((await request.delete('/api/days/507', { headers: AUTH })).status()).toBe(404);
	expect((await request.delete(`/api/words/${cost.id}`, { headers: AUTH })).status()).toBe(404);
});

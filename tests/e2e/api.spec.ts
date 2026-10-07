import { expect, test } from '@playwright/test';
import { E2E_PASSWORD } from '../../playwright.config';
import { AUTH } from './helpers';

test.describe('API 인증', () => {
	test('인증 없이 부르면 401이다', async ({ request }) => {
		const res = await request.get('/api/days');
		expect(res.status()).toBe(401);
		expect((await res.json()).error.code).toBe('unauthorized');
	});

	test('경로를 퍼센트 인코딩해도 인증 없이는 401이다', async ({ request }) => {
		for (const [method, path] of [
			['GET', '/%61pi/days'],
			['DELETE', '/%61pi/days/1'],
			['PATCH', '/%61pi/words/1']
		] as const) {
			const res = await request.fetch(path, { method, data: method === 'PATCH' ? { hidden: true } : undefined });
			expect(res.status(), `${method} ${path}`).toBe(401);
		}
	});

	test('Bearer 토큰이 틀리면 401이다', async ({ request }) => {
		const res = await request.get('/api/days', { headers: { Authorization: 'Bearer wrong' } });
		expect(res.status()).toBe(401);
	});

	test('로그인 쿠키로 부를 수 있다', async ({ page }) => {
		await page.request.post('/api/login', { data: { password: E2E_PASSWORD } });
		const res = await page.request.get('/api/days');
		expect(res.status()).toBe(200);
	});

	test('비밀번호가 틀리면 로그인은 400이다', async ({ request }) => {
		const res = await request.post('/api/login', { data: { password: 'nope' } });
		expect(res.status()).toBe(400);
		expect((await res.json()).error.code).toBe('wrong_password');
	});
});

test.describe('등록 API (R-4, R-5)', () => {
	test('본문이 JSON이 아니면 415다', async ({ request }) => {
		const res = await request.post('/api/days', {
			headers: { ...AUTH, 'content-type': 'application/xml' },
			data: '<day>1</day>'
		});
		expect(res.status()).toBe(415);
	});

	for (const type of ['application/x-www-form-urlencoded', 'text/plain']) {
		test(`${type} 본문은 SvelteKit 출처 검사가 403으로 막는다`, async ({ request }) => {
			const res = await request.post('/api/days', {
				headers: { ...AUTH, 'content-type': type },
				data: 'day=1'
			});
			expect(res.status()).toBe(403);
		});
	}

	test('등록 결과를 새로 만든 것, 연결한 것, 건너뛴 것으로 나눠 돌려준다', async ({ request }) => {
		await request.post('/api/days', {
			headers: AUTH,
			data: { day: 101, words: [{ english: 'dinosaur', meaning: '공룡, 큰 동물' }] }
		});

		const res = await request.post('/api/days', {
			headers: AUTH,
			data: {
				day: 102,
				words: [
					{ english: 'dinosaur', meaning: '공룡, 큰 동물' },
					{ english: 'astronaut', meaning: '우주비행사' },
					{ english: 'astronaut', meaning: '우주비행사' }
				]
			}
		});

		expect(res.status()).toBe(200);
		const body = await res.json();
		expect(body.day).toBe(102);
		expect(body.created.map((w: { english: string }) => w.english)).toEqual(['astronaut']);
		expect(body.linked.map((w: { english: string }) => w.english)).toEqual(['dinosaur']);
		expect(body.skipped.map((w: { english: string }) => w.english)).toEqual(['astronaut']);
	});

	test('잘못된 항목이 있으면 400이고 Day가 생기지 않는다', async ({ request }) => {
		const res = await request.post('/api/days', {
			headers: AUTH,
			data: { day: 103, words: [{ english: 'garden', meaning: '' }] }
		});
		expect(res.status()).toBe(400);
		expect((await res.json()).error.code).toBe('invalid_request');

		const days = (await (await request.get('/api/days', { headers: AUTH })).json()).days;
		expect(days.map((d: { number: number }) => d.number)).not.toContain(103);
	});

	test('Day 목록은 번호 오름차순이고 단어 수를 담는다', async ({ request }) => {
		await request.post('/api/days', {
			headers: AUTH,
			data: { day: 104, words: [{ english: 'list104a', meaning: '가' }, { english: 'list104b', meaning: '나' }] }
		});
		const res = await request.get('/api/days', { headers: AUTH });
		const days = (await res.json()).days as { number: number; wordCount: number }[];
		const numbers = days.map((d) => d.number);
		expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
		expect(days.find((d) => d.number === 104)?.wordCount).toBe(2);
	});
});

test.describe('묶음 API (내 단어)', () => {
	test('mine으로 등록하고, 종이 등록이 같은 Day의 내 단어를 옮기면 moved로 알린다', async ({ request }) => {
		const mine = await request.post('/api/days', {
			headers: AUTH,
			data: { day: 901, section: 'mine', words: [{ english: 'lamp901', meaning: '등' }] }
		});
		expect((await mine.json()).moved).toEqual([]);

		const paper = await request.post('/api/days', {
			headers: AUTH,
			data: { day: 901, words: [{ english: 'lamp901', meaning: '등' }, { english: 'desk901', meaning: '책상' }] }
		});
		const body = await paper.json();
		expect(body.moved.map((w: { english: string }) => w.english)).toEqual(['lamp901']);
		expect(body.created.map((w: { english: string }) => w.english)).toEqual(['desk901']);
	});

	test('section이 잘못되면 400이다', async ({ request }) => {
		const res = await request.post('/api/days', {
			headers: AUTH,
			data: { day: 902, section: 'other', words: [{ english: 'x902', meaning: '엑스' }] }
		});
		expect(res.status()).toBe(400);
	});

	test('Day 단어 조회는 묶음과 id를 담고, 묶음을 바꿀 수 있다', async ({ request }) => {
		await request.post('/api/days', {
			headers: AUTH,
			data: { day: 903, words: [{ english: 'cup903', meaning: '컵' }] }
		});
		await request.post('/api/days', {
			headers: AUTH,
			data: { day: 903, section: 'mine', words: [{ english: 'pen903', meaning: '펜' }] }
		});

		const got = await request.get('/api/days/903', { headers: AUTH });
		expect(got.status()).toBe(200);
		const { day, words } = await got.json();
		expect(day).toBe(903);
		expect(words.map((w: { english: string; section: string }) => `${w.section}:${w.english}`)).toEqual([
			'class:cup903',
			'mine:pen903'
		]);

		const cup = words[0].id;
		const moved = await request.patch(`/api/days/903/words/${cup}`, { headers: AUTH, data: { section: 'mine' } });
		expect(moved.status()).toBe(200);
		expect((await moved.json()).word).toMatchObject({ english: 'cup903', section: 'mine' });

		expect((await request.patch(`/api/days/903/words/${cup}`, { headers: AUTH, data: { section: 'x' } })).status()).toBe(400);
		expect((await request.patch(`/api/days/904/words/${cup}`, { headers: AUTH, data: { section: 'mine' } })).status()).toBe(404);
		expect((await request.get('/api/days/904', { headers: AUTH })).status()).toBe(404);
	});
});

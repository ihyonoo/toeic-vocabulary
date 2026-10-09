import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFakeOpenAI } from '../support/fake-openai.mjs';
import { EXTRACT_MODEL, ExtractError, extractWords } from '$lib/server/extract';

// 실제 SDK가 HTTP로 가짜 Responses API를 부른다
let fake: Awaited<ReturnType<typeof startFakeOpenAI>>;

beforeAll(async () => {
	fake = await startFakeOpenAI();
});

afterAll(() => fake.close());

const PHOTO_1 = 'data:image/jpeg;base64,AAA1';
const opts = (extra = {}) => ({ apiKey: 'test-key', baseURL: fake.url, ...extra });

function raw(english: string, meaning: string, extra: Record<string, unknown> = {}) {
	return {
		english,
		paperEnglish: null,
		meaning,
		meaningFilled: false,
		pos: '명사',
		example: 'An example.',
		exampleKo: '예문.',
		...extra
	};
}

async function expectExtractError(promise: Promise<unknown>, message: string) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e
	);
	expect(error).toBeInstanceOf(ExtractError);
	expect((error as Error).message).toBe(message);
}

describe('요청', () => {
	it('모델, 저장 끔, 추론 강도, strict 스키마로 사진 한 장을 보낸다', async () => {
		fake.setScenario({ words: [raw('apple', '사과')] });
		await extractWords(PHOTO_1, opts());

		expect(fake.requests).toHaveLength(1);
		const { headers, body } = fake.requests[0];
		expect(headers.authorization).toBe('Bearer test-key');
		expect(EXTRACT_MODEL).toBe('gpt-6.1-sol');
		expect(body).toMatchObject({ model: EXTRACT_MODEL, store: false, reasoning: { effort: 'low' } });
		expect(body.text.format).toMatchObject({ type: 'json_schema', strict: true });
		expect(body.text.format.schema.properties.words.items.required).toEqual([
			'english',
			'paperEnglish',
			'meaning',
			'meaningFilled',
			'pos',
			'example',
			'exampleKo'
		]);
		expect(body.input[0].content).toEqual([{ type: 'input_image', image_url: PHOTO_1, detail: 'high' }]);
		expect(body.max_output_tokens).toBe(12_000);
	});
});

describe('응답 처리', () => {
	it('칸을 다듬고, 철자가 같으면 원래 철자를 비우고, 영어가 빈 항목을 버린다', async () => {
		fake.setScenario({
			words: [
				raw(' apple ', ' 사과 ', { paperEnglish: 'aple', meaningFilled: true }),
				raw('River', '강', { paperEnglish: 'river' }),
				raw('  ', '빈 줄')
			]
		});
		const { items, usage } = await extractWords(PHOTO_1, opts());
		expect(items).toEqual([
			{ ...raw('apple', '사과'), paperEnglish: 'aple', meaningFilled: true },
			{ ...raw('River', '강'), paperEnglish: null }
		]);
		expect(usage).toEqual({ input: 7000, output: 9000 });
	});

	it('중간 설명 메시지는 빼고 최종 답만 읽는다', async () => {
		fake.setScenario({ kind: 'commentary', words: [raw('apple', '사과')] });
		const { items } = await extractWords(PHOTO_1, opts());
		expect(items.map((i) => i.english)).toEqual(['apple']);
	});
});

describe('실패 이유 (R-56)', () => {
	it.each([
		[{ kind: 'incomplete' }, '단어가 많아 끝까지 읽지 못했어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요.'],
		[{ kind: 'incomplete', reason: 'content_filter' }, 'AI가 응답을 끝까지 만들지 못했어요.'],
		[{ kind: 'refusal' }, 'AI가 이 사진 처리를 거절했어요.'],
		[{ kind: 'failed' }, 'AI 처리에 실패했어요.'],
		[{ kind: 'invalid_json' }, 'AI 응답을 읽지 못했어요.'],
		[{ kind: 'ok', words: [] }, '사진에서 단어를 찾지 못했어요.'],
		[{ kind: 'error', status: 401 }, 'OpenAI API 키가 잘못됐어요.'],
		[{ kind: 'error', status: 429, code: 'insufficient_quota' }, 'OpenAI 크레딧이 부족해요.'],
		[{ kind: 'error', status: 429 }, '요청이 많아 잠시 막혔어요. 잠시 뒤 다시 올려 주세요.'],
		[{ kind: 'error', status: 500 }, 'AI 호출에 실패했어요 (500).']
	] as const)('%o → %s', async (scenario, message) => {
		fake.setScenario(scenario);
		await expectExtractError(extractWords(PHOTO_1, opts()), message);
	});

	it('일시 오류는 한 번만 다시 시도한다', async () => {
		fake.setScenario({ kind: 'error', status: 500 });
		await expectExtractError(extractWords(PHOTO_1, opts()), 'AI 호출에 실패했어요 (500).');
		expect(fake.requests).toHaveLength(2);
	});

	it('연결하지 못하면 연결 오류다', async () => {
		// 닫힌 포트
		await expectExtractError(
			extractWords(PHOTO_1, opts({ baseURL: 'http://127.0.0.1:9/v1' })),
			'OpenAI에 연결하지 못했어요.'
		);
	});

	it('시간 안에 응답이 없으면 시간 초과다', async () => {
		fake.setScenario({ words: [raw('apple', '사과')], delayMs: 1000 });
		await expectExtractError(
			extractWords(PHOTO_1, opts({ timeout: 50 })),
			'AI 응답이 너무 오래 걸렸어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요.'
		);
	});

	it('중단하면 ExtractError가 아닌 오류로 끝난다', async () => {
		fake.setScenario({ words: [raw('apple', '사과')], delayMs: 1000 });
		const controller = new AbortController();
		const pending = extractWords(PHOTO_1, opts({ signal: controller.signal }));
		setTimeout(() => controller.abort(), 20);
		const error = await pending.then(
			() => null,
			(e: unknown) => e
		);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBeInstanceOf(ExtractError);
	});
});

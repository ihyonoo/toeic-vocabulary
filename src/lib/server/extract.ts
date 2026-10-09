import OpenAI, {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	APIUserAbortError,
	AuthenticationError,
	RateLimitError
} from 'openai';
import type { DraftItem } from '$lib/domain/types';

// 사진에서 단어 추출 (docs/trd/2026-10-09-photo-import.md)
export const EXTRACT_MODEL = 'gpt-6.1-sol';
// 사진 한 장(약 55줄) 추정 2분보다 길게 (PRD R-56)
const TIMEOUT_MS = 240_000;
// 시간 제한 안에 나올 수 있는 양: 약 50토큰/초 × 240초
// 추론 토큰 포함
const MAX_OUTPUT_TOKENS = 12_000;

// message가 곧 초안의 실패 이유다
export class ExtractError extends Error {}

const PROMPT = `너는 한국 토익 학원 단어장 사진 한 장에서 단어를 옮겨 적는다.

읽는 순서
- 위에서 아래로 읽는다. 단이 여러 개면 왼쪽 단부터 읽는다.

항목 규칙
- 단어 줄 하나가 항목 하나다. 같은 단어가 다시 나와도 모두 넣는다.
- 제목, 날짜, 줄 번호, 머리말, 쪽 번호처럼 단어가 아닌 것은 넣지 않는다.

칸 규칙
- english: 종이의 영어 단어나 숙어. 철자가 명백히 틀렸을 때만 고치고, 그때 paperEnglish에 종이의 철자를 그대로 넣는다. 고치지 않았으면 paperEnglish는 null이다. 영국식 철자, 대소문자, 하이픈은 고치지 않는다.
- meaning: 종이의 한국어 뜻을 글자 그대로 옮긴다. '영어 [뜻, 뜻]' 형식이면 대괄호를 빼고 '뜻, 뜻'으로 쓴다. 종이에 뜻이 없으면 토익에서 쓰는 뜻을 직접 쓰고 meaningFilled를 true로 한다. 종이에 뜻이 있으면 meaningFilled는 false다.
- pos: 명사, 동사, 형용사, 부사, 전치사, 접속사, 대명사 중에서 고르고, 맞는 것이 없으면 가장 가까운 한국어 품사 이름을 쓴다. 숙어나 구는 '구'로 쓴다. 뜻마다 품사가 다르면 뜻 순서대로 '동사, 명사'처럼 쓴다.
- example: 그 단어를 쓴 토익 맥락의 짧은 영어 문장 하나. 15단어 이하.
- exampleKo: example의 자연스러운 한국어 해석.`;

const WORD_FIELDS = ['english', 'paperEnglish', 'meaning', 'meaningFilled', 'pos', 'example', 'exampleKo'];

const SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['words'],
	properties: {
		words: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: WORD_FIELDS,
				properties: {
					english: { type: 'string' },
					paperEnglish: { type: ['string', 'null'] },
					meaning: { type: 'string' },
					meaningFilled: { type: 'boolean' },
					pos: { type: 'string' },
					example: { type: 'string' },
					exampleKo: { type: 'string' }
				}
			}
		}
	}
};

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function toItem(raw: Record<string, unknown>): DraftItem {
	const english = text(raw.english);
	const paper = text(raw.paperEnglish);
	return {
		english,
		meaning: text(raw.meaning),
		pos: text(raw.pos),
		example: text(raw.example),
		exampleKo: text(raw.exampleKo),
		paperEnglish: paper && paper.toLowerCase() !== english.toLowerCase() ? paper : null,
		meaningFilled: raw.meaningFilled === true
	};
}

// 버리기(중단)는 그대로 던져 호출한 쪽이 기록하지 않게 한다
function toExtractError(e: unknown): unknown {
	if (e instanceof APIUserAbortError) return e;
	if (e instanceof APIConnectionTimeoutError) {
		return new ExtractError('AI 응답이 너무 오래 걸렸어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요.');
	}
	if (e instanceof APIConnectionError) return new ExtractError('OpenAI에 연결하지 못했어요.');
	if (e instanceof AuthenticationError) return new ExtractError('OpenAI API 키가 잘못됐어요.');
	if (e instanceof RateLimitError) {
		return new ExtractError(
			e.code === 'insufficient_quota'
				? 'OpenAI 크레딧이 부족해요.'
				: '요청이 많아 잠시 막혔어요. 잠시 뒤 다시 올려 주세요.'
		);
	}
	if (e instanceof APIError) return new ExtractError(`AI 호출에 실패했어요 (${e.status}).`);
	return e;
}

// 사진 한 장을 읽는다
// 여러 장은 호출한 쪽이 장마다 따로 부른다
export async function extractWords(
	photo: string,
	opts: { apiKey: string; baseURL?: string; signal?: AbortSignal; timeout?: number }
): Promise<{ items: DraftItem[]; usage: { input: number; output: number } }> {
	// baseURL을 생략하면 SDK가 OPENAI_BASE_URL, 그다음 기본 주소를 쓴다
	const client = new OpenAI({
		apiKey: opts.apiKey,
		baseURL: opts.baseURL,
		timeout: opts.timeout ?? TIMEOUT_MS,
		maxRetries: 1
	});

	let response;
	try {
		response = await client.responses.create(
			{
				model: EXTRACT_MODEL,
				reasoning: { effort: 'low' },
				store: false, // OpenAI에 응답을 저장하지 않는다
				max_output_tokens: MAX_OUTPUT_TOKENS,
				instructions: PROMPT,
				input: [{ role: 'user', content: [{ type: 'input_image', image_url: photo, detail: 'high' }] }],
				text: { format: { type: 'json_schema', name: 'vocab_sheet', strict: true, schema: SCHEMA } }
			},
			{ signal: opts.signal }
		);
	} catch (e) {
		throw toExtractError(e);
	}

	if (response.status === 'incomplete') {
		throw new ExtractError(
			response.incomplete_details?.reason === 'max_output_tokens'
				? '단어가 많아 끝까지 읽지 못했어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요.'
				: 'AI가 응답을 끝까지 만들지 못했어요.'
		);
	}
	if (response.status === 'failed') throw new ExtractError('AI 처리에 실패했어요.');
	// 중간 설명(commentary) 메시지는 JSON이 아니라서 뺀다
	const messages = response.output.filter((o) => o.type === 'message' && o.phase !== 'commentary');
	const contents = messages.flatMap((m) => (m.type === 'message' ? m.content : []));
	if (contents.some((c) => c.type === 'refusal')) throw new ExtractError('AI가 이 사진 처리를 거절했어요.');
	const json = contents.map((c) => (c.type === 'output_text' ? c.text : '')).join('');

	let words: unknown;
	try {
		words = (JSON.parse(json) as { words?: unknown }).words;
	} catch {
		throw new ExtractError('AI 응답을 읽지 못했어요.');
	}
	const items = (Array.isArray(words) ? words : [])
		.map((w) => toItem((w ?? {}) as Record<string, unknown>))
		.filter((w) => w.english !== '');
	if (items.length === 0) throw new ExtractError('사진에서 단어를 찾지 못했어요.');

	return {
		items,
		usage: { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 }
	};
}

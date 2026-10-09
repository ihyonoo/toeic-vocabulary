// 테스트용 가짜 OpenAI Responses API
// 단위 테스트는 startFakeOpenAI()로 띄우고, E2E는 `node tests/support/fake-openai.mjs <port>`로 띄운다
// 다음 응답은 setScenario() 또는 POST /__scenario, 받은 요청은 requests 또는 GET /__requests
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ kind: 'ok' | 'commentary' | 'refusal' | 'incomplete' | 'failed' | 'invalid_json' | 'error', words: readonly unknown[], delayMs: number, status: number, code: string | null, reason: string, perImage: Record<string, Partial<Omit<Scenario, 'perImage'>>> }} Scenario
 * @typedef {{ headers: import('node:http').IncomingHttpHeaders, body: any, aborted: boolean }} ReceivedRequest
 */

/** @type {Scenario} */
// perImage: 사진(image_url)마다 다르게 응답할 때 그 사진에만 덮어쓸 값
const DEFAULT_SCENARIO = {
	kind: 'ok',
	words: [],
	delayMs: 0,
	status: 500,
	code: null,
	reason: 'max_output_tokens',
	perImage: {}
};

/** @param {unknown[]} content */
function message(content) {
	return { type: 'message', id: 'msg_fake', role: 'assistant', status: 'completed', content };
}

/** @param {string} text */
function outputText(text) {
	return { type: 'output_text', text, annotations: [] };
}

/** @param {Scenario} scenario */
function responseBody(scenario) {
	const base = {
		id: 'resp_fake',
		object: 'response',
		created_at: 0,
		model: 'fake',
		status: 'completed',
		incomplete_details: null,
		error: null,
		usage: { input_tokens: 7000, output_tokens: 9000, total_tokens: 16000 }
	};
	switch (scenario.kind) {
		case 'refusal':
			return { ...base, output: [message([{ type: 'refusal', refusal: '처리할 수 없어요.' }])] };
		case 'incomplete':
			return {
				...base,
				status: 'incomplete',
				incomplete_details: { reason: scenario.reason },
				output: [message([outputText('{"words":[{"english":"wor')])]
			};
		case 'commentary':
			return {
				...base,
				output: [
					{ ...message([outputText('사진을 읽는 중이에요.')]), phase: 'commentary' },
					{ ...message([outputText(JSON.stringify({ words: scenario.words }))]), phase: 'final_answer' }
				]
			};
		case 'failed':
			return { ...base, status: 'failed', error: { code: 'server_error', message: 'fake' }, output: [] };
		case 'invalid_json':
			return { ...base, output: [message([outputText('not json')])] };
		default:
			return { ...base, output: [message([outputText(JSON.stringify({ words: scenario.words }))])] };
	}
}

/** @param {import('node:http').IncomingMessage} req @returns {Promise<string>} */
function readBody(req) {
	return new Promise((resolve, reject) => {
		/** @type {Buffer[]} */
		const chunks = [];
		req.on('data', (c) => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

/** @param {import('node:http').ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body, headers = {}) {
	res.writeHead(status, { 'content-type': 'application/json', ...headers });
	res.end(JSON.stringify(body));
}

/** @param {Partial<Scenario>} [next] @returns {Scenario} */
const withDefaults = (next) => ({ ...DEFAULT_SCENARIO, ...next });

export function startFakeOpenAI(port = 0) {
	let scenario = withDefaults();
	/** @type {ReceivedRequest[]} */
	const requests = [];

	const server = createServer(async (req, res) => {
		const raw = await readBody(req);
		if (req.method === 'POST' && req.url === '/__scenario') {
			scenario = withDefaults(JSON.parse(raw));
			requests.length = 0;
			res.writeHead(204).end();
			return;
		}
		if (req.method === 'GET' && req.url === '/__requests') return sendJson(res, 200, requests);
		if (req.method !== 'POST' || req.url !== '/v1/responses') return sendJson(res, 404, {});

		const body = JSON.parse(raw);
		/** @type {ReceivedRequest} */
		const record = { headers: req.headers, body, aborted: false };
		requests.push(record);
		/** @type {{ type: string, image_url?: string }[]} */
		const content = body.input?.[0]?.content ?? [];
		const image = content.find((c) => c.type === 'input_image')?.image_url ?? '';
		/** @type {Scenario} */
		const current = { ...scenario, ...scenario.perImage[image] };
		if (current.delayMs > 0) {
			// 클라이언트가 끊으면(버리기, 시간 초과) 응답하지 않는다
			const closed = await new Promise((resolve) => {
				const timer = setTimeout(() => resolve(false), current.delayMs);
				res.on('close', () => {
					clearTimeout(timer);
					resolve(true);
				});
			});
			if (closed) {
				record.aborted = true;
				return;
			}
		}
		if (current.kind === 'error') {
			// 재시도 대기를 줄인다
			return sendJson(
				res,
				current.status,
				{ error: { message: 'fake error', type: current.code ?? 'server_error', code: current.code } },
				{ 'retry-after-ms': '1' }
			);
		}
		sendJson(res, 200, responseBody(current));
	});

	/** @type {Promise<{ url: string, requests: ReceivedRequest[], setScenario: (next: Partial<Scenario>) => void, close: () => Promise<void> }>} */
	const started = new Promise((resolve) => {
		server.listen(port, '127.0.0.1', () => {
			const { port: actual } = /** @type {import('node:net').AddressInfo} */ (server.address());
			resolve({
				url: `http://127.0.0.1:${actual}/v1`,
				requests,
				setScenario(next) {
					scenario = withDefaults(next);
					requests.length = 0;
				},
				close: () => new Promise((done) => server.close(() => done(undefined)))
			});
		});
	});
	return started;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number(process.argv[2] ?? 4174);
	startFakeOpenAI(port).then(({ url }) => console.log(`fake openai ${url}`));
}

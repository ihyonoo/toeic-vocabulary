import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const FAKE_OPENAI_PORT = 4174;
export const E2E_PASSWORD = 'e2e-password';
// 테스트용 가짜 OpenAI (tests/support/fake-openai.mjs)
export const FAKE_OPENAI = `http://127.0.0.1:${FAKE_OPENAI_PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		// 로그인 제한이 IP마다 세므로 기본 IP를 준다
		// 제한 테스트만 다른 IP를 쓴다
		extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.1' },
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 15'] } }],
	webServer: [
		{
			command: `node tests/support/fake-openai.mjs ${FAKE_OPENAI_PORT}`,
			port: FAKE_OPENAI_PORT,
			reuseExistingServer: false
		},
		{
			command: 'rm -f test-results/e2e.db && npm run build && node build',
			port: PORT,
			reuseExistingServer: false,
			timeout: 120_000,
			env: {
				PORT: String(PORT),
				ORIGIN: `http://localhost:${PORT}`,
				APP_PASSWORD: E2E_PASSWORD,
				SESSION_SECRET: 'e2e-session-secret-at-least-32-characters',
				DATABASE_PATH: 'test-results/e2e.db',
				OPENAI_API_KEY: 'e2e-key',
				OPENAI_BASE_URL: `${FAKE_OPENAI}/v1`,
				BODY_SIZE_LIMIT: '20M',
				ADDRESS_HEADER: 'x-forwarded-for'
			}
		}
	]
});

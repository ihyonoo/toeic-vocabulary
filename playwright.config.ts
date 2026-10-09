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
				DATABASE_PATH: 'test-results/e2e.db',
				OPENAI_API_KEY: 'e2e-key',
				OPENAI_BASE_URL: `${FAKE_OPENAI}/v1`,
				BODY_SIZE_LIMIT: '20M'
			}
		}
	]
});

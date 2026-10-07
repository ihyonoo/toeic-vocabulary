import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const E2E_PASSWORD = 'e2e-password';

export default defineConfig({
	testDir: 'tests/e2e',
	workers: 1,
	reporter: 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'iphone-webkit', use: { ...devices['iPhone 15'] } }],
	webServer: {
		command: 'rm -f test-results/e2e.db && npm run build && node build',
		port: PORT,
		reuseExistingServer: false,
		timeout: 120_000,
		env: {
			PORT: String(PORT),
			ORIGIN: `http://localhost:${PORT}`,
			APP_PASSWORD: E2E_PASSWORD,
			DATABASE_PATH: 'test-results/e2e.db'
		}
	}
});

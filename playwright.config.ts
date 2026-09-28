import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'tsx server.ts',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false,
    env: {
      APP_PORT: '4173',
      DISABLE_HMR: 'true',
      LAZYLIFT_DATA_DIR: '.e2e-data',
      GEMINI_API_KEY: 'MY_GEMINI_API_KEY',
    },
  },
  reporter: [['list'], ['html', { outputFolder: 'evidence/playwright-report', open: 'never' }]],
});

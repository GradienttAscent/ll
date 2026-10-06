import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { LAZYLIFT_DATA_DIR: '.e2e-data/sys-01', APP_PORT: '3000' },
  },
});

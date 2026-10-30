import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', outputDir: 'public-test-results', timeout: 30000, retries: 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'ko-KR', reducedMotion: 'reduce' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120000 },
});

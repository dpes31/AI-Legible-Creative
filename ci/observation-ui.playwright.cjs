const path = require('node:path');
const root = process.env.GEO_APP_ROOT;
if (!root) throw new Error('GEO_APP_ROOT must be the verified integration worktree');
const { defineConfig, devices } = require(path.join(root, 'node_modules/@playwright/test'));
module.exports = defineConfig({
  testDir: path.join(root, 'e2e'),
  testMatch: 'consumer-review-ui.spec.ts',
  outputDir: path.join(root, 'public-test-results'),
  timeout: 30000, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: path.join(root, 'public-test-results/results.json') }]],
  use: { baseURL: 'http://127.0.0.1:3100', locale: 'ko-KR', reducedMotion: 'reduce',
    screenshot: 'on', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev -- --webpack --hostname 127.0.0.1 --port 3100',
    cwd: root, url: 'http://127.0.0.1:3100/review', reuseExistingServer: false, timeout: 120000 },
});

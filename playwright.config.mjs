import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  reporter: 'list', outputDir: 'artifacts/playwright',
  use: { ...devices['Desktop Chrome'], headless: true,
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});

import { defineConfig, devices } from '@playwright/test';

process.env.NODE_ENV = 'test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'Desktop Chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

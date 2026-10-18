import { defineConfig, devices } from '@playwright/test';

/**
 * Local-only browser configuration.
 *
 * No webServer is started automatically: the repository's environment files
 * contain external Supabase settings, so a caller must explicitly provide a
 * verified isolated local server before executing browser tests.
 */
export default defineConfig({
  testDir: './tests-e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
});

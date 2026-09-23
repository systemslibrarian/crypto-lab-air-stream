import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://localhost:4606/crypto-lab-air-stream/'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: { baseURL },
  projects: [
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      name: 'claims-chromium',
      testMatch: /claims\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'claims-mobile',
      testMatch: /claims\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4606 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
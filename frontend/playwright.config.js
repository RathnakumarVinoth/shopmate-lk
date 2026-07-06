import { defineConfig, devices } from '@playwright/test'

const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 5173)
const backendPort = Number(process.env.E2E_BACKEND_PORT || 5001)
const frontendUrl = `http://127.0.0.1:${frontendPort}`
const backendUrl = `http://127.0.0.1:${backendPort}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: frontendUrl,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run start:test',
      cwd: '../backend',
      env: {
        ...process.env,
        PORT: String(backendPort),
        FRONTEND_URL: frontendUrl,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: `${backendUrl}/api/health`,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      env: {
        ...process.env,
        VITE_API_URL: `${backendUrl}/api`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      url: frontendUrl,
    },
  ],
})

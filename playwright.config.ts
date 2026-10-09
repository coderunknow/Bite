import { defineConfig, devices } from '@playwright/test';

// Browser binary selection:
//  * BITE_CHROMIUM_PATH: path to a Chromium/Chrome executable (CI or sandboxes without Playwright browser downloads).
//  * otherwise Playwright's bundled Chromium (`npx playwright install chromium`).
const executablePath = process.env.BITE_CHROMIUM_PATH || undefined;
const port = Number(process.env.BITE_E2E_PORT || 4173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--use-gl=angle',
        '--autoplay-policy=no-user-gesture-required',
        '--no-sandbox',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: process.env.BITE_E2E_NO_SERVER
    ? undefined
    : {
        command: `npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

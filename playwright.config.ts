import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the production web build through a real browser.
// By default Playwright uses its managed Chromium (`npx playwright install chromium`).
// Environment overrides (for sandboxes without the Playwright CDN):
//   BITE_CHROMIUM_PATH       path to a Chromium/Chrome binary
//   BITE_CHROMIUM_ARGS       extra space-separated Chromium flags (e.g. "--no-zygote --single-process")
//   BITE_E2E_PORT            preview server port (default 4173)
const executablePath = process.env.BITE_CHROMIUM_PATH || undefined;
const extraArgs = (process.env.BITE_CHROMIUM_ARGS ?? '').split(/\s+/).filter(Boolean);
const port = Number(process.env.BITE_E2E_PORT || 4173);
const launchArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', ...extraArgs];

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    viewport: { width: 1600, height: 960 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 960 },
        launchOptions: { executablePath, args: launchArgs },
      },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});

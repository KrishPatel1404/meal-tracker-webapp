import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/e2e/support/env.js";

loadTestEnv();

const PREVIEW_PORT = 4173;
const BASE_URL = `http://localhost:${PREVIEW_PORT}`;
const SERVER_START_TIMEOUT_MS = 120_000;

export default defineConfig({
  testDir: "tests/e2e",
  // Every test owns the whole 2001 test year in the real database, so tests run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    // The production build registers a service worker; keep it out so routes and offline mode are predictable.
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iPhone 13", use: { ...devices["iPhone 13"] } },
    { name: "Pixel 7", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: SERVER_START_TIMEOUT_MS,
  },
});

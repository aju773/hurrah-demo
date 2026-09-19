import path from "node:path";
import { defineConfig } from "@playwright/test";

const BACKEND_DIR = path.resolve(__dirname, "../backend");
const PYTHON = path.join(BACKEND_DIR, "venv/bin/python");
const FIXTURE_DIR = path.resolve(__dirname, "e2e/fixtures/generated");

// Browser tests run against their own throwaway backend (port 8100, its own
// SQLite file and media folder) so they never touch the dev database.
const E2E_DB = "/tmp/hurrah-e2e.sqlite3";
const E2E_MEDIA = "/tmp/hurrah-e2e-media";
const API_URL = "http://127.0.0.1:8100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
  },
  webServer: [
    {
      command: [
        `rm -f ${E2E_DB}`,
        `rm -rf ${E2E_MEDIA}`,
        `${PYTHON} manage.py migrate --noinput`,
        `${PYTHON} manage.py write_fixture_pdfs --out ${FIXTURE_DIR}`,
        `exec ${PYTHON} manage.py runserver 127.0.0.1:8100 --noreload`,
      ].join(" && "),
      cwd: BACKEND_DIR,
      env: {
        SQLITE_PATH: E2E_DB,
        MEDIA_ROOT: E2E_MEDIA,
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:3100",
        ALLOWED_HOSTS: "127.0.0.1,localhost",
        // The specs so far exercise the priced behaviour (Price grid, Quote); the
        // money-free scripted runs come with their own backend setting.
        COMMERCE_ENABLED: "true",
      },
      url: `${API_URL}/api/design-requests/settings/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 3100",
      env: { NEXT_PUBLIC_API_URL: API_URL },
      url: "http://127.0.0.1:3100",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

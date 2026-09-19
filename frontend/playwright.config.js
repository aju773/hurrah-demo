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

// The scripted demo runs (e2e/journey.spec.js) are money-free: the Commerce switch
// is off, as it is in the real demo. That needs its own backend and its own
// frontend build pointed at it (the API address is baked into the frontend), so
// they get ports 8101 / 3101, another SQLite file and media folder, and another
// Next build folder (two dev servers cannot share one).
const JOURNEY_DB = "/tmp/hurrah-e2e-journey.sqlite3";
const JOURNEY_MEDIA = "/tmp/hurrah-e2e-journey-media";
const JOURNEY_API_URL = "http://127.0.0.1:8101";
const JOURNEY_ADMIN = { user: "e2e-staff", password: "e2e-staff-password" };

export default defineConfig({
  testDir: "./e2e",
  // One worker: the journey runs reset the shared demo state (Orders, uploads,
  // numbering) before each run, which would pull uploads out from under a run
  // going on in another worker.
  workers: 1,
  reporter: "list",
  projects: [
    {
      name: "priced",
      testIgnore: /journey.*\.spec\.js/,
      use: { baseURL: "http://127.0.0.1:3100" },
    },
    {
      name: "journey",
      testMatch: /journey.*\.spec\.js/,
      use: { baseURL: "http://127.0.0.1:3101" },
      // The journey specs read these to reach the backend and the staff admin.
      metadata: { apiUrl: JOURNEY_API_URL, admin: JOURNEY_ADMIN },
    },
  ],
  webServer: [
    {
      command: [
        `rm -f ${JOURNEY_DB}`,
        `rm -rf ${JOURNEY_MEDIA}`,
        `${PYTHON} manage.py migrate --noinput`,
        `${PYTHON} manage.py ensure_admin`,
        `exec ${PYTHON} manage.py runserver 127.0.0.1:8101 --noreload`,
      ].join(" && "),
      cwd: BACKEND_DIR,
      env: {
        SQLITE_PATH: JOURNEY_DB,
        MEDIA_ROOT: JOURNEY_MEDIA,
        CORS_ALLOWED_ORIGINS: "http://127.0.0.1:3101",
        ALLOWED_HOSTS: "127.0.0.1,localhost",
        COMMERCE_ENABLED: "false",
        ADMIN_USER: JOURNEY_ADMIN.user,
        ADMIN_PASSWORD: JOURNEY_ADMIN.password,
      },
      url: `${JOURNEY_API_URL}/api/design-requests/settings/`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --port 3101",
      env: { NEXT_PUBLIC_API_URL: JOURNEY_API_URL, NEXT_DIST_DIR: ".next-journey" },
      url: "http://127.0.0.1:3101",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
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

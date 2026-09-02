/**
 * WebdriverIO Configuration
 *
 * End-to-end test configuration for the Pochade-Electron template.
 *
 * For LLMs: these tests drive the REAL Electron app — the same binary
 * `npm run electron` launches — using Electron's own testing toolchain:
 *
 *   - `electron-chromedriver` is version-locked to the `electron`
 *     package, so its ChromeDriver always matches Electron's bundled
 *     Chromium (no system Chrome, no driver downloads).
 *   - The capability's `goog:chromeOptions.binary` points at the
 *     Electron binary and passes the project directory as a positional
 *     argument, so the app boots exactly like `electron .` does.
 *   - The app detects the webpack dev server started below and loads
 *     it, mirroring `npm run electron` development mode.
 *
 * They exercise the full stack: webpack bundling, the dev server,
 * Electron's main process and window, custom elements, web workers,
 * WebAssembly, and OPFS persistence.
 *
 * Displays: on a desktop the Electron window simply opens while tests
 * run. On headless Linux CI, WebdriverIO's built-in `autoXvfb` wraps
 * the workers with `xvfb-run` automatically when no DISPLAY is set —
 * just make sure `xvfb-run` is installed (or set `xvfbAutoInstall`).
 * Alternatively, expose a display from a podman container:
 *
 *   podman run -d --name xvfb -p 127.0.0.1:6099:6099 <xvfb-image>
 *   DISPLAY=127.0.0.1:99 npm test
 *
 * The File System Access pickers are NATIVE dialogs — no automation
 * tool can click them. The e2e suite therefore stubs
 * window.showSaveFilePicker / window.showOpenFilePicker via
 * browser.addInitScript() and asserts how our code drives the dialog
 * API (see tests/e2e/file-storage-component.spec.js).
 *
 * A WebdriverIO session is REUSED across tests in a spec file (and
 * OPFS data persists between navigations). Specs that touch the
 * database must clean up leftover entries in beforeEach — see
 * clearExistingEntries() in tests/helpers/e2e-utils.js. Each spec
 * file gets its own Electron instance with a fresh profile, so state
 * never leaks between spec files.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the project-specific dev server port so WebdriverIO uses the same
// URL as `npm start` and `npm run electron`.
dotenv.config();

const port = process.env.PORT || 3000;
const baseURL = `http://localhost:${port}`;

/**
 * Path of the Electron binary installed in node_modules — the exact
 * binary `npm run electron` launches.
 */
const electronBinary = require('electron');

/**
 * ChromeDriver shipped by `electron-chromedriver`. Its version is
 * locked to the `electron` package, so it always matches Electron's
 * bundled Chromium major version (ChromeDriver refuses mismatched
 * browsers).
 */
const chromedriverBinary = path.join(
  path.dirname(require.resolve('electron-chromedriver/package.json')),
  'bin',
  process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver'
);

if (!fs.existsSync(chromedriverBinary)) {
  throw new Error(
    `electron-chromedriver binary not found at ${chromedriverBinary}. ` +
    'Run `npm install` to (re)install it next to the `electron` package.'
  );
}

/**
 * The Chromium version Electron bundles, as reported by its
 * ChromeDriver ("ChromeDriver 150.0.7871.250 ..."). Declaring it as
 * `browserVersion` tells WebdriverIO not to probe the Electron binary
 * with `--version` — Electron reports its own version there (e.g.
 * "v43.5.1"), which WebdriverIO cannot parse as a Chrome version.
 */
const chromeVersion = (
  execFileSync(chromedriverBinary, ['--version'], { encoding: 'utf8' })
    .match(/ChromeDriver\s+(\d+\.\d+\.\d+\.\d+)/) || [])[1];

/**
 * The app directory itself (its package.json "main" points at
 * electron/main.js). Passed as a positional argument so Electron
 * launches the project, just like `electron .`.
 */
const appRoot = path.resolve(__dirname);

/** @type {import('node:child_process').ChildProcess|null} */
let devServer = null;

/**
 * Whether we spawned the dev server ourselves (and thus must stop it).
 * If something is already listening on the port we reuse it, so the
 * suite can also run against a dev server you started manually.
 */
let ownsDevServer = false;

/**
 * Poll the dev server until it answers (or time out).
 */
async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Dev server at ${url} did not start within ${timeoutMs}ms`);
}

export const config = {
  //
  // ====================
  // Runner Configuration
  // ====================
  //
  runner: 'local',

  /**
   * Directory containing test files. Vitest owns tests/unit/, so only
   * tests/e2e/ is matched here.
   */
  specs: ['./tests/e2e/**/*.spec.js'],

  /**
   * One Electron instance at a time keeps the shared webpack dev
   * server and console noise predictable.
   */
  maxInstances: 1,

  /**
   * Capabilities: launch the real Electron app through its own
   * version-locked ChromeDriver.
   *
   * - `wdio:chromedriverOptions.binary` tells WebdriverIO to use the
   *   electron-chromedriver binary instead of downloading one.
   * - `goog:chromeOptions.binary` points ChromeDriver at the Electron
   *   binary; ChromeDriver then starts the app and drives it over the
   *   WebDriver protocol. A fresh temporary user-data-dir is injected
   *   automatically, so every run starts with a clean profile.
   * - The trailing positional argument is the app directory
   *   (equivalent to `electron .`).
   * - `--no-sandbox`/`--disable-gpu`/`--disable-dev-shm-usage` keep
   *   the app happy in CI containers and under virtual displays.
   */
  capabilities: [
    {
      browserName: 'chrome',
      /**
       * Chromium version of the Electron binary (see above). Prevents
       * WebdriverIO's version auto-detection, which chokes on the
       * Electron binary.
       */
      browserVersion: chromeVersion,
      'wdio:chromedriverOptions': {
        binary: chromedriverBinary,
      },
      'goog:chromeOptions': {
        binary: electronBinary,
        args: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          appRoot,
        ],
      },
    },
  ],

  //
  // ==================
  // Services & Options
  // ==================
  //

  logLevel: 'warn',

  baseUrl: baseURL,

  /**
   * Default timeout for waitFor* commands and implicit waits.
   */
  waitforTimeout: 10000,

  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  //
  // ==================
  // Framework Settings
  // ==================
  //

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  reporters: ['spec'],

  /**
   * Start the webpack dev server before the Electron sessions launch
   * and shut it down when everything is done. The app's main process
   * detects this server and loads it, exactly like `npm run electron`
   * does in development.
   */
  async onPrepare() {
    // Reuse an already-running dev server instead of failing with
    // EADDRINUSE (set CI=1 to always require a fresh server).
    try {
      await fetch(baseURL, { signal: AbortSignal.timeout(2000) });
      console.log(`Reusing dev server already running at ${baseURL}`);
      return;
    } catch {
      // nothing listening — spawn one below
    }

    ownsDevServer = true;
    devServer = spawn('npm', ['start'], {
      detached: true,
      stdio: 'inherit',
    });
    await waitForServer(baseURL);
  },

  onComplete() {
    if (ownsDevServer && devServer && devServer.pid) {
      try {
        process.kill(-devServer.pid);
      } catch {
        // already gone
      }
    }
  },
};

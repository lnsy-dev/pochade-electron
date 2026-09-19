/**
 * WebdriverIO Configuration
 *
 * End-to-end test configuration for the Pochade-Electron template.
 *
 * For LLMs: these tests drive the REAL Electron app — the same binary
 * `npm run electron` launches — via the official Electron service
 * (@wdio/electron-service):
 *
 *   - The service detects the Electron binary in node_modules and the
 *     app entry point (package.json "main"), launches the app with the
 *     correct arguments, and manages a matching Chromedriver. Do NOT
 *     hand-roll a `goog:chromeOptions` launch here: modern Chromedriver
 *     mangles positional app paths into switches, and Electron then
 *     boots its default app instead of this project (the tests would
 *     silently run against the wrong app).
 *   - The app detects the webpack dev server started below and loads
 *     it, mirroring `npm run electron` development mode.
 *
 * They exercise the full stack: webpack bundling, the dev server,
 * Electron's main process and window, custom elements, WebAssembly,
 * and the node:sqlite database in the main process.
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
 * the database file persists between navigations — it lives in the
 * session data directory of the launched profile). Specs that touch
 * the database must clean up leftover entries in beforeEach — see
 * clearExistingEntries() in tests/helpers/e2e-utils.js. Each spec
 * file gets its own Electron instance with a fresh profile, so state
 * never leaks between spec files.
 *
 * Cleanup: a run that ends abnormally (crashed spec, failed session
 * delete, Ctrl+C) would otherwise leave Electron instances running.
 * killLeftoverElectronApps() below sweeps every instance the run
 * launched on normal completion AND on interrupt signals. Instances
 * that predate the run (e.g. a dev app someone left open from
 * `npm run electron`) are snapshotted first and never killed.
 */

import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the project-specific dev server port so WebdriverIO uses the same
// URL as `npm start` and `npm run electron`.
dotenv.config();

const port = process.env.PORT || 3000;
const baseURL = `http://localhost:${port}`;

/**
 * The app directory itself (its package.json "main" points at
 * electron/main.js). Given to the Electron service as the app to
 * launch — equivalent to `electron .`.
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

/**
 * PIDs of this project's Electron processes observed before the suite
 * started (e.g. a dev app from `npm run electron`). The cleanup sweep
 * must never kill these — they are not ours to close.
 */
const preExistingElectronPids = new Set();

/**
 * List PIDs of Electron processes belonging to THIS project, matched by
 * the electron binary inside this project's node_modules (the main
 * binary and every helper carry that path prefix). Returns [] on
 * Windows, which has no portable `ps` equivalent — the sweep is a no-op
 * there.
 *
 * @returns {number[]} Matching PIDs, or [] if process listing fails
 */
function projectElectronPids() {
  if (process.platform === 'win32') {
    return [];
  }
  const binaryPath = path.join(appRoot, 'node_modules', 'electron', 'dist');
  try {
    const listing = execSync('ps -axo pid=,command=', { encoding: 'utf8' });
    const pids = [];
    for (const line of listing.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);
      if (match && match[2].includes(binaryPath)) {
        pids.push(Number(match[1]));
      }
    }
    return pids;
  } catch {
    return [];
  }
}

/**
 * Kill every Electron instance this run launched that is still alive —
 * WebdriverIO normally deletes each spec's session, but crashed specs,
 * failed session deletes, and interrupts leave the app running.
 *
 * Instances recorded before the run started are spared, and the dev
 * server (if we own it) is shut down first so the app loses its
 * backend before it loses its window.
 */
function killLeftoverElectronApps() {
  stopOwnedDevServer();

  const orphans = projectElectronPids().filter(
    (pid) => !preExistingElectronPids.has(pid)
  );
  if (orphans.length === 0) {
    return;
  }

  for (const pid of orphans) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
  // Block briefly (the runner may exit right after this) so a hung app
  // that ignored SIGTERM can still be force-killed before we return.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  for (const pid of orphans) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  console.log(
    `Closed ${orphans.length} leftover Electron process(es) from this test run`
  );
}

/**
 * Shut down the dev server when we spawned it. Detached, so it has its
 * own process group and survives terminal Ctrl+C unless we kill it.
 */
function stopOwnedDevServer() {
  if (ownsDevServer && devServer && devServer.pid) {
    try {
      process.kill(-devServer.pid);
    } catch {
      // already gone
    }
  }
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
  /**
   * Launch the app through @wdio/electron-service, which knows how to
   * pass the app path to Electron correctly and picks a matching
   * Chromedriver automatically.
   *
   * `--no-sandbox`/`--disable-gpu`/`--disable-dev-shm-usage` keep the
   * app happy in CI containers and under virtual displays.
   */
  services: ['electron'],

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': {
        // Unpackaged app: point the service at the main-process entry
        // point (the package.json also carries an electron-builder
        // config, which would otherwise send the service looking for a
        // compiled binary in release/).
        appEntryPoint: path.join(appRoot, 'electron', 'main.js'),
        appArgs: [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
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
    // Remember Electron instances that predate this run so the cleanup
    // sweep spares them (they were not opened by this suite).
    for (const pid of projectElectronPids()) {
      preExistingElectronPids.add(pid);
    }

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
    stopOwnedDevServer();
    killLeftoverElectronApps();
  },
};

/**
 * onComplete does not fire when the runner itself is killed, so sweep
 * Electron instances (and the detached dev server) on interrupt too —
 * otherwise Ctrl+C or a `kill` of the runner orphans everything.
 * exit(130)/exit(143) are the conventional signal exit codes.
 */
for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    stopOwnedDevServer();
    killLeftoverElectronApps();
    process.exit(exitCode);
  });
}

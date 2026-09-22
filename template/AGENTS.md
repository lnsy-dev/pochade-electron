<!-- Version: 0.6.0 -->

# Agent Conventions for Pochade-Electron Projects

This file governs all code in this directory and its subdirectories.

## Versioning

### Application Version

The generated Electron app's `package.json` version starts at **0.1.0**. Whenever you update the app version for a build or release, follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (`X.0.0`): Breaking changes — removing or renaming user-facing features, changing data formats, or breaking the public API / protocol
- **MINOR** (`0.X.0`): New features, capabilities, or non-breaking additions
- **PATCH** (`0.0.X`): Bug fixes, performance improvements, or minor corrections with no new behavior

### This Document

This document follows [Semantic Versioning](https://semver.org/). Current version: **0.6.0**

Whenever you change this file, update the version in the comment above using these rules:

- **MAJOR** (`X.0.0`): Breaking changes — removing conventions, reversing existing rules, or changing patterns that invalidate current code
- **MINOR** (`0.X.0`): New conventions added — new sections, new allowed patterns, or new tooling guidance that doesn't affect existing code
- **PATCH** (`0.0.X`): Clarifications, typo fixes, rewordings, or formatting changes with no change in meaning

## Technology Stack

- **JavaScript**: Vanilla ES2020+ (no frameworks)
- **CSS**: Standard CSS with variables (no CSS-in-JS, no Shadow DOM)
- **Build Tool**: Webpack 5 with SWC transpilation
- **Custom Elements**: dataroom-js (extends HTMLElement)
- **Desktop**: Electron (main process in `electron/`, packaged with electron-builder)
- **Database**: Node's built-in `node:sqlite` (`DatabaseSync`) in the Electron main process
- **Local Files**: Chrome's File System Access API (`showSaveFilePicker` / `showOpenFilePicker`)
- **Workers**: Web Workers (classic inline bundling, plus one native module worker for SQLite)
- **WebAssembly**: C++ via Emscripten, Rust via wasm-pack
- **Testing**: WebdriverIO (e2e) and Vitest (unit) — see the Testing section below

## Code Style

### Comments

Use **DocBlock style comments** for all classes, methods, and exported functions:

```javascript
/**
 * Brief description.
 *
 * @param {string} paramName Description
 * @returns {number} Description
 */
```

Use inline `//` comments for implementation logic.

### Custom Elements

```javascript
import DataroomElement from 'dataroom-js';

class MyComponent extends DataroomElement {
  async initialize() {
    // Component setup
  }
}

if (!customElements.get('my-component')) {
  customElements.define('my-component', MyComponent);
}
```

Rules:
- Element names MUST contain a hyphen
- NEVER use Shadow DOM
- NEVER embed CSS in JavaScript
- Create CSS in `styles/<component-name>.css` and import in `index.css`
- `this.event(name, detail)` dispatches a non-bubbling CustomEvent on the element; to notify another component, call its methods directly (see `src/file-storage-component.js` calling `dbComponent.refresh()`)

### Command Panel

The app ships with a command palette (npm: `command-panel`): the `<command-panel>` element in `index.html`, wired up in `src/commands.js`. Users open it with the hamburger button in the upper right, `Cmd+P`/`Ctrl+P` (wired in `src/commands.js`), or the panel's built-in `open-keys="ctrl+shift+p"` attribute (`Cmd+Shift+P` also works on macOS).

**Adding a command** — append a `{ name, icon, action }` entry to `createDefaultCommands()` in `src/commands.js`:

```javascript
{
  name: 'Do The Thing',
  icon: '🎯',
  action: () => someComponent.doTheThing(), // may be async
}
```

Or register from anywhere after setup: `document.getElementById('command_panel').addCommand('Do The Thing', '🎯', callback)`. Actions reach app state through component public methods or `src/lib/` libraries — never by querying other components' internal DOM.

**Removing a command** — delete its entry from `createDefaultCommands()`. The package has no `removeCommand()`; to remove at runtime, filter the array:

```javascript
const commandPanel = document.getElementById('command_panel');
commandPanel.commands = commandPanel.commands.filter(
  (command) => command.name !== 'Do The Thing'
);
```

**Changing the open shortcut** — edit the `open-keys` attribute in `index.html` (e.g. `open-keys="alt+k"`; modifiers: `ctrl`, `shift`, `alt`, `cmd`). The `Cmd+P`/`Ctrl+P` handler lives separately in `src/commands.js` (`matchesPrimaryOpenShortcut`).

The panel emits `COMMAND-EXECUTED` `{ name, icon }` when the user picks an item — listen with `commandPanel.on('COMMAND-EXECUTED', callback)`. Panel styling comes from the package stylesheet imported in `index.css` and reads the `:root` theme variables from `styles/variables.css`; the hamburger button is styled in `styles/command-panel.css`.

### Database

- ALL SQL lives in `src/lib/database.js` — components never touch IPC directly
- Always use bound parameters (`?`) for user input; never interpolate strings into SQL
- The database service lives in `electron/database.js` (Node's built-in `node:sqlite`, `DatabaseSync`); keep that file free of Electron imports so it stays unit-testable in plain Node
- The renderer reaches the service only through the `window.electronDb` preload bridge exposed by `electron/preload.js` (IPC channel `pochade-db`); supported actions: `status`, `exec`, `query`, `export`, `import`
- The database persists to a real SQLite file on disk (`sessionData/app.sqlite3`). In a plain web browser (no preload bridge) the helpers reject with a descriptive error — always handle both cases (check `getStatus().persistent`)
- Export/import uses `db.serialize()` / `db.deserialize()` in the main process, wired to the File System Access API in `src/lib/file-storage.js`; imports must pass the `SQLite format 3\0` header check
- File System Access pickers MUST be invoked from a user gesture (click handler)

### Electron

- The `electron/` directory contains the Node/Electron main process. `electron/main.js` serves `dist/` over the privileged `app://` protocol because module workers, .wasm fetching, and the File System Access API all need a real secure origin (do not replace with `loadFile`)
- The renderer is plain web code: `contextIsolation: true`, `nodeIntegration: false` — do not add Node APIs to renderer code
- `ELECTRON_DEV_URL` is read from `.env` (default `http://localhost:3000`). Electron only loads the dev server when the probe receives an OK response with the `X-Pochade-Dev-Server` identity header; otherwise it falls back to `app://./index.html`
- Packaging config (electron-builder) lives in the `build` field of `package.json`

### Releases & Auto-Updates

- Packaged apps self-update via update.electronjs.org (see README.md → "Releases & Auto-Updates"). `electron/main.js` initializes it through `update-electron-app` inside `startAutoUpdater()`, guarded by `app.isPackaged` — do not call updater code anywhere else and never run it in development
- `electron-squirrel-startup` is imported at the top of `electron/main.js` and quits the app when Squirrel.Windows launches it during install/update/uninstall. Do not remove this guard: it creates Windows shortcuts and prevents windows popping up mid-update
- Windows is packaged with the `squirrel` target (NOT nsis) because Electron's built-in autoUpdater can only update Squirrel-installed apps; the `electron-builder-squirrel-windows` dev dependency provides that target
- To ship an update: bump `version` in `package.json`, commit, `git tag vX.Y.Z && git push origin vX.Y.Z`. CI (`.github/workflows/release.yml`) builds all platforms, attaches installers to a GitHub Release, and publishes the draft. Never hand-edit releases that CI created
- The updater resolves its feed from the `repository` field of `package.json`; if you rename or move the GitHub repo, update that field in the same change

### Web Workers

For classic (self-contained) workers, always use this exact syntax:

```javascript
const worker = new Worker(new URL('./my-worker.js', import.meta.url));
```

Never use string paths: `new Worker('./my-worker.js')` — bundlers cannot trace them.

For workers that import npm modules or `.wasm` files, use webpack 5's native module-worker syntax instead:

```javascript
const worker = new Worker(new URL('./my-worker.js', import.meta.url), { type: 'module' });
```

### WebAssembly

#### C++ (Emscripten)

- Place source in `src/wasm/cpp/<name>.cpp`
- Use `EMSCRIPTEN_KEEPALIVE` on exported functions
- Build with `npm run build:wasm:cpp`
- Load glue module with dynamic `import()`
- Use `cwrap()` to create typed JS functions

#### Rust (wasm-pack)

- Place crate in `src/wasm/rust/<crate-name>/`
- Use `#[wasm_bindgen]` on exported functions
- Build with `npm run build:wasm:rust`
- Load pkg module with dynamic `import()`
- Call `await module.default()` before using exports

### Testing

**Directive:** Write and run tests for every feature you add or change. Keep both suites green, and add a matching test whenever you introduce new behavior.

#### E2E Tests (WebdriverIO)

- Use `webdriverio` globals (`browser`, `$`, `$$`, `expect` from `@wdio/globals`); place tests in `tests/e2e/*.spec.js`
- Run with `npm test`; the webpack dev server starts automatically via `onPrepare` in `wdio.conf.js`. Tests run in the real Electron app: `electron-chromedriver` (version-locked to the `electron` package) launches the Electron binary with the project directory, so no system Chrome is involved
- Use `$("selector")` for element selection and `browser.execute()` for custom events; shared helpers live in `tests/helpers/e2e-utils.js` (`findButton`, `addNote`, …)
- Use 15-second timeouts for wasm-dependent assertions (`browser.waitUntil(..., { timeout: 15000 })`)
- One Electron session is SHARED across tests in a spec file and the SQLite database persists across navigations — specs that touch `<db-component>` must call `clearExistingEntries()` in `beforeEach`
- The File System Access pickers (`showSaveFilePicker`/`showOpenFilePicker`) are native dialogs that automation cannot click — stub them with `browser.addInitScript()` and assert how the app drives the API, as in `tests/e2e/file-storage-component.spec.js`. Init scripts accumulate over the session, so later mocks must overwrite earlier ones and conflicting tests must run last
- The wasm e2e specs (`wasm-cpp-component.spec.js`, `wasm-rust-component.spec.js`) exist only when the corresponding WASM option was selected at scaffolding time

##### Closing Electron Apps

Every Electron instance opened for testing MUST be closed when it is no longer needed — never finish a task with Electron processes from this project still running:

- WebdriverIO terminates each spec's Electron session automatically, and `wdio.conf.js` additionally sweeps instances the run launched (`killLeftoverElectronApps`) on completion AND on Ctrl+C/`SIGTERM` — do not remove or bypass these hooks. The sweep spares instances that were already running before the suite started, so a dev app you opened with `npm run electron` is never killed by a test run
- If a run crashes mid-suite or was interrupted before the sweep existed, check for orphans and kill them before starting new work: `ps ax -o pid,command | grep "node_modules/electron/dist"` (macOS/Linux), then `kill <pid>` for any match from this project
- When verifying a fix manually with `npm run electron`, quit the app (Cmd+Q, or Ctrl+C for `npm run electron`) before running the e2e suite or moving on

#### Unit Tests (Vitest)

- Use `vitest`; place tests in `tests/unit/*.test.js`; run with `npm run test:unit`
- Unit tests run in Node with explicit mocks — no dev server, no DOM emulation layer
- `src/lib/database.js` is tested against a fake `window.electronDb` bridge that captures (action, params) pairs (assert exact action names, SQL, and bound params)
- `electron/database.js` (the `node:sqlite` service) is tested against a real SQLite file in a temporary directory — not mocks
- Browser API wrappers (`src/lib/file-storage.js`) are tested with `vi.stubGlobal('window', ...)` fakes
- New logic MUST ship with unit tests in the same change

### State Management

- Use component instance properties (`this.propertyName`)
- Emit custom events for cross-component communication via `this.event('name', detail)`
- Listen to events via `this.on('name', callback)` or `this.once('name', callback)`

### HTTP Requests

- Use `this.getJSON(url)` for simple GET requests to JSON endpoints
- Use `this.call(endpoint, body)` for POST requests with auth/timeout support
- Always wrap in `try/catch` for error handling

## File Organization

| Directory | Purpose |
|-----------|---------|
| `src/` | JavaScript modules and components |
| `src/lib/` | Framework-free libraries (database client, file storage) |
| `electron/database.js` | The `node:sqlite` database service (main process) |
| `src/wasm/` | WebAssembly source files and binaries |
| `electron/` | Electron main process |
| `styles/` | CSS files (one per component or concern) |
| `tests/` | Test files (see Testing section) |
| `scripts/` | Build-time transformation scripts |
| `assets/` | Static files (images, fonts, etc.) |

## Prohibited Patterns

- ❌ TypeScript
- ❌ React/Vue/Angular/Svelte
- ❌ Shadow DOM
- ❌ CSS-in-JS (styled-components, emotion, etc.)
- ❌ Inline styles in JavaScript
- ❌ Framework-specific state managers (Redux, Pinia, etc.)
- ❌ jQuery or similar DOM wrappers
- ❌ `new Worker('./relative-path.js')` (use `new URL(..., import.meta.url)`)
- ❌ Node/Electron APIs in renderer code (`src/`, `index.js`) — keep them in `electron/`
- ❌ SQL string interpolation with user input — always use bound parameters

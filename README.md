# Pochade-Electron
## For Writing JS with Passion

There are some frameworks for writing careful enterprise software. This is not one of them.

Pochade-Electron is an `npx` project scaffolder — a lightweight, opinionated starter template for building apps that ship as **both an Electron desktop app and a static, front-end-only web app** — with SQLite local persistence and optional C++/Rust WebAssembly, all in vanilla JavaScript.

Docs and demo: https://lnsy-dev.github.io/pochade-electron/

## Requirements

- **Node.js 18+** and npm
- **Chrome or Edge** (or the generated app's own Electron shell) for OPFS persistence and the File System Access API
- Optional, only if you pick WASM support and want to *rebuild* it: [Emscripten](https://emscripten.org/) (C++) and/or [wasm-pack](https://rustwasm.github.io/wasm-pack/) (Rust). Prebuilt binaries are included, so the template works without any toolchain.

## What is Pochade-Electron?

Pochade-Electron provides a streamlined development environment with:

- **Dual targets** - One codebase: `npm run build` produces a static web app (`dist/`), `npm run electron` runs it as a desktop app, `npm run electron:build` packages it with electron-builder
- **SQLite in the browser** - [`@sqlite.org/sqlite-wasm`](https://www.npmjs.com/package/@sqlite.org/sqlite-wasm) running in a web worker, with read/write of entries and index generation out of the box
- **Chrome file APIs for local storage** - OPFS (Origin Private File System) persistence for the database, plus the File System Access API (`showSaveFilePicker` / `showOpenFilePicker`) to export/import the database file — both work in Chrome and in Electron's renderer
- **Custom HTML Elements** - Built-in support for [dataroom-js](https://github.com/DATAROOM-NETWORK/dataroom.js)
- **WebAssembly** - Optional C++ (Emscripten) and/or Rust (wasm-pack) examples, with prebuilt binaries so it works before you install any toolchain
- **Modern tooling** - Webpack 5, SWC, PostCSS/cssnano

## Quick Start

```sh
npx pochade-electron my-project
```

The CLI will guide you through setup with interactive prompts:

- **WebAssembly support** - None, C++ (Emscripten), Rust (wasm-pack), or both
- **Project title / description / URLs** - Metadata for the generated app
- **Author name / email / GitHub username / license** - For `package.json`

After answering the prompts, Pochade-Electron will:

1. Create your project directory
2. Copy all template files and prune the WASM examples you didn't pick
3. Configure `package.json` (including the electron-builder `appId`/`productName`)
4. Update `index.html` with your project metadata
5. Install all dependencies automatically

Then:

```sh
cd my-project
npm start          # web dev server at http://localhost:3000
```

In a second terminal:

```sh
npm run electron   # the same app as a desktop app (hot-reloads against the dev server)
```

## Inside the Generated Project

| Command | Purpose |
|---------|---------|
| `npm start` | Start the web development server |
| `npm run build` | Build the static web app into `dist/` |
| `npm run electron` | Launch in Electron (dev server if running, else `dist/`) |
| `npm run electron:build` | Build and package the desktop app into `release/` |
| `npm test` | Run the WebdriverIO e2e tests against the real Electron app (`electron-chromedriver` included; headless CI needs xvfb) |
| `npm run test:unit` | Run the Vitest unit tests |
| `npm run build:wasm:cpp` | Rebuild the C++ wasm example (needs Emscripten) |
| `npm run build:wasm:rust` | Rebuild the Rust wasm example (needs wasm-pack) |

## A Note on OPFS Persistence

The SQLite database persists in OPFS (Origin Private File System) via sqlite-wasm's "opfs-sahpool" VFS. Unlike the classic OPFS VFS, this needs **no cross-origin isolation headers** — the generated app persists data out of the box on any static host, in the Electron renderer, and in any modern browser (Chrome, Edge, Firefox, Safari). If OPFS is ever unavailable, the app still works with a transient in-memory database, and users can export/import it as a file via the File System Access API.

## Philosophy

Same as Pochade-JS: no framework lock-in, no Shadow DOM, no CSS-in-JS, no complex build chains. Write JavaScript, not framework code.

## License

Unlicense (Public Domain)

## Credits

Created by [LNSY](https://github.com/lnsy-dev), modeled on [pochade-js](https://github.com/lnsy-dev/pochade-js).

Write JS with passion! 🎨

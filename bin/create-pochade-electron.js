#!/usr/bin/env node

/**
 * create-pochade-electron
 *
 * Creates a new Pochade-Electron project from the template.
 * The generated project builds both an Electron desktop app and a
 * static front-end-only web app, with sqlite-wasm local persistence
 * (OPFS + Chrome's File System Access API) and optional C++/Rust
 * WebAssembly support.
 *
 * Usage: npx pochade-electron my-app
 *
 * @module create-pochade-electron
 */

const spawn = require('cross-spawn');
const fs = require('fs');
const net = require('net');
const path = require('path');
const readline = require('readline');

/**
 * Creates a line reader that queues lines from stdin.
 * This avoids losing buffered lines when reading sequentially,
 * which can happen with readline.question() on piped input.
 *
 * @returns {{nextLine: () => Promise<string|undefined>, close: () => void}}
 */
function createLineReader() {
  const rl = readline.createInterface({ input: process.stdin });
  const lines = [];
  let resolveNext = null;
  let closed = false;

  rl.on('line', (line) => {
    if (resolveNext) {
      resolveNext(line);
      resolveNext = null;
    } else {
      lines.push(line);
    }
  });

  rl.on('close', () => {
    closed = true;
    if (resolveNext) resolveNext(undefined);
  });

  return {
    async nextLine() {
      if (lines.length > 0) {
        return lines.shift();
      }
      if (closed) return undefined;
      return new Promise((resolve) => { resolveNext = resolve; });
    },
    close() { rl.close(); }
  };
}

/**
 * Prompts the user with a question and returns their answer
 *
 * @param {object} reader - The line reader
 * @param {string} question - The question to ask
 * @param {string} defaultValue - Optional default value
 * @returns {Promise<string>} The user's answer
 */
async function ask(reader, question, defaultValue = '') {
  const prompt = defaultValue
    ? `${question} (${defaultValue}): `
    : `${question}: `;
  process.stdout.write(prompt);
  const answer = await reader.nextLine();
  return (answer ?? '').trim() || defaultValue;
}

/**
 * Prompts the user to choose from a numbered list of options
 *
 * @param {object} reader - The line reader
 * @param {string} question - The question to ask
 * @param {Array<{label: string, value: string}>} options - Available options
 * @param {string} defaultValue - Default value if user presses enter
 * @returns {Promise<string>} The selected option value
 */
async function askChoice(reader, question, options, defaultValue) {
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const marker = opt.value === defaultValue ? ' [default]' : '';
    console.log(`  ${i + 1}. ${opt.label}${marker}`);
  });
  const defaultIndex = options.findIndex(o => o.value === defaultValue);
  const prompt = `Enter choice (1-${options.length}) [${defaultIndex + 1}]: `;
  process.stdout.write(prompt);

  const answer = await reader.nextLine();
  const trimmed = (answer ?? '').trim();
  if (!trimmed) {
    return defaultValue;
  }
  const num = parseInt(trimmed, 10);
  if (Number.isNaN(num) || num < 1 || num > options.length) {
    console.log(`Invalid choice. Using default (${defaultIndex + 1}).`);
    return defaultValue;
  }
  return options[num - 1].value;
}

/**
 * Collects project configuration from user input
 *
 * @param {string} projectName - The project name
 * @returns {Promise<object>} Configuration object with all project details
 */
async function collectProjectInfo(projectName) {
  const reader = createLineReader();

  const logo = ".-. .-. .-. . . .-. .-. .-.   . .-. .   .-. .-. .-. .-. .-. . . .-.\r\n|-' | | |   |-| |-| |  )|-    | |-  |   |-  |    |  |(  | | | | |\\|\r\n'   `-' `-' ' ` ` ' `-' `-' `-' `-' `-' `-' `-'  '  ' ' `-' `-' ' ` '\r\n       Write JS with Passion\r\n             By LNSY\r\n"
  console.log(logo);

  console.log('\n📝 Let\'s set up your Pochade-Electron project!\n');

  const wasmOptions = [
    { label: 'None', value: 'none' },
    { label: 'C++ (Emscripten)', value: 'cpp' },
    { label: 'Rust (wasm-pack)', value: 'rust' },
    { label: 'Both C++ and Rust', value: 'both' }
  ];

  const wasmChoice = await askChoice(reader, 'Include WebAssembly support?', wasmOptions, 'none');

  const config = {
    project_name: projectName,
    project_title: await ask(reader, 'Project title', projectName),
    project_description: await ask(reader, 'Project description', 'An Electron and web app with SQLite local storage'),
    project_url: await ask(reader, 'Project URL (where it will be hosted)', ''),
    project_image_url: await ask(reader, 'Project image URL (for social sharing)', ''),
    project_alt_text: await ask(reader, 'Project image alt text', ''),
    project_sitename: await ask(reader, 'Project site name', projectName),
    author_name: await ask(reader, 'Author name', ''),
    author_email: await ask(reader, 'Author email', ''),
    github_username: await ask(reader, 'GitHub username', ''),
    license: await ask(reader, 'License', 'Unlicense'),
    wasm_choice: wasmChoice
  };

  reader.close();

  return config;
}

/**
 * Replaces template variables in a string with actual values
 *
 * @param {string} content - The content with template variables
 * @param {object} config - Configuration object with values
 * @returns {string} Content with variables replaced
 */
function replaceTemplateVariables(content, config) {
  return content
    .replace(/\$\{project_title\}/g, config.project_title)
    .replace(/\$\{project_description\}/g, config.project_description)
    .replace(/\$\{project_url\}/g, config.project_url)
    .replace(/\$\{project_image_url\}/g, config.project_image_url)
    .replace(/\$\{project_alt_text\}/g, config.project_alt_text)
    .replace(/\$\{project_sitename\}/g, config.project_sitename);
}

/**
 * Updates the index.html file with project-specific values
 *
 * @param {string} projectDir - The project directory path
 * @param {object} config - Configuration object
 * @returns {void}
 */
function updateIndexHtml(projectDir, config) {
  const indexPath = path.join(projectDir, 'index.html');
  let content = fs.readFileSync(indexPath, 'utf-8');
  content = replaceTemplateVariables(content, config);
  fs.writeFileSync(indexPath, content, 'utf-8');
}

/**
 * Removes blocks delimited by start and end markers from content
 *
 * @param {string} content - The file content
 * @param {string} startMarker - The start marker
 * @param {string} endMarker - The end marker
 * @returns {string} Content with the marked blocks removed
 */
function removeMarkedBlocks(content, startMarker, endMarker) {
  const regex = new RegExp(
    startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    'g'
  );
  return content.replace(regex, '');
}

/**
 * Recursively removes a directory and all its contents
 *
 * @param {string} dirPath - The directory path to remove
 * @returns {void}
 */
function removeDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Converts a project name into a valid electron-builder appId segment
 * (reverse-DNS style, e.g. "My App!" -> "com.myapp.app")
 *
 * @param {string} projectName - The raw project name
 * @returns {string} A sanitized appId
 */
function toAppId(projectName) {
  let segment = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!segment || !/^[a-z]/.test(segment)) {
    segment = `app${segment}`;
  }
  return `com.${segment}.app`;
}

/** Lower bound of the IANA dynamic/private port range. */
const MIN_RANDOM_PORT = 49152;

/** Upper bound of the IANA dynamic/private port range. */
const MAX_RANDOM_PORT = 65535;

/** Number of attempts to find a free random port. */
const PORT_FIND_ATTEMPTS = 20;

/**
 * Generate a random integer in the dynamic/private port range.
 *
 * @returns {number} A port between MIN_RANDOM_PORT and MAX_RANDOM_PORT
 */
function getRandomPort() {
  return Math.floor(Math.random() * (MAX_RANDOM_PORT - MIN_RANDOM_PORT + 1)) + MIN_RANDOM_PORT;
}

/**
 * Check whether a TCP port is available on 127.0.0.1.
 *
 * @param {number} port - Port to test
 * @returns {Promise<boolean>} True if the port is free
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Pick a random available port in the dynamic/private range.
 *
 * @returns {Promise<number>} An available port
 */
async function findAvailablePort() {
  for (let i = 0; i < PORT_FIND_ATTEMPTS; i++) {
    const port = getRandomPort();
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port after ${PORT_FIND_ATTEMPTS} attempts.`);
}

/**
 * Create a project-local .env file from .env.example with a unique
 * development port. The same port is used by `npm start` (webpack) and
 * `npm run electron`, so the two processes agree on the dev server URL.
 *
 * @param {string} projectDir - The project directory path
 * @returns {Promise<{port: number, devServerUrl: string}>} The chosen port and URL
 */
async function createEnvFile(projectDir) {
  const port = await findAvailablePort();
  const devServerUrl = `http://localhost:${port}`;

  const envExamplePath = path.join(projectDir, '.env.example');
  const envPath = path.join(projectDir, '.env');

  let envContent = fs.existsSync(envExamplePath)
    ? fs.readFileSync(envExamplePath, 'utf-8')
    : '';

  envContent = envContent
    .replace(/^PORT=.*$/m, `PORT=${port}`)
    .replace(/^ELECTRON_DEV_URL=.*$/m, `ELECTRON_DEV_URL=${devServerUrl}`);

  fs.writeFileSync(envPath, envContent, 'utf-8');

  return { port, devServerUrl };
}

/**
 * Configures WebAssembly support in the generated project based on user choice
 *
 * @param {string} projectDir - The project directory path
 * @param {object} config - Configuration object
 * @returns {void}
 */
function configureWasmSupport(projectDir, config) {
  const choice = config.wasm_choice;

  const includeCpp = choice === 'cpp' || choice === 'both';
  const includeRust = choice === 'rust' || choice === 'both';

  // Delete unwanted WASM source files, components, and their e2e specs
  if (!includeCpp) {
    removeDir(path.join(projectDir, 'src', 'wasm', 'cpp'));
    const cppComponent = path.join(projectDir, 'src', 'wasm-cpp-component.js');
    const cppTest = path.join(projectDir, 'tests', 'e2e', 'wasm-cpp-component.spec.js');
    if (fs.existsSync(cppComponent)) fs.unlinkSync(cppComponent);
    if (fs.existsSync(cppTest)) fs.unlinkSync(cppTest);
  }

  if (!includeRust) {
    removeDir(path.join(projectDir, 'src', 'wasm', 'rust'));
    const rustComponent = path.join(projectDir, 'src', 'wasm-rust-component.js');
    const rustTest = path.join(projectDir, 'tests', 'e2e', 'wasm-rust-component.spec.js');
    if (fs.existsSync(rustComponent)) fs.unlinkSync(rustComponent);
    if (fs.existsSync(rustTest)) fs.unlinkSync(rustTest);
  }

  // Remove empty wasm directory if nothing is left
  if (choice === 'none') {
    const wasmDir = path.join(projectDir, 'src', 'wasm');
    if (fs.existsSync(wasmDir)) {
      const remaining = fs.readdirSync(wasmDir);
      if (remaining.length === 0) {
        fs.rmdirSync(wasmDir);
      }
    }
  }

  // Strip marker blocks from index.js
  const indexJsPath = path.join(projectDir, 'index.js');
  if (fs.existsSync(indexJsPath)) {
    let indexJs = fs.readFileSync(indexJsPath, 'utf-8');
    if (!includeCpp) {
      indexJs = removeMarkedBlocks(indexJs, '// <WASM-CPP>', '// </WASM-CPP>');
    }
    if (!includeRust) {
      indexJs = removeMarkedBlocks(indexJs, '// <WASM-RUST>', '// </WASM-RUST>');
    }
    fs.writeFileSync(indexJsPath, indexJs, 'utf-8');
  }

  // Strip marker blocks from index.html.
  // The inline <script> uses JS-style markers (// <WASM-...>), so both
  // comment styles must be stripped here.
  const indexHtmlPath = path.join(projectDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');
    if (!includeCpp) {
      indexHtml = removeMarkedBlocks(indexHtml, '<!-- <WASM-CPP> -->', '<!-- </WASM-CPP> -->');
      indexHtml = removeMarkedBlocks(indexHtml, '// <WASM-CPP>', '// </WASM-CPP>');
    }
    if (!includeRust) {
      indexHtml = removeMarkedBlocks(indexHtml, '<!-- <WASM-RUST> -->', '<!-- </WASM-RUST> -->');
      indexHtml = removeMarkedBlocks(indexHtml, '// <WASM-RUST>', '// </WASM-RUST>');
    }
    if (choice === 'none') {
      indexHtml = removeMarkedBlocks(indexHtml, '<!-- <WASM-SECTION> -->', '<!-- </WASM-SECTION> -->');
    }
    fs.writeFileSync(indexHtmlPath, indexHtml, 'utf-8');
  }

  // Strip marker blocks from index.css and remove unused stylesheet
  const indexCssPath = path.join(projectDir, 'index.css');
  if (fs.existsSync(indexCssPath)) {
    let indexCss = fs.readFileSync(indexCssPath, 'utf-8');
    if (choice === 'none') {
      indexCss = removeMarkedBlocks(indexCss, '/* <WASM> */', '/* </WASM> */');
      const wasmCss = path.join(projectDir, 'styles', 'wasm-components.css');
      if (fs.existsSync(wasmCss)) fs.unlinkSync(wasmCss);
    }
    fs.writeFileSync(indexCssPath, indexCss, 'utf-8');
  }

  // Update package.json
  const packageJsonPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    if (!includeCpp && pkg.scripts && pkg.scripts['build:wasm:cpp']) {
      delete pkg.scripts['build:wasm:cpp'];
    }
    if (!includeRust && pkg.scripts && pkg.scripts['build:wasm:rust']) {
      delete pkg.scripts['build:wasm:rust'];
    }

    if (choice === 'none' && Array.isArray(pkg.keywords)) {
      pkg.keywords = pkg.keywords.filter(k => k !== 'webassembly');
    }

    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
  }
}

/**
 * Main function to create a new Pochade-Electron project
 *
 * @returns {Promise<void>}
 */
async function createProject() {
  // The first argument will be the project name.
  const projectName = process.argv[2];

  // Validate project name
  if (!projectName) {
    console.error('Error: Please specify the project name.');
    console.log('Usage: npx pochade-electron <project-name>');
    process.exit(1);
  }

  // Create a project directory with the project name.
  const currentDir = process.cwd();
  const projectDir = path.resolve(currentDir, projectName);

  // Check if directory already exists
  if (fs.existsSync(projectDir)) {
    console.error(`Error: Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  // Collect project information from user
  const config = await collectProjectInfo(projectName);

  console.log(`\n🚀 Creating a new Pochade-Electron project in ${projectDir}...`);

  // Create the project directory
  fs.mkdirSync(projectDir, { recursive: true });

  // Copy template files
  const templateDir = path.resolve(__dirname, '..', 'template');

  if (!fs.existsSync(templateDir)) {
    console.error('Error: Template directory not found.');
    process.exit(1);
  }

  fs.cpSync(templateDir, projectDir, { recursive: true });

  // Rename dotfiles (stored without dots in template)
  const dotfiles = [
    { from: 'gitignore', to: '.gitignore' },
    { from: 'npmignore', to: '.npmignore' }
  ];

  dotfiles.forEach(({ from, to }) => {
    const fromPath = path.join(projectDir, from);
    const toPath = path.join(projectDir, to);
    if (fs.existsSync(fromPath)) {
      fs.renameSync(fromPath, toPath);
    }
  });

  // Assign a random available dev server port so new projects do not collide
  // with an existing service on port 3000 (or with each other).
  const { port: devPort } = await createEnvFile(projectDir);

  // Update index.html with project-specific values
  updateIndexHtml(projectDir, config);

  // Configure WASM support based on user choice
  configureWasmSupport(projectDir, config);

  // Update package.json with the new project information
  const packageJsonPath = path.join(projectDir, 'package.json');
  const projectPackageJson = require(packageJsonPath);
  projectPackageJson.name = config.project_name;
  projectPackageJson.version = '1.0.0';
  projectPackageJson.description = config.project_description;
  projectPackageJson.license = config.license;

  // Update author information
  if (config.author_name || config.author_email) {
    const authorString = config.author_email
      ? `${config.author_name} <${config.author_email}>`
      : config.author_name;
    projectPackageJson.author = authorString;
  } else {
    delete projectPackageJson.author;
  }

  // Update repository information
  if (config.github_username) {
    const repoUrl = `https://github.com/${config.github_username}/${config.project_name}.git`;
    projectPackageJson.repository = {
      type: 'git',
      url: repoUrl
    };
    projectPackageJson.bugs = {
      url: `https://github.com/${config.github_username}/${config.project_name}/issues`
    };
    projectPackageJson.homepage = `https://github.com/${config.github_username}/${config.project_name}#readme`;
  }

  // Electron packaging identity (used by electron-builder)
  projectPackageJson.build = projectPackageJson.build || {};
  projectPackageJson.build.appId = toAppId(config.project_name);
  projectPackageJson.build.productName = config.project_title;

  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(projectPackageJson, null, 2)
  );

  console.log('\n📦 Installing dependencies (this includes Electron and may take a while)...');

  // Run `npm install` in the project directory
  const installResult = spawn.sync('npm', ['install'], {
    cwd: projectDir,
    stdio: 'inherit'
  });

  if (installResult.status !== 0) {
    console.error('\n❌ Error: npm install failed.');
    process.exit(1);
  }

  console.log('\n✨ Success! Your new Pochade-Electron project is ready.');
  console.log(`\n📁 Created ${projectName} at ${projectDir}`);
  console.log('\n📚 Inside that directory, you can run several commands:');
  console.log('\n  npm start');
  console.log(`    Starts the web development server (http://localhost:${devPort}).`);
  console.log('\n  npm run electron');
  console.log('    Launches the app in Electron (uses the dev server when it is running).');
  console.log('\n  npm run build');
  console.log('    Builds the static web app for production into dist/.');
  console.log('\n  npm run electron:build');
  console.log('    Builds and packages the Electron app into release/.');
  console.log('\n  npm test');
  console.log('    Runs the Playwright end-to-end tests (first run: npx playwright install chromium).');
  console.log('\n  npm run test:unit');
  console.log('    Runs the Vitest unit tests.');
  console.log('\n💡 We suggest that you begin by typing:');
  console.log(`\n  cd ${projectName}`);
  console.log('  npm start');
  console.log('\n🎨 Happy coding!');
}

createProject();

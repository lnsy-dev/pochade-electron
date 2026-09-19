/**
 * Command Panel Setup
 *
 * Wires the <command-panel> element (npm: command-panel) into the app:
 *   - Registers the default commands (see createDefaultCommands)
 *   - Opens the panel from the hamburger button in the upper right
 *   - Opens the panel with Cmd+P / Ctrl+P; the element's own
 *     open-keys="ctrl+shift+p" attribute covers Ctrl+Shift+P
 *
 * For LLMs: commands are plain { name, icon, action } objects. To add one,
 * append an entry in createDefaultCommands(); to remove one, delete the
 * entry. See AGENTS.md → "Command Panel" for the full conventions.
 *
 * Events emitted (command-panel's dataroom-js this.event):
 *   COMMAND-EXECUTED  { name, icon }
 */

import 'command-panel';
import { addNote } from './lib/database.js';

/**
 * Decide whether a keydown event matches the app-level "open command
 * panel" shortcut: Cmd+P (macOS) or Ctrl+P (Windows/Linux), without
 * Shift or Alt.
 *
 * The Shift variants are handled by the <command-panel> element itself
 * (open-keys="ctrl+shift+p" in index.html) — don't duplicate them here.
 *
 * @param {KeyboardEvent} event - The DOM keydown event
 * @returns {boolean} True when the event should open the panel
 */
export function matchesPrimaryOpenShortcut(event) {
  if (!event || typeof event.key !== 'string') {
    return false;
  }
  if (event.key.toLowerCase() !== 'p') {
    return false;
  }
  if (event.altKey || event.shiftKey) {
    return false;
  }
  return Boolean(event.metaKey || event.ctrlKey);
}

/**
 * Build the default command list for the command panel.
 *
 * Each command is a { name, icon, action } object; registerCommands()
 * passes them to the panel's addCommand(name, icon, callback). Actions
 * may be async — the panel invokes them fire-and-forget and closes.
 *
 * Commands that talk to the database go through the components' public
 * methods (or src/lib/database.js directly), never through the DOM.
 *
 * @param {object} components - The components the commands act on
 * @param {object} components.dbComponent - <db-component> instance
 * @param {object} components.fileStorageComponent - <file-storage-component> instance
 * @returns {Array<{name: string, icon: string, action: () => (void|Promise<void>)}>}
 */
export function createDefaultCommands({ dbComponent, fileStorageComponent }) {
  return [
    {
      name: 'Add Example Note',
      icon: '📝',
      action: async () => {
        try {
          await addNote(`Created from the command panel at ${new Date().toLocaleString()}`);
          await dbComponent.refresh();
        } catch (error) {
          console.error('Command "Add Example Note" failed:', error);
        }
      },
    },
    {
      name: 'Create Notes Index',
      icon: '🗂️',
      action: () => dbComponent.createIndex(),
    },
    {
      name: 'Refresh Notes',
      icon: '🔄',
      action: () => dbComponent.refresh(),
    },
    {
      name: 'Export Database to File',
      icon: '💾',
      action: () => fileStorageComponent.exportToFile(),
    },
    {
      name: 'Import Database from File',
      icon: '📂',
      action: () => fileStorageComponent.importFromFile(),
    },
  ];
}

/**
 * Register a list of { name, icon, action } commands on the panel.
 *
 * @param {HTMLElement} commandPanel - The <command-panel> element
 * @param {Array<{name: string, icon: string, action: Function}>} commands - Commands to add
 */
export function registerCommands(commandPanel, commands) {
  commands.forEach(({ name, icon, action }) => {
    commandPanel.addCommand(name, icon, action);
  });
}

/**
 * Whether the panel's <dialog> is currently showing.
 *
 * The package stores its dialog as `panel.dialog` once initialize() ran;
 * showModal() throws when called on an already-open dialog, so both open
 * paths below guard with this check.
 *
 * @param {HTMLElement} commandPanel - The <command-panel> element
 * @returns {boolean} True when the dialog is open
 */
function isPanelOpen(commandPanel) {
  return Boolean(commandPanel.dialog && commandPanel.dialog.open);
}

/**
 * Wire up the command panel: register the default commands, the
 * hamburger button, and the app-level Cmd+P / Ctrl+P shortcut.
 *
 * @async
 * @returns {Promise<void>}
 */
export async function setupCommandPanel() {
  // Resolves once the 'command-panel' module has defined the element
  await customElements.whenDefined('command-panel');

  const commandPanel = document.getElementById('command_panel');
  const openButton = document.getElementById('command_panel_button');
  if (!commandPanel || !openButton) {
    return;
  }

  registerCommands(
    commandPanel,
    createDefaultCommands({
      dbComponent: document.getElementById('db_component'),
      fileStorageComponent: document.getElementById('file_storage_component'),
    })
  );

  // Hamburger button (upper right) opens the panel
  openButton.addEventListener('click', () => {
    if (!isPanelOpen(commandPanel)) {
      commandPanel.openPanel();
    }
  });

  // App-level shortcut: Cmd+P (macOS) / Ctrl+P (other platforms).
  // Ctrl+Shift+P is handled by the element's own open-keys listener.
  document.addEventListener('keydown', (event) => {
    if (!matchesPrimaryOpenShortcut(event)) {
      return;
    }
    // preventDefault stops the browser's print dialog on Cmd/Ctrl+P
    event.preventDefault();
    if (!isPanelOpen(commandPanel)) {
      commandPanel.openPanel();
    }
  });

  // Surface command executions on the console, matching the event
  // listeners in index.html
  commandPanel.on('COMMAND-EXECUTED', ({ name }) => {
    console.log('[Command Panel] Executed:', name);
  });
}

// Run once, when the DOM is ready. Guarded so unit tests can import this
// module in plain Node (no DOM) without triggering side effects.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCommandPanel);
  } else {
    setupCommandPanel();
  }
}

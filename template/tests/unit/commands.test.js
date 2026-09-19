/**
 * Command Panel Setup Unit Tests
 *
 * Unit tests for src/commands.js — the module that registers the
 * default commands and the app-level open shortcuts for the
 * <command-panel> element (npm: command-panel).
 *
 * The 'command-panel' package is mocked (its dist bundle touches
 * browser-only globals at import time); these tests pin down:
 *   - which default commands exist and what they do
 *   - that "Add Example Note" writes through the electronDb bridge
 *     and refreshes <db-component>
 *   - that registerCommands forwards (name, icon, action) to addCommand
 *   - the Cmd+P / Ctrl+P shortcut matcher (and its Shift/Alt/other-key
 *     rejections, which belong to the panel's own open-keys handler)
 *
 * For LLMs: when adding a default command in src/commands.js, add the
 * matching test here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The package's dist bundle references customElements/document at import
// time — replace it with an inert stand-in (only the default export is used).
vi.mock('command-panel', () => ({
  default: class CommandPanelMock {},
}));

/**
 * Fake electronDb preload bridge. Records every call it receives and
 * answers with the scripted handler (default: `null`).
 */
const fakeBridge = {
  calls: [],
  handler: null,

  /**
   * Bridge entry point (mirrors window.electronDb.call).
   *
   * @param {string} action - Action name
   * @param {object} params - Action parameters
   * @returns {Promise<any>} The scripted result
   */
  call(action, params) {
    this.calls.push({ action, params });
    const handler = this.handler || (() => null);
    return new Promise((resolve, reject) => {
      try {
        resolve(handler(action, params));
      } catch (error) {
        reject(error);
      }
    });
  },
};

/**
 * Build fake db/file-storage components whose methods are spies.
 *
 * @returns {{dbComponent: object, fileStorageComponent: object}}
 */
function makeFakeComponents() {
  return {
    dbComponent: {
      refresh: vi.fn().mockResolvedValue(undefined),
      createIndex: vi.fn().mockResolvedValue(undefined),
    },
    fileStorageComponent: {
      exportToFile: vi.fn().mockResolvedValue(undefined),
      importFromFile: vi.fn().mockResolvedValue(undefined),
    },
  };
}

/** @returns {Promise<object>} The freshly imported commands module */
async function importCommandsModule() {
  return await import('../../src/commands.js');
}

describe('command panel shortcuts', () => {
  it('matches Cmd+P and Ctrl+P (case-insensitive)', async () => {
    const { matchesPrimaryOpenShortcut } = await importCommandsModule();

    expect(matchesPrimaryOpenShortcut({ key: 'p', metaKey: true })).toBe(true);
    expect(matchesPrimaryOpenShortcut({ key: 'p', ctrlKey: true })).toBe(true);
    expect(matchesPrimaryOpenShortcut({ key: 'P', metaKey: true })).toBe(true);
  });

  it('rejects the Shift variants (handled by the panel open-keys attribute)', async () => {
    const { matchesPrimaryOpenShortcut } = await importCommandsModule();

    expect(matchesPrimaryOpenShortcut({ key: 'p', metaKey: true, shiftKey: true })).toBe(false);
    expect(matchesPrimaryOpenShortcut({ key: 'p', ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it('rejects Alt, missing modifiers, other keys, and missing events', async () => {
    const { matchesPrimaryOpenShortcut } = await importCommandsModule();

    expect(matchesPrimaryOpenShortcut({ key: 'p', altKey: true, ctrlKey: true })).toBe(false);
    expect(matchesPrimaryOpenShortcut({ key: 'p' })).toBe(false);
    expect(matchesPrimaryOpenShortcut({ key: 'r', metaKey: true })).toBe(false);
    expect(matchesPrimaryOpenShortcut(null)).toBe(false);
    expect(matchesPrimaryOpenShortcut({})).toBe(false);
  });
});

describe('default commands', () => {
  beforeEach(() => {
    fakeBridge.calls = [];
    fakeBridge.handler = null;
    vi.stubGlobal('window', { electronDb: fakeBridge });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes the expected command names and icons', async () => {
    const { createDefaultCommands } = await importCommandsModule();
    const commands = createDefaultCommands(makeFakeComponents());

    expect(commands.map((command) => command.name)).toEqual([
      'Add Example Note',
      'Create Notes Index',
      'Refresh Notes',
      'Export Database to File',
      'Import Database from File',
    ]);
    commands.forEach((command) => {
      expect(typeof command.icon).toBe('string');
      expect(command.icon.length).toBeGreaterThan(0);
      expect(typeof command.action).toBe('function');
    });
  });

  it('"Add Example Note" inserts through the bridge and refreshes the db component', async () => {
    const { createDefaultCommands } = await importCommandsModule();
    const components = makeFakeComponents();
    fakeBridge.handler = (action) => (action === 'query' ? [{ id: 7 }] : null);

    const command = createDefaultCommands(components)
      .find(({ name }) => name === 'Add Example Note');
    await command.action();

    const exec = fakeBridge.calls.find(({ action }) => action === 'exec');
    expect(exec.params.sql).toBe('INSERT INTO notes (content, created_at) VALUES (?, ?)');
    expect(exec.params.params[0]).toContain('Created from the command panel at');
    // Bound parameters: the timestamp is bound, never interpolated
    expect(exec.params.params[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const query = fakeBridge.calls.find(({ action }) => action === 'query');
    expect(query.params.sql).toBe('SELECT last_insert_rowid() AS id');

    expect(components.dbComponent.refresh).toHaveBeenCalledTimes(1);
  });

  it('"Add Example Note" reports failures instead of throwing', async () => {
    const { createDefaultCommands } = await importCommandsModule();
    const components = makeFakeComponents();
    fakeBridge.handler = () => {
      throw new Error('no bridge');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const command = createDefaultCommands(components)
      .find(({ name }) => name === 'Add Example Note');

    await expect(command.action()).resolves.toBeUndefined();
    expect(components.dbComponent.refresh).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Command "Add Example Note" failed:',
      expect.any(Error)
    );

    consoleError.mockRestore();
  });

  it('"Create Notes Index" and "Refresh Notes" drive the db component', async () => {
    const { createDefaultCommands } = await importCommandsModule();
    const components = makeFakeComponents();
    const commands = createDefaultCommands(components);
    const byName = (name) => commands.find((command) => command.name === name);

    await byName('Create Notes Index').action();
    await byName('Refresh Notes').action();

    expect(components.dbComponent.createIndex).toHaveBeenCalledTimes(1);
    expect(components.dbComponent.refresh).toHaveBeenCalledTimes(1);
  });

  it('"Export/Import Database" drive the file storage component', async () => {
    const { createDefaultCommands } = await importCommandsModule();
    const components = makeFakeComponents();
    const commands = createDefaultCommands(components);
    const byName = (name) => commands.find((command) => command.name === name);

    await byName('Export Database to File').action();
    await byName('Import Database from File').action();

    expect(components.fileStorageComponent.exportToFile).toHaveBeenCalledTimes(1);
    expect(components.fileStorageComponent.importFromFile).toHaveBeenCalledTimes(1);
  });
});

describe('registerCommands', () => {
  it('forwards name, icon, and action to panel.addCommand in order', async () => {
    const { registerCommands } = await importCommandsModule();
    const panel = { addCommand: vi.fn() };
    const actionA = () => {};
    const actionB = () => {};

    registerCommands(panel, [
      { name: 'First', icon: '🅰️', action: actionA },
      { name: 'Second', icon: '🅱️', action: actionB },
    ]);

    expect(panel.addCommand).toHaveBeenCalledTimes(2);
    expect(panel.addCommand).toHaveBeenNthCalledWith(1, 'First', '🅰️', actionA);
    expect(panel.addCommand).toHaveBeenNthCalledWith(2, 'Second', '🅱️', actionB);
  });
});

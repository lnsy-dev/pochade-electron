/**
 * Command Panel Tests
 *
 * End-to-end tests for <command-panel> (npm: command-panel) and its
 * app wiring in src/commands.js: the hamburger button, the Cmd+P /
 * Ctrl+P and Ctrl+Shift+P open shortcuts, fuzzy search, and command
 * execution against the real database.
 *
 * One browser session is shared across this file — every test reloads
 * the page first, which also guarantees the panel starts closed.
 */

import { expect, browser, $, $$ } from '@wdio/globals';
import {
  waitForDbReady,
  clearExistingEntries,
  findByTextRegex,
} from '../helpers/e2e-utils.js';

/**
 * Open the panel through the hamburger button and wait until its
 * dialog is showing with the search field focused.
 */
async function openPanelViaButton() {
  await $('.command-panel-button').click();
  await waitForPanelOpen();
}

/** Assert the panel dialog is open and the search field has focus. */
async function waitForPanelOpen() {
  await browser.waitUntil(
    async () => (await $$('command-panel dialog[open]')).length === 1,
    { timeoutMsg: 'command panel dialog never opened' }
  );
  await expect($('command-panel .command-search')).toBeFocused();
}

/** Assert the panel dialog is closed again. */
async function waitForPanelClosed() {
  await browser.waitUntil(
    async () => (await $$('command-panel dialog[open]')).length === 0,
    { timeoutMsg: 'command panel dialog never closed' }
  );
}

/**
 * Press the app-level Cmd+P / Ctrl+P shortcut (modifier depends on the
 * platform the Electron app runs on).
 */
async function pressPrimaryShortcut() {
  const platform = await browser.execute(() => navigator.platform);
  const modifier = /Mac/i.test(platform) ? 'Meta' : 'Control';
  await browser.keys([modifier, 'p']);
}

describe('Command Panel', () => {
  beforeEach(async () => {
    await browser.url('/');
    await waitForDbReady();
    await clearExistingEntries();
  });

  it('lists the default commands', async () => {
    await openPanelViaButton();

    const items = await $$('command-panel .command-item');
    const names = [];
    for (const item of items) {
      names.push(await item.getText());
    }
    expect(names.join('\n')).toContain('Add Example Note');
    expect(names.join('\n')).toContain('Create Notes Index');
    expect(names.join('\n')).toContain('Refresh Notes');
    expect(names.join('\n')).toContain('Export Database to File');
    expect(names.join('\n')).toContain('Import Database from File');
  });

  it('opens from the hamburger button and closes on Escape', async () => {
    await openPanelViaButton();

    await browser.keys(['Escape']);
    await waitForPanelClosed();
  });

  it('opens with Cmd+P / Ctrl+P', async () => {
    await pressPrimaryShortcut();
    await waitForPanelOpen();

    await browser.keys(['Escape']);
    await waitForPanelClosed();
  });

  it('opens with Ctrl+Shift+P', async () => {
    await browser.keys(['Control', 'Shift', 'p']);
    await waitForPanelOpen();

    await browser.keys(['Escape']);
    await waitForPanelClosed();
  });

  it('filters commands with the search field', async () => {
    await openPanelViaButton();

    const search = $('command-panel .command-search');
    await search.setValue('index');

    const items = await $$('command-panel .command-item');
    expect(items.length).toBe(1);
    await expect(items[0]).toHaveText(expect.stringContaining('Create Notes Index'));

    await search.setValue('zzzz-no-match');
    await expect($('command-panel .no-results')).toHaveText(
      expect.stringContaining('No commands found')
    );
  });

  it('executes a command when its list item is clicked', async () => {
    await openPanelViaButton();

    const item = await findByTextRegex('command-panel .command-item', /Add Example Note/);
    await item.click();
    await waitForPanelClosed();

    // The command wrote through the database lib and refreshed the list
    await findByTextRegex(
      'db-component .db-entries li span',
      /^Created from the command panel at/
    );
  });

  it('executes the selected command with Enter', async () => {
    await openPanelViaButton();

    const search = $('command-panel .command-search');
    await search.setValue('index');

    await browser.keys(['Enter']);
    await waitForPanelClosed();

    const indexLine = $('db-component .db-indexes');
    await expect(indexLine).toHaveText(
      expect.stringContaining('idx_notes_created_at')
    );
  });
});

/**
 * Database Component Tests
 *
 * End-to-end tests for <db-component>: SQLite reads/writes, index
 * generation, and OPFS persistence in a real browser.
 *
 * WebdriverIO note: one browser session is shared across this file and
 * OPFS data survives navigation — clearExistingEntries() gives each
 * test a clean table.
 */

import { expect, browser } from '@wdio/globals';
import {
  waitForDbReady,
  clearExistingEntries,
  addNote,
  expectEntryVisible,
  countEntries,
  findButton,
} from '../helpers/e2e-utils.js';

describe('Database Component', () => {
  beforeEach(async () => {
    await browser.url('/');
    await waitForDbReady();
    await clearExistingEntries();
  });

  it('reports persistent OPFS storage', async () => {
    const status = $('db-component .db-status');
    // Headless Chrome supports OPFS in workers, so the persistent path
    // must be taken. If this ever fails, check that the browser still
    // supports FileSystemSyncAccessHandle.
    await expect(status).toHaveText(
      expect.stringContaining('Persistent storage (OPFS)')
    );
  });

  it('adds an entry and shows it in the list', async () => {
    await addNote('my first note');
    await expectEntryVisible('my first note');
  });

  it('deletes an entry', async () => {
    await addNote('doomed note');

    let doomed = null;
    for (const item of await $$('db-component .db-entries li')) {
      if ((await item.getText()).includes('doomed note')) {
        doomed = item;
        break;
      }
    }
    if (!doomed) throw new Error('doomed note entry not found');
    const button = await doomed.$('button=Delete');
    await button.click();

    await browser.waitUntil(
      async () => (await countEntries('doomed note')) === 0
    );
  });

  it('does not add an empty entry', async () => {
    await (await findButton('db-component', 'Add entry')).click();
    await browser.pause(500);
    expect((await $$('db-component .db-entries li')).length).toBe(0);
  });

  it('creates an index and lists it', async () => {
    await (await findButton('db-component', 'Create index')).click();

    const indexLine = $('db-component .db-indexes');
    await expect(indexLine).toHaveText(
      expect.stringContaining('idx_notes_created_at')
    );
  });

  it('persists entries across page reloads (OPFS)', async () => {
    await addNote('note that survives reload');

    await browser.refresh();
    await waitForDbReady();
    await expectEntryVisible('note that survives reload');
  });

  it('emits DB-ENTRY-ADDED and DB-INDEX-CREATED events', async () => {
    // Register listeners first (non-blocking), then trigger the actions,
    // then await the stored promise.
    await browser.execute(() => {
      window.__eventsPromise = new Promise((resolve) => {
        const el = document.querySelector('db-component');
        const events = {};
        const maybeResolve = () => {
          if (events.added && events.indexed) resolve(events);
        };
        el.addEventListener('DB-ENTRY-ADDED', (e) => {
          events.added = e.detail;
          maybeResolve();
        });
        el.addEventListener('DB-INDEX-CREATED', (e) => {
          events.indexed = e.detail;
          maybeResolve();
        });
      });
    });

    const input = $('db-component .db-form input');
    await input.setValue('event note');
    await (await findButton('db-component', 'Add entry')).click();
    await (await findButton('db-component', 'Create index')).click();

    const events = await browser.execute(() => window.__eventsPromise);
    expect(events.added.content).toBe('event note');
    expect(events.added.id).toBeGreaterThan(0);
    expect(events.indexed.indexes).toContain('idx_notes_created_at');
  });
});

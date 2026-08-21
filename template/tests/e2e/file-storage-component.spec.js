/**
 * File Storage Component Tests
 *
 * End-to-end tests for <file-storage-component> — the File System
 * Access API dialog flows (export/import of the database file).
 *
 * Why the pickers are stubbed: showSaveFilePicker() and
 * showOpenFilePicker() open NATIVE OS dialogs that no browser
 * automation can drive. So these tests install JavaScript stand-ins
 * for the picker functions via page.addInitScript() and assert:
 *   - the component invokes the dialogs from the click handlers
 *   - the bytes written through the save dialog are a real SQLite file
 *   - a file "picked" through the open dialog is imported and rendered
 *   - user cancellation (AbortError) is swallowed quietly
 *   - browsers without the API get the unsupported notice
 *
 * What these tests do NOT cover: the actual native dialog chrome.
 */

import { test, expect } from '@playwright/test';

/**
 * Install picker stand-ins in the page before any app code runs.
 *
 * window.showSaveFilePicker resolves to a fake handle whose writable
 * collects written chunks into window.__exportedFiles.
 * window.showOpenFilePicker resolves to a fake handle wrapping
 * window.__importFile (a File the test assigns later).
 */
async function mockFileSystemAccessDialogs(page) {
  await page.addInitScript(() => {
    window.__exportedFiles = [];
    window.__importFile = null;

    window.showSaveFilePicker = async (options) => {
      const chunks = [];
      return {
        name: options.suggestedName,
        async createWritable() {
          return {
            async write(data) { chunks.push(data); },
            async close() {
              window.__exportedFiles.push({ name: options.suggestedName, chunks });
            },
          };
        },
      };
    };

    window.showOpenFilePicker = async () => [{
      name: window.__importFile?.name ?? 'import.sqlite3',
      async getFile() { return window.__importFile; },
    }];
  });
}

/**
 * Wait until <db-component> has initialized its database.
 */
async function waitForDbReady(page) {
  const status = page.locator('db-component .db-status');
  await expect(status).toContainText('SQLite', { timeout: 15000 });
}

/**
 * Add a note through the db-component UI.
 */
async function addNote(page, content) {
  await page.locator('db-component .db-form input').fill(content);
  await page.locator('db-component button', { hasText: 'Add entry' }).click();
  await expect(
    page.locator('db-component .db-entries li span', { hasText: content })
  ).toBeVisible();
}

/**
 * Read back the bytes captured by the mocked save dialog as a plain
 * array of numbers plus the 16-byte file header.
 */
function readExportedBytes(page) {
  return page.evaluate(() => {
    const exported = window.__exportedFiles[0];
    const totalLength = exported.chunks.reduce((n, c) => n + c.byteLength, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of exported.chunks) {
      bytes.set(new Uint8Array(chunk instanceof Uint8Array ? chunk : chunk.data ?? chunk), offset);
      offset += chunk.byteLength;
    }
    return {
      name: exported.name,
      length: totalLength,
      header: Array.from(bytes.slice(0, 16)),
    };
  });
}

test.describe('File Storage Component (dialog UI)', () => {
  test('export dialog saves a real SQLite database file', async ({ page }) => {
    await mockFileSystemAccessDialogs(page);
    await page.goto('/');
    await waitForDbReady(page);
    await addNote(page, 'note to export');

    await page.locator('file-storage-component button', { hasText: 'Export database to file' }).click();

    const resultLine = page.locator('file-storage-component .file-storage-result');
    await expect(resultLine).toContainText(/Exported \d+ bytes to app\.sqlite3\./);

    const exported = await readExportedBytes(page);
    expect(exported.name).toBe('app.sqlite3');
    expect(exported.length).toBeGreaterThan(0);

    // SQLite database files start with the magic string "SQLite format 3\0"
    const magic = Array.from(new TextEncoder().encode('SQLite format 3\0'));
    expect(exported.header).toEqual(magic);
  });

  test('import dialog replaces the database with the picked file', async ({ page }) => {
    await mockFileSystemAccessDialogs(page);
    await page.goto('/');
    await waitForDbReady(page);

    // Export a database containing only "original note"
    await addNote(page, 'original note');
    await page.locator('file-storage-component button', { hasText: 'Export database to file' }).click();
    await expect(
      page.locator('file-storage-component .file-storage-result')
    ).toContainText(/Exported/);

    // Change the database after the export
    await addNote(page, 'after export');

    // Point the mocked open dialog at the exported bytes
    await page.evaluate(() => {
      const exported = window.__exportedFiles[0];
      window.__importFile = new File(exported.chunks, 'backup.sqlite3');
    });

    await page.locator('file-storage-component button', { hasText: 'Import database from file' }).click();

    const resultLine = page.locator('file-storage-component .file-storage-result');
    await expect(resultLine).toContainText(/Imported backup\.sqlite3 \(\d+ bytes\)\./);

    // The list refreshes to the imported state: original is back,
    // the post-export note is gone.
    await expect(
      page.locator('db-component .db-entries li span', { hasText: 'original note' })
    ).toBeVisible();
    await expect(
      page.locator('db-component .db-entries li span', { hasText: 'after export' })
    ).toHaveCount(0);
  });

  test('cancelling the save dialog is silent (no error shown)', async ({ page }) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      };
    });
    await page.goto('/');
    await waitForDbReady(page);

    await page.locator('file-storage-component button', { hasText: 'Export database to file' }).click();

    // Give the click handler time to run; the result line must stay empty
    await page.waitForTimeout(500);
    const resultLine = page.locator('file-storage-component .file-storage-result');
    await expect(resultLine).toHaveText('');
  });

  test('cancelling the open dialog is silent (no error shown)', async ({ page }) => {
    await page.addInitScript(() => {
      window.showOpenFilePicker = async () => {
        throw new DOMException('The user aborted a request.', 'AbortError');
      };
    });
    await page.goto('/');
    await waitForDbReady(page);

    await page.locator('file-storage-component button', { hasText: 'Import database from file' }).click();

    await page.waitForTimeout(500);
    const resultLine = page.locator('file-storage-component .file-storage-result');
    await expect(resultLine).toHaveText('');
  });

  test('shows an unsupported notice when the File System Access API is missing', async ({ page }) => {
    await page.addInitScript(() => {
      // Shadow the globals before the app loads (simulates Firefox/Safari)
      window.showSaveFilePicker = undefined;
      window.showOpenFilePicker = undefined;
    });
    await page.goto('/');

    const notice = page.locator('file-storage-component .file-storage-unsupported');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('File System Access API is not available');
    await expect(
      page.locator('file-storage-component button', { hasText: 'Export database to file' })
    ).toHaveCount(0);
  });
});

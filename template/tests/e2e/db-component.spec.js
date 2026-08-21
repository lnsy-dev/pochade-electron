/**
 * Database Component Tests
 *
 * End-to-end tests for <db-component>: SQLite reads/writes, index
 * generation, and OPFS persistence in a real browser.
 */

import { test, expect } from '@playwright/test';

/**
 * Wait until the component has finished initializing the database.
 * The status line always ends up containing the SQLite version.
 */
async function waitForDbReady(page) {
  const status = page.locator('db-component .db-status');
  await expect(status).toContainText('SQLite', { timeout: 15000 });
}

test.describe('Database Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForDbReady(page);
  });

  test('reports persistent OPFS storage', async ({ page }) => {
    const status = page.locator('db-component .db-status');
    // Playwright's Chromium supports OPFS in workers, so the persistent
    // path must be taken. If this ever fails, check that the browser
    // still supports FileSystemSyncAccessHandle.
    await expect(status).toContainText('Persistent storage (OPFS)');
  });

  test('adds an entry and shows it in the list', async ({ page }) => {
    const input = page.locator('db-component .db-form input');
    await input.fill('my first note');
    await page.locator('db-component button', { hasText: 'Add entry' }).click();

    const entry = page.locator('db-component .db-entries li span', { hasText: 'my first note' });
    await expect(entry).toBeVisible();
  });

  test('deletes an entry', async ({ page }) => {
    const input = page.locator('db-component .db-form input');
    await input.fill('doomed note');
    await page.locator('db-component button', { hasText: 'Add entry' }).click();

    const item = page.locator('db-component .db-entries li', { hasText: 'doomed note' });
    await expect(item).toBeVisible();
    await item.locator('button', { hasText: 'Delete' }).click();
    await expect(item).toHaveCount(0);
  });

  test('does not add an empty entry', async ({ page }) => {
    await page.locator('db-component button', { hasText: 'Add entry' }).click();
    await expect(page.locator('db-component .db-entries li')).toHaveCount(0);
  });

  test('creates an index and lists it', async ({ page }) => {
    await page.locator('db-component button', { hasText: 'Create index' }).click();

    const indexLine = page.locator('db-component .db-indexes');
    await expect(indexLine).toContainText('idx_notes_created_at');
  });

  test('persists entries across page reloads (OPFS)', async ({ page }) => {
    const input = page.locator('db-component .db-form input');
    await input.fill('note that survives reload');
    await page.locator('db-component button', { hasText: 'Add entry' }).click();
    await expect(
      page.locator('db-component .db-entries li span', { hasText: 'note that survives reload' })
    ).toBeVisible();

    await page.reload();
    await waitForDbReady(page);

    await expect(
      page.locator('db-component .db-entries li span', { hasText: 'note that survives reload' })
    ).toBeVisible();
  });

  test('emits DB-ENTRY-ADDED and DB-INDEX-CREATED events', async ({ page }) => {
    const eventPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.querySelector('db-component');
        const events = {};
        el.addEventListener('DB-ENTRY-ADDED', (e) => {
          events.added = e.detail;
          if (events.added && events.indexed) resolve(events);
        });
        el.addEventListener('DB-INDEX-CREATED', (e) => {
          events.indexed = e.detail;
          if (events.added && events.indexed) resolve(events);
        });
      });
    });

    const input = page.locator('db-component .db-form input');
    await input.fill('event note');
    await page.locator('db-component button', { hasText: 'Add entry' }).click();
    await page.locator('db-component button', { hasText: 'Create index' }).click();

    const events = await eventPromise;
    expect(events.added.content).toBe('event note');
    expect(events.added.id).toBeGreaterThan(0);
    expect(events.indexed.indexes).toContain('idx_notes_created_at');
  });
});

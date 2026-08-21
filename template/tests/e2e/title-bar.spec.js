/**
 * Transparent Title Bar E2E Tests
 *
 * The Electron main process hides the macOS title bar so the app content
 * extends up to the window chrome. These tests verify that the renderer
 * reserves space for the traffic-light buttons via CSS padding.
 */

import { test, expect } from '@playwright/test';

test.describe('transparent title bar', () => {
  test('body has top padding reserved for the title bar', async ({ page }) => {
    await page.goto('/');

    const paddingTop = await page.evaluate(() => {
      return window.getComputedStyle(document.body).paddingTop;
    });

    expect(paddingTop).toBe('40px');
  });

  test('title bar height is exposed as a CSS variable', async ({ page }) => {
    await page.goto('/');

    const titleBarHeight = await page.evaluate(() => {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--title-bar-height')
        .trim();
    });

    expect(titleBarHeight).toBe('2.5rem');
  });
});

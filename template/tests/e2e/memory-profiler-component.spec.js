/**
 * Memory Profiler Component E2E Tests
 *
 * The overlay is normally only visible inside Electron when the app is
 * launched with --memory-profiler. These tests stub the Electron preload
 * API with page.addInitScript() so the component can be exercised in the
 * Playwright browser as well.
 */

import { test, expect } from '@playwright/test';

/**
 * Install a mock electronProfiler bridge into the page.
 *
 * The real bridge is injected by Electron's preload script; here we
 * provide a manual equivalent so the web-only Playwright browser can
 * trigger enable/metrics callbacks.
 *
 * @param {import('@playwright/test').Page} page
 */
async function installMockProfilerBridge(page) {
  await page.addInitScript(() => {
    window.__profilerCallbacks = {
      enabled: [],
      metrics: [],
    };

    window.electronProfiler = {
      onEnabled: (callback) => window.__profilerCallbacks.enabled.push(callback),
      onMetrics: (callback) => window.__profilerCallbacks.metrics.push(callback),
    };
  });
}

/**
 * Notify all registered enabled callbacks.
 *
 * @param {import('@playwright/test').Page} page
 */
async function enableProfiler(page) {
  await page.evaluate(() => {
    window.__profilerCallbacks.enabled.forEach((callback) => callback());
  });
}

/**
 * Send a sample metrics payload to all registered metrics callbacks.
 *
 * @param {import('@playwright/test').Page} page
 */
async function sendSampleMetrics(page) {
  await page.evaluate(() => {
    const metrics = {
      timestamp: Date.now(),
      totalMemoryMB: 123.45,
      totalCpuPercent: 12.34,
      processes: [
        { type: 'Browser', memoryMB: 45.1, cpuPercent: 2.3 },
        { type: 'Renderer', memoryMB: 78.4, cpuPercent: 10.0 },
      ],
    };
    window.__profilerCallbacks.metrics.forEach((callback) => callback(metrics));
  });
}

test.describe('Memory Profiler Component', () => {
  test.beforeEach(async ({ page }) => {
    await installMockProfilerBridge(page);
    await page.goto('/');
  });

  test('is hidden by default', async ({ page }) => {
    const profiler = page.locator('memory-profiler-component');
    await expect(profiler).toBeHidden();
  });

  test('appears when the profiler is enabled', async ({ page }) => {
    const profiler = page.locator('memory-profiler-component');
    await expect(profiler).toBeHidden();

    await enableProfiler(page);
    await expect(profiler).toBeVisible();
  });

  test('renders totals and process breakdown after receiving metrics', async ({ page }) => {
    const profiler = page.locator('memory-profiler-component');

    await enableProfiler(page);
    await sendSampleMetrics(page);

    const summary = profiler.locator('.profiler-summary');
    await expect(summary).toContainText('123.5 MB');
    await expect(summary).toContainText('12.3%');

    const processes = profiler.locator('.profiler-processes');
    await expect(processes).toContainText('Browser');
    await expect(processes).toContainText('Renderer');
    await expect(processes).toContainText('45.1 MB');
    await expect(processes).toContainText('78.4 MB');
    await expect(processes).toContainText('2.3%');
    await expect(processes).toContainText('10.0%');
  });

  test('shows an age line after receiving metrics', async ({ page }) => {
    const profiler = page.locator('memory-profiler-component');

    await enableProfiler(page);
    await sendSampleMetrics(page);

    await expect(profiler.locator('.profiler-age')).toContainText('Updated');
  });
});

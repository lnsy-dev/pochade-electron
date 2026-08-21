/**
 * WebAssembly C++ Component Tests
 *
 * End-to-end tests for the C++ WebAssembly demo component.
 */

import { test, expect } from '@playwright/test';

test.describe('WebAssembly C++ Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the heading', async ({ page }) => {
    const heading = page.locator('wasm-cpp-component h2');
    await expect(heading).toHaveText('WebAssembly C++ Example');
  });

  test('computes fibonacci correctly', async ({ page }) => {
    const input = page.locator('wasm-cpp-component input');
    const button = page.locator('wasm-cpp-component button', { hasText: 'Compute (C++)' });
    const result = page.locator('wasm-cpp-component p', { hasText: /^fib\(\d+\) = \d+$/ });

    await input.fill('10');
    await button.click();

    // Wait for result with a generous timeout (wasm instantiation can take time)
    await expect(result).toContainText('fib(10) = 55', { timeout: 15000 });
  });

  test('computes fibonacci for edge case n=0', async ({ page }) => {
    const input = page.locator('wasm-cpp-component input');
    const button = page.locator('wasm-cpp-component button', { hasText: 'Compute (C++)' });
    const result = page.locator('wasm-cpp-component p', { hasText: /^fib\(\d+\) = \d+$/ });

    await input.fill('0');
    await button.click();

    await expect(result).toContainText('fib(0) = 0', { timeout: 15000 });
  });

  test('emits WASM-CPP-RESULT event', async ({ page }) => {
    const eventPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.querySelector('wasm-cpp-component');
        if (!el) {
          resolve(null);
          return;
        }
        el.addEventListener('WASM-CPP-RESULT', (e) => {
          resolve(e.detail);
        }, { once: true });
      });
    });

    const input = page.locator('wasm-cpp-component input');
    const button = page.locator('wasm-cpp-component button', { hasText: 'Compute (C++)' });

    await input.fill('7');
    await button.click();

    const detail = await eventPromise;
    expect(detail).not.toBeNull();
    expect(detail.n).toBe(7);
    expect(detail.result).toBe(13);
    expect(detail.language).toBe('cpp');
  });
});

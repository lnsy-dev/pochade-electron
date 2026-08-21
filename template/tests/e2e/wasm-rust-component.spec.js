/**
 * WebAssembly Rust Component Tests
 *
 * End-to-end tests for the Rust WebAssembly demo component.
 */

import { test, expect } from '@playwright/test';

test.describe('WebAssembly Rust Component', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the heading', async ({ page }) => {
    const heading = page.locator('wasm-rust-component h2');
    await expect(heading).toHaveText('WebAssembly Rust Example');
  });

  test('computes fibonacci correctly', async ({ page }) => {
    const input = page.locator('wasm-rust-component input');
    const button = page.locator('wasm-rust-component button', { hasText: 'Compute (Rust)' });
    const result = page.locator('wasm-rust-component p', { hasText: /^fib\(\d+\) = \d+$/ });

    await input.fill('10');
    await button.click();

    await expect(result).toContainText('fib(10) = 55', { timeout: 15000 });
  });

  test('computes fibonacci for edge case n=1', async ({ page }) => {
    const input = page.locator('wasm-rust-component input');
    const button = page.locator('wasm-rust-component button', { hasText: 'Compute (Rust)' });
    const result = page.locator('wasm-rust-component p', { hasText: /^fib\(\d+\) = \d+$/ });

    await input.fill('1');
    await button.click();

    await expect(result).toContainText('fib(1) = 1', { timeout: 15000 });
  });

  test('emits WASM-RUST-RESULT event', async ({ page }) => {
    const eventPromise = page.evaluate(() => {
      return new Promise((resolve) => {
        const el = document.querySelector('wasm-rust-component');
        if (!el) {
          resolve(null);
          return;
        }
        el.addEventListener('WASM-RUST-RESULT', (e) => {
          resolve(e.detail);
        }, { once: true });
      });
    });

    const input = page.locator('wasm-rust-component input');
    const button = page.locator('wasm-rust-component button', { hasText: 'Compute (Rust)' });

    await input.fill('7');
    await button.click();

    const detail = await eventPromise;
    expect(detail).not.toBeNull();
    expect(detail.n).toBe(7);
    expect(detail.result).toBe(13);
    expect(detail.language).toBe('rust');
  });
});

/**
 * WebAssembly Rust Component Tests
 *
 * End-to-end tests for the Rust WebAssembly demo component.
 */

import { expect, browser } from '@wdio/globals';
import { findButton, findByTextRegex } from '../helpers/e2e-utils.js';

describe('WebAssembly Rust Component', () => {
  beforeEach(async () => {
    await browser.url('/');
  });

  it('renders the heading', async () => {
    const heading = $('wasm-rust-component h2');
    await expect(heading).toHaveText('WebAssembly Rust Example');
  });

  it('computes fibonacci correctly', async () => {
    const input = $('wasm-rust-component input');

    await input.setValue('10');
    await (await findButton('wasm-rust-component', 'Compute (Rust)')).click();

    const result = await findByTextRegex(
      'wasm-rust-component p',
      /^fib\(\d+\) = \d+$/
    );
    await expect(result).toHaveText(expect.stringContaining('fib(10) = 55'));
  });

  it('computes fibonacci for edge case n=1', async () => {
    const input = $('wasm-rust-component input');

    await input.setValue('1');
    await (await findButton('wasm-rust-component', 'Compute (Rust)')).click();

    const result = await findByTextRegex(
      'wasm-rust-component p',
      /^fib\(\d+\) = \d+$/
    );
    await expect(result).toHaveText(expect.stringContaining('fib(1) = 1'));
  });

  it('emits WASM-RUST-RESULT event', async () => {
    // Store the event promise on window first (non-blocking), trigger
    // the computation, then await the stored promise.
    await browser.execute(() => {
      window.__rustEventPromise = new Promise((resolve) => {
        const el = document.querySelector('wasm-rust-component');
        if (!el) {
          resolve(null);
          return;
        }
        el.addEventListener(
          'WASM-RUST-RESULT',
          (e) => resolve(e.detail),
          { once: true }
        );
      });
    });

    const input = $('wasm-rust-component input');
    await input.setValue('7');
    await (await findButton('wasm-rust-component', 'Compute (Rust)')).click();

    const detail = await browser.execute(() => window.__rustEventPromise);
    expect(detail).not.toBeNull();
    expect(detail.n).toBe(7);
    expect(detail.result).toBe(13);
    expect(detail.language).toBe('rust');
  });
});

/**
 * WebAssembly C++ Component Tests
 *
 * End-to-end tests for the C++ WebAssembly demo component.
 */

import { expect, browser } from '@wdio/globals';
import { findButton, findByTextRegex } from '../helpers/e2e-utils.js';

describe('WebAssembly C++ Component', () => {
  beforeEach(async () => {
    await browser.url('/');
  });

  it('renders the heading', async () => {
    const heading = $('wasm-cpp-component h2');
    await expect(heading).toHaveText('WebAssembly C++ Example');
  });

  it('computes fibonacci correctly', async () => {
    const input = $('wasm-cpp-component input');

    await input.setValue('10');
    await (await findButton('wasm-cpp-component', 'Compute (C++)')).click();

    // Generous default timeout — wasm instantiation can take time.
    const result = await findByTextRegex(
      'wasm-cpp-component p',
      /^fib\(\d+\) = \d+$/
    );
    await expect(result).toHaveText(expect.stringContaining('fib(10) = 55'));
  });

  it('computes fibonacci for edge case n=0', async () => {
    const input = $('wasm-cpp-component input');

    await input.setValue('0');
    await (await findButton('wasm-cpp-component', 'Compute (C++)')).click();

    const result = await findByTextRegex(
      'wasm-cpp-component p',
      /^fib\(\d+\) = \d+$/
    );
    await expect(result).toHaveText(expect.stringContaining('fib(0) = 0'));
  });

  it('emits WASM-CPP-RESULT event', async () => {
    // Store the event promise on window first (non-blocking), trigger
    // the computation, then await the stored promise.
    await browser.execute(() => {
      window.__cppEventPromise = new Promise((resolve) => {
        const el = document.querySelector('wasm-cpp-component');
        if (!el) {
          resolve(null);
          return;
        }
        el.addEventListener(
          'WASM-CPP-RESULT',
          (e) => resolve(e.detail),
          { once: true }
        );
      });
    });

    const input = $('wasm-cpp-component input');
    await input.setValue('7');
    await (await findButton('wasm-cpp-component', 'Compute (C++)')).click();

    const detail = await browser.execute(() => window.__cppEventPromise);
    expect(detail).not.toBeNull();
    expect(detail.n).toBe(7);
    expect(detail.result).toBe(13);
    expect(detail.language).toBe('cpp');
  });
});

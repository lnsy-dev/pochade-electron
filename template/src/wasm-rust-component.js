/**
 * WebAssembly Rust Example Component
 *
 * Demonstrates loading and using a Rust WebAssembly module compiled with
 * wasm-pack and wasm-bindgen. This component provides a simple UI for
 * computing Fibonacci numbers using the compiled wasm binary.
 *
 * Architecture:
 *   1. The Rust source (src/wasm/rust/fibonacci/src/lib.rs) is compiled
 *      with wasm-pack to produce JS bindings and a .wasm binary.
 *   2. This component imports the wasm-pack generated module.
 *   3. The module exposes an async init() function that loads the wasm binary.
 *   4. After initialization, exported Rust functions are available as JS functions.
 *
 * For LLMs: When adding your own Rust wasm module:
 *   - Create a new crate in src/wasm/rust/<crate-name>/
 *   - Use #[wasm_bindgen] on exported functions
 *   - Build with: npm run build:wasm:rust
 *   - Call init() before using any exported functions
 */

import DataroomElement from 'dataroom-js';

/**
 * WasmRustComponent
 *
 * A custom HTML element that loads a Rust WebAssembly module and provides
 * an interactive Fibonacci calculator.
 *
 * @extends DataroomElement
 */
class WasmRustComponent extends DataroomElement {
  /**
   * Initialize the component.
   *
   * Creates the UI elements and sets up the Rust wasm module.
   *
   * @async
   * @returns {Promise<void>}
   */
  async initialize() {
    // Section heading
    this.create('h2', { content: 'WebAssembly Rust Example' });

    // Description paragraph
    this.create('p', {
      content: 'This computes Fibonacci numbers using a Rust function compiled to WebAssembly via wasm-pack and wasm-bindgen.',
    });

    // Input field
    this.input = this.create('input', {
      type: 'number',
      value: '10',
      placeholder: 'Enter a number',
    });

    // Compute button
    const button = this.create('button', { content: 'Compute (Rust)' });

    // Result display
    this.resultDisplay = this.create('p', { content: 'Result will appear here.' });

    /**
     * Load the wasm-pack generated module.
     *
     * wasm-pack --target web produces an ES module with:
     *   - init(defaultImportPath?) : async function that loads the wasm binary
     *   - fib(n: number) : number  : the exported Rust function
     *
     * You MUST call init() before using any exported functions.
     * The init() function handles fetching and instantiating the .wasm binary.
     */
    try {
      const wasmModule = await import('./wasm/rust/fibonacci/pkg/fibonacci.js');

      /**
       * Initialize the wasm module.
       *
       * init() returns a Promise that resolves when the WebAssembly module
       * is fully loaded and its memory is allocated. Without calling init(),
       * any attempt to call exported functions will throw an error.
       */
      await wasmModule.default();

      // Store the exported fib function for later use
      this.fib = wasmModule.fib;

      // Attach click handler
      button.addEventListener('click', () => this.compute());
    } catch (error) {
      console.error('Failed to load Rust WebAssembly module:', error);
      this.resultDisplay.textContent = `Error loading wasm: ${error.message}`;
      this.event('WASM-RUST-ERROR', { error: error.message });
    }
  }

  /**
   * Compute the Fibonacci number from the input value.
   *
   * Reads the current input value, calls the Rust wasm function,
   * and updates the result display.
   *
   * @returns {void}
   */
  compute() {
    const n = parseInt(this.input.value, 10);

    // Validate input
    if (Number.isNaN(n) || n < 0) {
      this.resultDisplay.textContent = 'Please enter a non-negative integer.';
      return;
    }

    try {
      // Call the Rust function exported via wasm-bindgen
      const result = this.fib(n);
      this.resultDisplay.textContent = `fib(${n}) = ${result}`;

      // Emit a dataroom event
      this.event('WASM-RUST-RESULT', { n, result, language: 'rust' });
    } catch (error) {
      console.error('Error computing Fibonacci:', error);
      this.resultDisplay.textContent = `Computation error: ${error.message}`;
      this.event('WASM-RUST-ERROR', { error: error.message });
    }
  }
}

// Register the custom element
if (!customElements.get('wasm-rust-component')) {
  customElements.define('wasm-rust-component', WasmRustComponent);
}

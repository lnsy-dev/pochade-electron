/**
 * Rust WebAssembly Example: Fibonacci Calculator
 *
 * This crate demonstrates how to write a simple Rust function,
 * compile it to WebAssembly using wasm-bindgen, and call it from
 * JavaScript.
 *
 * Build Command (requires wasm-pack):
 *   wasm-pack build --target web
 *   # or from project root:
 *   npm run build:wasm:rust
 */

use wasm_bindgen::prelude::*;

/**
 * Compute the nth Fibonacci number.
 *
 * This function is exported to JavaScript via wasm-bindgen.
 *
 * @param n The position in the Fibonacci sequence (0-indexed).
 * @return The nth Fibonacci number.
 */
#[wasm_bindgen]
pub fn fib(n: i32) -> i32 {
    if n <= 1 {
        return n;
    }
    let mut a: i32 = 0;
    let mut b: i32 = 1;
    for _ in 2..=n {
        let temp = a.wrapping_add(b);
        a = b;
        b = temp;
    }
    b
}

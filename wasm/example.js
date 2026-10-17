// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// Worked example of calling matMul3x3 from JavaScript.
//
// Run it directly:  node wasm/example.js
//
// The test suite imports multiply3x3 from here, so this file is executed rather than
// only read. A snippet in a README rots silently; this one fails the build.
import EigenWasmModule from './eigen_wasm.js';

const N = 9;                  // a 3x3 matrix
const BYTES = N * 8;          // of doubles

// Multiply two row-major 3x3 matrices already resident in WASM memory and return the
// product as a plain JS array. Allocates its own buffers and frees them, so the
// caller never touches raw pointers.
export function multiply3x3(Module, matMul3x3, a, b) {
  const aPtr = Module._malloc(BYTES);
  const bPtr = Module._malloc(BYTES);
  const outPtr = Module._malloc(BYTES);

  for (let i = 0; i < N; i++) {
    Module.setValue(aPtr + i * 8, a[i], 'double');
    Module.setValue(bPtr + i * 8, b[i], 'double');
  }

  matMul3x3(aPtr, bPtr, outPtr);

  const result = [];
  for (let i = 0; i < N; i++) result.push(Module.getValue(outPtr + i * 8, 'double'));

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(outPtr);

  return result;
}

export async function main() {
  const Module = await EigenWasmModule();
  const matMul3x3 = Module.cwrap('matMul3x3', null, ['number', 'number', 'number']);

  const a = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const b = [9, 8, 7, 6, 5, 4, 3, 2, 1];

  return multiply3x3(Module, matMul3x3, a, b);
}

if (import.meta.filename === process.argv[1]) {
  console.log(await main());   // [30,24,18,84,69,54,138,114,90]
}
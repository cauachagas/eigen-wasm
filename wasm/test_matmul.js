// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// Row-major 3x3 multiply over WASM memory: out = a * b, 9 doubles per matrix.
// Expected values are hand-computed literals, not derived from the code under test.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();

// A 3x3 matrix of doubles is 9 * 8 bytes; a float32 layout would halve both.
const N = 9;
const BYTES = N * 8;

const cases = [
  ['identity * m returns m (catches transposition)',
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 5, 6, 7, 8, 9]],
  ['a * b',
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
    [9, 8, 7, 6, 5, 4, 3, 2, 1],
    [30, 24, 18, 84, 69, 54, 138, 114, 90]],
];

let failed = 0;

// `alias` selects which input the output buffer is overlaid on: null for a separate
// buffer, 'a' or 'b' to hand out an aliased pointer. eigen_wasm.cpp documents that
// aliasing is allowed, and the two aliased cases below hold that promise down.
function runCase(name, a, b, expected, alias) {
  const aPtr = Module._malloc(BYTES);
  const bPtr = Module._malloc(BYTES);
  for (let i = 0; i < N; i++) {
    Module.setValue(aPtr + i * 8, a[i], 'double');
    Module.setValue(bPtr + i * 8, b[i], 'double');
  }

  const outPtr = alias === 'a' ? aPtr : alias === 'b' ? bPtr : Module._malloc(BYTES);
  Module.ccall('matMul3x3', null, ['number', 'number', 'number'], [aPtr, bPtr, outPtr]);

  // Read out before freeing: getValue copies into JS, so the numbers survive the free,
  // but reading after the free would depend on that being true.
  const result = [];
  for (let i = 0; i < N; i++) result.push(Module.getValue(outPtr + i * 8, 'double'));
  Module._free(aPtr); Module._free(bPtr);
  if (alias === null) Module._free(outPtr);

  try {
    assert.deepEqual(result, expected);
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${result}\n  expected: ${expected}`);
  }
}

for (const [name, a, b, expected] of cases) runCase(name, a, b, expected, null);

// The aliasing guarantee rests on Eigen evaluating the product into a temporary
// before the assignment stores into `out`, which is an evaluator implementation detail
// and not something to leave as a comment in eigen_wasm.cpp.
const [, a, b, expected] = cases[1];
runCase('out aliases a', a, b, expected, 'a');
runCase('out aliases b', a, b, expected, 'b');

process.exit(failed ? 1 : 0);
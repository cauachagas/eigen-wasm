// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// Row-major 3x3 multiply over WASM memory: out = a * b, 9 doubles per matrix.
// Expected values are hand-computed literals, not derived from the code under test.
//
// The aliasing cases drive matMul3x3 directly rather than going through example.js,
// because the example allocates its own output buffer and cannot alias.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';
import { multiply3x3 } from './example.js';

const Module = await EigenWasmModule();
const matMul3x3 = Module.cwrap('matMul3x3', null, ['number', 'number', 'number']);

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

function report(name, result, expected) {
  try {
    assert.deepEqual(result, expected);
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${result}\n  expected: ${expected}`);
  }
}

// The documented path: example.js owns the buffers and frees them. Exercising it here
// is what stops the README's example and the test from drifting apart.
for (const [name, a, b, expected] of cases) {
  report(`example.js: ${name}`, multiply3x3(Module, matMul3x3, a, b), expected);
}

// `alias` selects which input the output buffer is overlaid on: null for a separate
// buffer, 'a' or 'b' to hand out an aliased pointer. eigen_wasm.cpp documents that
// aliasing is allowed, and the cases below hold that promise down.
function runAliased(name, a, b, expected, alias) {
  const aPtr = Module._malloc(BYTES);
  const bPtr = Module._malloc(BYTES);
  for (let i = 0; i < N; i++) {
    Module.setValue(aPtr + i * 8, a[i], 'double');
    Module.setValue(bPtr + i * 8, b[i], 'double');
  }

  const outPtr = alias === 'a' ? aPtr : alias === 'b' ? bPtr : Module._malloc(BYTES);
  matMul3x3(aPtr, bPtr, outPtr);

  // Read out before freeing: getValue copies into JS, so the numbers survive the free,
  // but reading after the free would depend on that being true.
  const result = [];
  for (let i = 0; i < N; i++) result.push(Module.getValue(outPtr + i * 8, 'double'));
  Module._free(aPtr); Module._free(bPtr);
  if (alias === null) Module._free(outPtr);

  report(name, result, expected);
}

// The aliasing guarantee rests on Eigen evaluating the product into a temporary
// before the assignment stores into `out`, which is an evaluator implementation detail
// and not something to leave as a comment in eigen_wasm.cpp.
const [, a, b, expected] = cases[1];
runAliased('out aliases a', a, b, expected, 'a');
runAliased('out aliases b', a, b, expected, 'b');

process.exit(failed ? 1 : 0);
// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// Row-major 3x3 multiply over WASM memory: out = a * b, 9 doubles per matrix.
// Expected values are hand-computed literals, not derived from the code under test.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();

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
for (const [name, a, b, expected] of cases) {
  const aPtr = Module._malloc(72);
  const bPtr = Module._malloc(72);
  const outPtr = Module._malloc(72);
  for (let i = 0; i < 9; i++) {
    Module.setValue(aPtr + i * 8, a[i], 'double');
    Module.setValue(bPtr + i * 8, b[i], 'double');
  }

  Module.ccall('matMul3x3', null, ['number', 'number', 'number'], [aPtr, bPtr, outPtr]);

  const result = [];
  for (let i = 0; i < 9; i++) result.push(Module.getValue(outPtr + i * 8, 'double'));
  Module._free(aPtr); Module._free(bPtr); Module._free(outPtr);

  try {
    assert.deepEqual(result, expected);
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${result}\n  expected: ${expected}`);
  }
}

process.exit(failed ? 1 : 0);
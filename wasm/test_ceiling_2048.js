// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// Dedicated boundary and scaling test for the 2048 dimension ceiling.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const maxDimension = Module.cwrap('maxDimension', 'number', []);
const determinant = Module.cwrap('determinant', 'number', ['number', 'number', 'number', 'number']);
const matMul = Module.cwrap('matMul', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const solveLU = Module.cwrap('solveLU', 'number', ['number', 'number', 'number', 'number']);
const cholesky = Module.cwrap('cholesky', 'number', ['number', 'number', 'number']);
const qr = Module.cwrap('qr', 'number', ['number', 'number', 'number', 'number', 'number']);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const SENTINEL = -9.999999999999e-100;

let failed = 0;

function report(name, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    console.log(`ok - ${name}`);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${actual}\n  expected: ${expected}`);
  }
}

// 1. Assert runtime exported ceiling is exactly 2048
const ceiling = maxDimension();
report('maxDimension() returns 2048', ceiling, 2048);

// 2. Assert N = 2048 executes determinant of identity successfully
{
  const n = 2048;
  const bytes = n * n * 8;
  const aPtr = Module._malloc(bytes);
  const outPtr = Module._malloc(8);

  // Initialize identity matrix sparsely
  for (let i = 0; i < n; i++) {
    Module.setValue(aPtr + (i * n + i) * 8, 1.0, 'double');
  }

  Module.setValue(outPtr, SENTINEL, 'double');
  const info = determinant(aPtr, n, n, outPtr);
  const det = Module.getValue(outPtr, 'double');

  report('determinant 2048x2048 identity returns Success', info, SUCCESS);
  report('determinant 2048x2048 identity is 1.0', Math.abs(det - 1.0) < 1e-12, true);

  Module._free(aPtr);
  Module._free(outPtr);
}

// 3. Assert N = 2049 (> 2048) returns InvalidInput and preserves untouched output buffers
{
  const overCeiling = 2049;
  const dummyPtr = Module._malloc(8);
  const outPtr = Module._malloc(8);
  Module.setValue(outPtr, SENTINEL, 'double');

  const detInfo = determinant(dummyPtr, overCeiling, overCeiling, outPtr);
  report('determinant 2049 returns InvalidInput', detInfo, INVALID_INPUT);
  report('determinant 2049 leaves buffer untouched', Module.getValue(outPtr, 'double'), SENTINEL);

  const luInfo = solveLU(dummyPtr, dummyPtr, overCeiling, outPtr);
  report('solveLU 2049 returns InvalidInput', luInfo, INVALID_INPUT);
  report('solveLU 2049 leaves buffer untouched', Module.getValue(outPtr, 'double'), SENTINEL);

  const cholInfo = cholesky(dummyPtr, overCeiling, outPtr);
  report('cholesky 2049 returns InvalidInput', cholInfo, INVALID_INPUT);
  report('cholesky 2049 leaves buffer untouched', Module.getValue(outPtr, 'double'), SENTINEL);

  const mmInfo = matMul(dummyPtr, dummyPtr, overCeiling, 2, 2, outPtr);
  report('matMul 2049 rowsA returns InvalidInput', mmInfo, INVALID_INPUT);
  report('matMul 2049 leaves buffer untouched', Module.getValue(outPtr, 'double'), SENTINEL);

  const qrInfo = qr(dummyPtr, overCeiling, 2, outPtr, outPtr);
  report('qr 2049 returns InvalidInput', qrInfo, INVALID_INPUT);
  report('qr 2049 leaves buffer untouched', Module.getValue(outPtr, 'double'), SENTINEL);

  Module._free(dummyPtr);
  Module._free(outPtr);
}

process.exit(failed ? 1 : 0);

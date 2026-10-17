// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// transpose(), trace(), and matrixNorm() over WASM memory.
// Adapted directly from upstream Eigen tests in test/matrix.cpp and test/array.cpp.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const transpose = Module.cwrap('transpose', 'number', ['number', 'number', 'number', 'number']);
const trace = Module.cwrap('trace', 'number', ['number', 'number', 'number']);
const matrixNorm = Module.cwrap('matrixNorm', 'number', ['number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;

const PRECISION = 1e-6;
const SENTINEL = -9.8765432109876e-100;
const MAX_DIMENSION = maxDimension();

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

function alloc(values) {
  const ptr = Module._malloc(values.length * 8);
  for (let i = 0; i < values.length; i++) Module.setValue(ptr + i * 8, values[i], 'double');
  return ptr;
}

function readDoubles(ptr, count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(Module.getValue(ptr + i * 8, 'double'));
  return arr;
}

function isApprox(A, B, tol = PRECISION) {
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    const diff = Math.abs(A[i] - B[i]);
    const scale = Math.max(Math.abs(A[i]), Math.abs(B[i]), 1.0);
    if (diff > scale * tol) return false;
  }
  return true;
}

// 1. Transpose test
function testTranspose(name, A_vals, rows, cols, expectedOut) {
  let aPtr = 0, outPtr = 0;
  try {
    aPtr = alloc(A_vals);
    outPtr = alloc(new Array(cols * rows).fill(SENTINEL));

    const status = transpose(aPtr, rows, cols, outPtr);
    report(`${name} status`, status, SUCCESS);

    const out = readDoubles(outPtr, cols * rows);
    report(`${name} matches expected`, isApprox(out, expectedOut), true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (outPtr) Module._free(outPtr);
  }
}

// 2. Trace test
function testTrace(name, A_vals, n, expectedTrace) {
  let aPtr = 0, outPtr = 0;
  try {
    aPtr = alloc(A_vals);
    outPtr = alloc([SENTINEL]);

    const status = trace(aPtr, n, outPtr);
    report(`${name} status`, status, SUCCESS);

    const out = readDoubles(outPtr, 1)[0];
    report(`${name} matches expected`, Math.abs(out - expectedTrace) <= PRECISION, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (outPtr) Module._free(outPtr);
  }
}

// 3. Matrix norm test
function testMatrixNorm(name, A_vals, rows, cols, normType, expectedNorm) {
  let aPtr = 0, outPtr = 0;
  try {
    aPtr = alloc(A_vals);
    outPtr = alloc([SENTINEL]);

    const status = matrixNorm(aPtr, rows, cols, normType, outPtr);
    report(`${name} status`, status, SUCCESS);

    const out = readDoubles(outPtr, 1)[0];
    report(`${name} matches expected`, Math.abs(out - expectedNorm) <= PRECISION, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (outPtr) Module._free(outPtr);
  }
}

// --- Transpose cases ---
testTranspose(
  'transpose 2x3 rectangular',
  [1, 2, 3, 4, 5, 6],
  2,
  3,
  [1, 4, 2, 5, 3, 6]
);

testTranspose(
  'transpose 3x3 square',
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  3,
  3,
  [1, 4, 7, 2, 5, 8, 3, 6, 9]
);

// --- Trace cases ---
testTrace('trace 2x2 identity', [1, 0, 0, 1], 2, 2.0);
testTrace('trace 3x3 arbitrary', [4, 2, 1, 3, -7, 0, 9, 8, 12], 3, 9.0);

// --- Matrix Norm cases ---
// A = [1, -2; 3, -4]
// Frobenius norm = sqrt(1^2 + (-2)^2 + 3^2 + (-4)^2) = sqrt(1 + 4 + 9 + 16) = sqrt(30) ~ 5.477225575
// 1-norm (max column sum): col 1: |1| + |3| = 4; col 2: |-2| + |-4| = 6 -> max = 6
// Inf-norm (max row sum): row 1: |1| + |-2| = 3; row 2: |3| + |-4| = 7 -> max = 7
const A_norm = [1, -2, 3, -4];
testMatrixNorm('matrixNorm Frobenius (type 0)', A_norm, 2, 2, 0, Math.sqrt(30));
testMatrixNorm('matrixNorm 1-norm (type 1)', A_norm, 2, 2, 1, 6.0);
testMatrixNorm('matrixNorm inf-norm (type 2)', A_norm, 2, 2, 2, 7.0);

// Rectangular 2x3 norm test
// B = [1, 2, -3; 4, -5, 6]
// Frobenius = sqrt(1 + 4 + 9 + 16 + 25 + 36) = sqrt(91) ~ 9.539392014
// 1-norm: col 1: 5; col 2: 7; col 3: 9 -> max = 9
// Inf-norm: row 1: 1+2+3=6; row 2: 4+5+6=15 -> max = 15
const B_norm = [1, 2, -3, 4, -5, 6];
testMatrixNorm('matrixNorm 2x3 Frobenius', B_norm, 2, 3, 0, Math.sqrt(91));
testMatrixNorm('matrixNorm 2x3 1-norm', B_norm, 2, 3, 1, 9.0);
testMatrixNorm('matrixNorm 2x3 inf-norm', B_norm, 2, 3, 2, 15.0);

// Error bounds and invalid inputs
{
  let aPtr = alloc([1, 2, 3, 4]);
  let outPtr = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  report('transpose rejects null a', transpose(0, 2, 2, outPtr), INVALID_INPUT);
  report('transpose rejects null out', transpose(aPtr, 2, 2, 0), INVALID_INPUT);
  report('transpose rejects rows <= 0', transpose(aPtr, 0, 2, outPtr), INVALID_INPUT);
  report('transpose rejects cols <= 0', transpose(aPtr, 2, 0, outPtr), INVALID_INPUT);
  report('transpose rejects rows > MAX_DIMENSION', transpose(aPtr, MAX_DIMENSION + 1, 2, outPtr), INVALID_INPUT);
  report('transpose preserves output buffer on invalid input', readDoubles(outPtr, 4), new Array(4).fill(SENTINEL));

  report('trace rejects null a', trace(0, 2, outPtr), INVALID_INPUT);
  report('trace rejects null out', trace(aPtr, 2, 0), INVALID_INPUT);
  report('trace rejects n <= 0', trace(aPtr, 0, outPtr), INVALID_INPUT);
  report('trace rejects n > MAX_DIMENSION', trace(aPtr, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  report('matrixNorm rejects invalid norm_type 99', matrixNorm(aPtr, 2, 2, 99, outPtr), INVALID_INPUT);
  report('matrixNorm rejects negative norm_type -1', matrixNorm(aPtr, 2, 2, -1, outPtr), INVALID_INPUT);
  report('matrixNorm rejects null a', matrixNorm(0, 2, 2, 0, outPtr), INVALID_INPUT);
  report('matrixNorm rejects null out', matrixNorm(aPtr, 2, 2, 0, 0), INVALID_INPUT);
  report('matrixNorm rejects rows <= 0', matrixNorm(aPtr, 0, 2, 0, outPtr), INVALID_INPUT);
  report('matrixNorm rejects cols <= 0', matrixNorm(aPtr, 2, 0, 0, outPtr), INVALID_INPUT);
  report('matrixNorm preserves output buffer on invalid input', readDoubles(outPtr, 1)[0], SENTINEL);

  Module._free(aPtr);
  Module._free(outPtr);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_matrix_ops assertions passed.');
}

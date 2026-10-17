// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// solveLUMatrix() and solveLeastSquaresMatrix() over WASM memory.
// Solving A * X = B for matrix B (n x nRHS and rows x nRHS).
// Adapted directly from upstream Eigen tests in test/lu.cpp and test/qr.cpp.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const solveLUMatrix = Module.cwrap('solveLUMatrix', 'number', ['number', 'number', 'number', 'number', 'number']);
const solveLeastSquaresMatrix = Module.cwrap('solveLeastSquaresMatrix', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const NUMERICAL_ISSUE = 1;
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

function matMul(A, B, rA, cA, cB) {
  const res = new Array(rA * cB).fill(0);
  for (let i = 0; i < rA; i++) {
    for (let j = 0; j < cB; j++) {
      for (let k = 0; k < cA; k++) {
        res[i * cB + j] += A[i * cA + k] * B[k * cB + j];
      }
    }
  }
  return res;
}

function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
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

// 1. solveLUMatrix test: A (n x n) * X (n x nRHS) = B (n x nRHS)
function testSolveLUMatrix(name, A_vals, B_vals, n, nrhs, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(B_vals);
    xPtr = alloc(new Array(n * nrhs).fill(SENTINEL));

    const status = solveLUMatrix(aPtr, bPtr, n, nrhs, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, n * nrhs);
    if (expectedX) {
      report(`${name} literal solution matches`, isApprox(x, expectedX), true);
    }
    const AX = matMul(A_vals, x, n, n, nrhs);
    const diff = AX.map((v, i) => v - B_vals[i]);
    report(`${name} residual ||A * X - B|| passes`, norm(diff) <= Math.max(norm(B_vals), 1.0) * PRECISION, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// 2. solveLeastSquaresMatrix test: A (rows x cols) * X (cols x nrhs) ~ B (rows x nrhs)
function testSolveLeastSquaresMatrix(name, A_vals, B_vals, rows, cols, nrhs, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(B_vals);
    xPtr = alloc(new Array(cols * nrhs).fill(SENTINEL));

    const status = solveLeastSquaresMatrix(aPtr, bPtr, rows, cols, nrhs, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, cols * nrhs);
    if (expectedX) {
      report(`${name} literal solution matches`, isApprox(x, expectedX), true);
    }
    const AX = matMul(A_vals, x, rows, cols, nrhs);
    const diff = AX.map((v, i) => v - B_vals[i]);
    report(`${name} residual passes`, norm(diff) <= Math.max(norm(B_vals), 1.0) * PRECISION, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// Case 1: solveLUMatrix 2x2 with nRHS = 2 (identity RHS, effectively inverse)
// A = [2, 1; 1, 3], B = [1, 0; 0, 1]
// X should be A^-1 = 1/5 * [3, -1; -1, 2] = [0.6, -0.2; -0.2, 0.6]
testSolveLUMatrix(
  'solveLUMatrix 2x2 with 2 RHS',
  [2, 1, 1, 3],
  [1, 0, 0, 1],
  2,
  2,
  [0.6, -0.2, -0.2, 0.4]
);

// Case 2: solveLUMatrix 3x3 with 2 RHS
const A3 = [
  1, 2, 3,
  0, 1, 4,
  5, 6, 0
];
const X3 = [
  1, 2,
  3, 1,
  2, 3
];
const B3 = matMul(A3, X3, 3, 3, 2);
testSolveLUMatrix('solveLUMatrix 3x3 with 2 RHS', A3, B3, 3, 2, X3);

// Case 3: solveLeastSquaresMatrix 3x2 with 2 RHS (exact fit)
const A_ls = [
  1, 2,
  2, 1,
  1, 1
];
const X_ls = [
  2, 3,
  1, 2
];
const B_ls = matMul(A_ls, X_ls, 3, 2, 2);
testSolveLeastSquaresMatrix('solveLeastSquaresMatrix 3x2 with 2 RHS', A_ls, B_ls, 3, 2, 2, X_ls);

// Singular matrix in solveLUMatrix -> NUMERICAL_ISSUE
{
  const singularA = [1, 2, 2, 4];
  let aPtr = alloc(singularA);
  let bPtr = alloc([1, 0, 0, 1]);
  let xPtr = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  const status = solveLUMatrix(aPtr, bPtr, 2, 2, xPtr);
  report('solveLUMatrix rejects singular matrix with NUMERICAL_ISSUE', status, NUMERICAL_ISSUE);
  report('solveLUMatrix preserves output buffer on singular failure', readDoubles(xPtr, 4), new Array(4).fill(SENTINEL));

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(xPtr);
}

// Dimension checks and null pointers
{
  let aPtr = alloc([1, 0, 0, 1]);
  let bPtr = alloc([1, 0, 0, 1]);
  let outPtr = alloc(new Array(4).fill(SENTINEL));

  report('solveLUMatrix rejects null a', solveLUMatrix(0, bPtr, 2, 2, outPtr), INVALID_INPUT);
  report('solveLUMatrix rejects null b', solveLUMatrix(aPtr, 0, 2, 2, outPtr), INVALID_INPUT);
  report('solveLUMatrix rejects null out', solveLUMatrix(aPtr, bPtr, 2, 2, 0), INVALID_INPUT);
  report('solveLUMatrix rejects n <= 0', solveLUMatrix(aPtr, bPtr, 0, 2, outPtr), INVALID_INPUT);
  report('solveLUMatrix rejects nrhs <= 0', solveLUMatrix(aPtr, bPtr, 2, 0, outPtr), INVALID_INPUT);
  report('solveLUMatrix rejects n > MAX_DIMENSION', solveLUMatrix(aPtr, bPtr, MAX_DIMENSION + 1, 2, outPtr), INVALID_INPUT);
  report('solveLUMatrix rejects nrhs > MAX_DIMENSION', solveLUMatrix(aPtr, bPtr, 2, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  report('solveLeastSquaresMatrix rejects null a', solveLeastSquaresMatrix(0, bPtr, 2, 2, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects null b', solveLeastSquaresMatrix(aPtr, 0, 2, 2, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects null out', solveLeastSquaresMatrix(aPtr, bPtr, 2, 2, 2, 0), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects rows <= 0', solveLeastSquaresMatrix(aPtr, bPtr, 0, 2, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects cols <= 0', solveLeastSquaresMatrix(aPtr, bPtr, 2, 0, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects nrhs <= 0', solveLeastSquaresMatrix(aPtr, bPtr, 2, 2, 0, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects rows > MAX_DIMENSION', solveLeastSquaresMatrix(aPtr, bPtr, MAX_DIMENSION + 1, 2, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects cols > MAX_DIMENSION', solveLeastSquaresMatrix(aPtr, bPtr, 2, MAX_DIMENSION + 1, 2, outPtr), INVALID_INPUT);
  report('solveLeastSquaresMatrix rejects nrhs > MAX_DIMENSION', solveLeastSquaresMatrix(aPtr, bPtr, 2, 2, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  const outSentinel = readDoubles(outPtr, 4);
  report('solveLUMatrix preserves output buffer on invalid input', outSentinel, new Array(4).fill(SENTINEL));

  let lsOutPtr = alloc(new Array(4).fill(SENTINEL));
  solveLeastSquaresMatrix(0, bPtr, 2, 2, 2, lsOutPtr);
  report('solveLeastSquaresMatrix preserves output buffer on invalid input', readDoubles(lsOutPtr, 4), new Array(4).fill(SENTINEL));
  Module._free(lsOutPtr);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(outPtr);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_matrix_solvers assertions passed.');
}

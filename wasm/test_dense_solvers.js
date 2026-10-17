// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// solveCholesky(), solveTriangularLower(), and solveTriangularUpper() over WASM memory.
// Adapted directly from upstream Eigen tests in test/cholesky.cpp and test/triangular.cpp.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const solveCholesky = Module.cwrap('solveCholesky', 'number', ['number', 'number', 'number', 'number']);
const solveTriangularLower = Module.cwrap('solveTriangularLower', 'number', ['number', 'number', 'number', 'number', 'number']);
const solveTriangularUpper = Module.cwrap('solveTriangularUpper', 'number', ['number', 'number', 'number', 'number', 'number']);
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

function matVecMul(A, x, n) {
  const res = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      res[i] += A[i * n + j] * x[j];
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

// 1. solveCholesky tests
function testSolveCholesky(name, A_vals, b_vals, n, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(b_vals);
    xPtr = alloc(new Array(n).fill(SENTINEL));

    const status = solveCholesky(aPtr, bPtr, n, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, n);
    if (expectedX) {
      report(`${name} literal matches`, isApprox(x, expectedX), true);
    }
    const Ax = matVecMul(A_vals, x, n);
    const diff = Ax.map((v, i) => v - b_vals[i]);
    report(`${name} residual ||A x - b|| passes`, norm(diff) <= Math.max(norm(b_vals), 1.0) * PRECISION, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// 2. solveTriangularLower tests
function testSolveTriangularLower(name, L_vals, b_vals, n, unitDiag, expectedX) {
  let lPtr = 0, bPtr = 0, xPtr = 0;
  try {
    lPtr = alloc(L_vals);
    bPtr = alloc(b_vals);
    xPtr = alloc(new Array(n).fill(SENTINEL));

    const status = solveTriangularLower(lPtr, bPtr, n, unitDiag ? 1 : 0, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, n);
    report(`${name} solution matches`, isApprox(x, expectedX), true);
  } finally {
    if (lPtr) Module._free(lPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// 3. solveTriangularUpper tests
function testSolveTriangularUpper(name, U_vals, b_vals, n, unitDiag, expectedX) {
  let uPtr = 0, bPtr = 0, xPtr = 0;
  try {
    uPtr = alloc(U_vals);
    bPtr = alloc(b_vals);
    xPtr = alloc(new Array(n).fill(SENTINEL));

    const status = solveTriangularUpper(uPtr, bPtr, n, unitDiag ? 1 : 0, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, n);
    report(`${name} solution matches`, isApprox(x, expectedX), true);
  } finally {
    if (uPtr) Module._free(uPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// Cholesky cases
testSolveCholesky('solveCholesky 2x2 SPD', [4, 2, 2, 5], [6, 7], 2, [1, 1]);
testSolveCholesky(
  'solveCholesky 3x3 SPD',
  [
    4, 2, -2,
    2, 10, 2,
    -2, 2, 6
  ],
  [4, 14, 6],
  3,
  [1, 1, 1]
);

// Triangular lower cases
testSolveTriangularLower('solveTriangularLower 2x2', [2, 0, 1, 3], [4, 8], 2, false, [2, 2]);
testSolveTriangularLower('solveTriangularLower 2x2 unit', [999, 0, 2, 999], [3, 10], 2, true, [3, 4]);

// Triangular upper cases
testSolveTriangularUpper('solveTriangularUpper 2x2', [2, 3, 0, 4], [8, 8], 2, false, [1, 2]);
testSolveTriangularUpper('solveTriangularUpper 2x2 unit', [999, 2, 0, 999], [7, 3], 2, true, [1, 3]);

// Cholesky error handling: Asymmetric matrix -> INVALID_INPUT
{
  let aPtr = alloc([1, 2, 3, 4]);
  let bPtr = alloc([1, 1]);
  let xPtr = alloc([SENTINEL, SENTINEL]);

  const status = solveCholesky(aPtr, bPtr, 2, xPtr);
  report('solveCholesky rejects asymmetric matrix with INVALID_INPUT', status, INVALID_INPUT);
  report('solveCholesky preserves output buffer on asymmetry', readDoubles(xPtr, 2), [SENTINEL, SENTINEL]);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(xPtr);
}

// Cholesky error handling: Indefinite / non-positive definite -> NUMERICAL_ISSUE
{
  let aPtr = alloc([1, 2, 2, 1]); // eigenvalues 3, -1
  let bPtr = alloc([1, 1]);
  let xPtr = alloc([SENTINEL, SENTINEL]);

  const status = solveCholesky(aPtr, bPtr, 2, xPtr);
  report('solveCholesky rejects indefinite matrix with NUMERICAL_ISSUE', status, NUMERICAL_ISSUE);
  report('solveCholesky preserves output buffer on numerical issue', readDoubles(xPtr, 2), [SENTINEL, SENTINEL]);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(xPtr);
}

// Triangular singular (0 on diagonal for non-unit) -> NUMERICAL_ISSUE
{
  let lPtr = alloc([0, 0, 1, 2]);
  let bPtr = alloc([1, 1]);
  let xPtr = alloc([SENTINEL, SENTINEL]);

  const status = solveTriangularLower(lPtr, bPtr, 2, 0, xPtr);
  report('solveTriangularLower rejects singular diagonal with NUMERICAL_ISSUE', status, NUMERICAL_ISSUE);
  report('solveTriangularLower preserves output buffer on singular failure', readDoubles(xPtr, 2), [SENTINEL, SENTINEL]);

  Module._free(lPtr);
  Module._free(bPtr);
  Module._free(xPtr);
}

// Dimension bounds checks (<=0 or > 2048) and null pointers
{
  let aPtr = alloc([4, 2, 2, 5]);
  let bPtr = alloc([1, 1]);
  let xPtr = alloc([SENTINEL, SENTINEL]);

  report('solveCholesky rejects null a', solveCholesky(0, bPtr, 2, xPtr), INVALID_INPUT);
  report('solveCholesky rejects null b', solveCholesky(aPtr, 0, 2, xPtr), INVALID_INPUT);
  report('solveCholesky rejects null out', solveCholesky(aPtr, bPtr, 2, 0), INVALID_INPUT);
  report('solveCholesky rejects n <= 0', solveCholesky(aPtr, bPtr, 0, xPtr), INVALID_INPUT);
  report('solveCholesky rejects n > MAX_DIMENSION', solveCholesky(aPtr, bPtr, MAX_DIMENSION + 1, xPtr), INVALID_INPUT);

  report('solveTriangularLower rejects n <= 0', solveTriangularLower(aPtr, bPtr, 0, 0, xPtr), INVALID_INPUT);
  report('solveTriangularLower rejects n > MAX_DIMENSION', solveTriangularLower(aPtr, bPtr, MAX_DIMENSION + 1, 0, xPtr), INVALID_INPUT);
  report('solveTriangularUpper rejects n <= 0', solveTriangularUpper(aPtr, bPtr, 0, 0, xPtr), INVALID_INPUT);
  report('solveTriangularUpper rejects n > MAX_DIMENSION', solveTriangularUpper(aPtr, bPtr, MAX_DIMENSION + 1, 0, xPtr), INVALID_INPUT);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(xPtr);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_dense_solvers assertions passed.');
}

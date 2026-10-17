// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// solvePartialLU() and invPartialLU() over WASM memory: solving A x = b and computing inv(A)
// using PartialPivLU over row-major matrices, returning Eigen's ComputationInfo verbatim.
// Adapted directly from upstream Eigen tests in test/lu.cpp and test/lu_decompose.cpp.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const solvePartialLU = Module.cwrap('solvePartialLU', 'number', ['number', 'number', 'number', 'number']);
const invPartialLU = Module.cwrap('invPartialLU', 'number', ['number', 'number', 'number']);
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

function residualPasses(diffNorm, refNorm) {
  return Number.isFinite(diffNorm) && Number.isFinite(refNorm) &&
      diffNorm <= Math.max(refNorm, 1.0) * PRECISION;
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

function matMul(A, B, n) {
  const res = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        res[i * n + j] += A[i * n + k] * B[k * n + j];
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

// 1. Solve PartialLU tests
function testSolvePartialLU(name, A_vals, b_vals, n, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(b_vals);
    xPtr = alloc(new Array(n).fill(SENTINEL));

    const status = solvePartialLU(aPtr, bPtr, n, xPtr);
    report(`${name} status`, status, SUCCESS);

    const x = readDoubles(xPtr, n);
    if (expectedX) {
      const close = x.every((v, i) => Math.abs(v - expectedX[i]) <= Math.max(Math.abs(expectedX[i]), 1.0) * PRECISION);
      report(`${name} literal solution matches`, close, true);
    }

    const Ax = matVecMul(A_vals, x, n);
    const diff = Ax.map((v, i) => v - b_vals[i]);
    const pass = residualPasses(norm(diff), norm(b_vals));
    report(`${name} residual passes ||A x - b||`, pass, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (bPtr) Module._free(bPtr);
    if (xPtr) Module._free(xPtr);
  }
}

// 2. Inverse PartialLU tests
function testInvPartialLU(name, A_vals, n) {
  let aPtr = 0, invPtr = 0;
  try {
    aPtr = alloc(A_vals);
    invPtr = alloc(new Array(n * n).fill(SENTINEL));

    const status = invPartialLU(aPtr, n, invPtr);
    report(`${name} status`, status, SUCCESS);

    const invA = readDoubles(invPtr, n * n);
    const product = matMul(A_vals, invA, n);
    const I = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) I[i * n + i] = 1.0;

    const diff = product.map((v, i) => v - I[i]);
    const pass = residualPasses(norm(diff), Math.sqrt(n));
    report(`${name} inverse residual passes ||A * inv(A) - I||`, pass, true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (invPtr) Module._free(invPtr);
  }
}

// Cases adapted from upstream test/lu.cpp
// 2x2 case
testSolvePartialLU('solvePartialLU 2x2', [2, 1, 1, 3], [5, 5], 2, [2, 1]);
testInvPartialLU('invPartialLU 2x2', [2, 1, 1, 3], 2);

// 3x3 case with known solution
testSolvePartialLU(
  'solvePartialLU 3x3',
  [1, 2, 3, 0, 1, 4, 5, 6, 0],
  [14, 14, 17],
  3,
  [1, 2, 3]
);
testInvPartialLU('invPartialLU 3x3', [1, 2, 3, 0, 1, 4, 5, 6, 0], 3);

// 4x4 case
const A4 = [
  4, 1, -2, 2,
  1, 2, 0, 1,
  -2, 0, 3, -1,
  2, 1, -1, 3
];
const b4 = [5, 4, 0, 5];
testSolvePartialLU('solvePartialLU 4x4', A4, b4, 4, null);
testInvPartialLU('invPartialLU 4x4', A4, 4);

// Singular matrix detection (NumericalIssue)
{
  const singularA = [1, 2, 2, 4]; // det = 0
  let aPtr = alloc(singularA);
  let bPtr = alloc([1, 2]);
  let outPtr = alloc([SENTINEL, SENTINEL]);

  const solveStatus = solvePartialLU(aPtr, bPtr, 2, outPtr);
  report('solvePartialLU rejects singular matrix with NUMERICAL_ISSUE', solveStatus, NUMERICAL_ISSUE);
  const outAfterSolve = readDoubles(outPtr, 2);
  report('solvePartialLU preserves output buffer on singular failure', outAfterSolve, [SENTINEL, SENTINEL]);

  let invPtr = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
  const invStatus = invPartialLU(aPtr, 2, invPtr);
  report('invPartialLU rejects singular matrix with NUMERICAL_ISSUE', invStatus, NUMERICAL_ISSUE);
  const outAfterInv = readDoubles(invPtr, 4);
  report('invPartialLU preserves output buffer on singular failure', outAfterInv, [SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(outPtr);
  Module._free(invPtr);

  // 3x3 singular matrix with dependent rows
  const singular3x3 = [
    1, 2, 3,
    4, 5, 6,
    7, 8, 9
  ];
  let a3Ptr = alloc(singular3x3);
  let b3Ptr = alloc([1, 2, 3]);
  let out3Ptr = alloc([SENTINEL, SENTINEL, SENTINEL]);
  const solve3Status = solvePartialLU(a3Ptr, b3Ptr, 3, out3Ptr);
  report('solvePartialLU rejects 3x3 singular matrix with NUMERICAL_ISSUE', solve3Status, NUMERICAL_ISSUE);
  report('solvePartialLU preserves output buffer on 3x3 singular failure', readDoubles(out3Ptr, 3), [SENTINEL, SENTINEL, SENTINEL]);

  let inv3Ptr = alloc(new Array(9).fill(SENTINEL));
  const inv3Status = invPartialLU(a3Ptr, 3, inv3Ptr);
  report('invPartialLU rejects 3x3 singular matrix with NUMERICAL_ISSUE', inv3Status, NUMERICAL_ISSUE);
  report('invPartialLU preserves output buffer on 3x3 singular failure', readDoubles(inv3Ptr, 9), new Array(9).fill(SENTINEL));

  Module._free(a3Ptr);
  Module._free(b3Ptr);
  Module._free(out3Ptr);
  Module._free(inv3Ptr);
}

// Dimension bounds checks (<=0 or > 2048) and null pointers
{
  let aPtr = alloc([1, 0, 0, 1]);
  let bPtr = alloc([1, 1]);
  let outPtr = alloc([SENTINEL, SENTINEL]);

  report('solvePartialLU rejects null a', solvePartialLU(0, bPtr, 2, outPtr), INVALID_INPUT);
  report('solvePartialLU rejects null b', solvePartialLU(aPtr, 0, 2, outPtr), INVALID_INPUT);
  report('solvePartialLU rejects null out', solvePartialLU(aPtr, bPtr, 2, 0), INVALID_INPUT);
  report('solvePartialLU rejects n <= 0', solvePartialLU(aPtr, bPtr, 0, outPtr), INVALID_INPUT);
  report('solvePartialLU rejects n > MAX_DIMENSION', solvePartialLU(aPtr, bPtr, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  report('invPartialLU rejects null a', invPartialLU(0, 2, outPtr), INVALID_INPUT);
  report('invPartialLU rejects null out', invPartialLU(aPtr, 2, 0), INVALID_INPUT);
  report('invPartialLU rejects n <= 0', invPartialLU(aPtr, 0, outPtr), INVALID_INPUT);
  report('invPartialLU rejects n > MAX_DIMENSION', invPartialLU(aPtr, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  const outSentinel = readDoubles(outPtr, 2);
  report('solvePartialLU untouched invariant preserved on invalid input', outSentinel, [SENTINEL, SENTINEL]);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(outPtr);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_partial_lu assertions passed.');
}

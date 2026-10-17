// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// cholesky() over WASM memory: computing L factor of symmetric positive-definite A (A = L L^T).
// Returns Eigen's ComputationInfo verbatim (Success = 0, NumericalIssue = 1, InvalidInput = 3).
// Verified by identity residual norm ||L L^T - A|| <= ||A|| * PRECISION.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const cholesky = Module.cwrap('cholesky', 'number', ['number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const NUMERICAL_ISSUE = 1;
const INVALID_INPUT = 3;

const PRECISION = 1e-6;
const SENTINEL = -7.7777777777777e-100;
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

function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// Compute L * L^T in JS
function computeLLT(L, n) {
  const res = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        // L[i, k] * (L^T)[k, j] = L[i, k] * L[j, k]
        res[i * n + j] += L[i * n + k] * L[j * n + k];
      }
    }
  }
  return res;
}

function testCholesky(name, A_vals, n, expectedL) {
  let aPtr = 0, lPtr = 0;
  try {
    aPtr = alloc(A_vals);
    lPtr = Module._malloc(n * n * 8);

    const info = cholesky(aPtr, n, n, lPtr);
    report(`${name}: info`, info, SUCCESS);

    const L = readDoubles(lPtr, n * n);

    if (expectedL) {
      for (let i = 0; i < n * n; i++) {
        const diff = Math.abs(L[i] - expectedL[i]);
        const pass = diff <= PRECISION * Math.max(Math.abs(expectedL[i]), 1.0);
        if (!pass) failed++;
        report(`${name}: L[${i}]`, pass, true);
      }
    }

    // Residual ||L L^T - A||
    const reconA = computeLLT(L, n);
    const diff = reconA.map((val, idx) => val - A_vals[idx]);
    const resNorm = norm(diff);
    const refNorm = norm(A_vals);
    const passResidual = resNorm <= Math.max(refNorm, 1.0) * PRECISION;
    if (!passResidual) failed++;
    report(`${name}: residual ||L L^T - A|| = ${resNorm.toExponential(3)}`, passResidual, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (lPtr !== 0) Module._free(lPtr);
  }
}

// 1x1: A = [9] -> L = [3]
testCholesky('1x1', [9], 1, [3]);

// 2x2:
// A = [ 4,  12 ]
//     [ 12, 45 ]
// L = [ 2,  0 ]
//     [ 6,  3 ]
testCholesky('2x2', [4, 12, 12, 45], 2, [2, 0, 6, 3]);

// 3x3:
// A = [  4,  12, -16 ]
//     [ 12,  45, -56 ]
//     [-16, -56,  97 ]
// L = [  2,  0,  0 ]
//     [  6,  3,  0 ]
//     [ -8, -2,  3 ]
testCholesky('3x3', [4, 12, -16, 12, 45, -56, -16, -56, 97], 3, [2, 0, 0, 6, 3, 0, -8, -2, 3]);

// --- Non positive-definite matrix -> NumericalIssue ---
{
  // Negative eigenvalue / indefinite matrix
  const indefinite = [
    1, 2,
    2, 1
  ];
  let aPtr = 0, lPtr = 0;
  try {
    aPtr = alloc(indefinite);
    lPtr = Module._malloc(4 * 8);
    for (let i = 0; i < 4; i++) Module.setValue(lPtr + i * 8, SENTINEL, 'double');

    const info = cholesky(aPtr, 2, 2, lPtr);
    report('indefinite matrix reports NumericalIssue', info, NUMERICAL_ISSUE);

    const untouched = readDoubles(lPtr, 4).every(v => v === SENTINEL);
    report('indefinite matrix leaves output untouched', untouched, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (lPtr !== 0) Module._free(lPtr);
  }
}

// --- Asymmetric matrix -> InvalidInput ---
{
  const asymmetric = [
    4, 1,
    2, 4
  ];
  let aPtr = 0, lPtr = 0;
  try {
    aPtr = alloc(asymmetric);
    lPtr = Module._malloc(4 * 8);
    for (let i = 0; i < 4; i++) Module.setValue(lPtr + i * 8, SENTINEL, 'double');

    const info = cholesky(aPtr, 2, 2, lPtr);
    report('asymmetric matrix reports InvalidInput', info, INVALID_INPUT);

    const untouched = readDoubles(lPtr, 4).every(v => v === SENTINEL);
    report('asymmetric matrix leaves output untouched', untouched, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (lPtr !== 0) Module._free(lPtr);
  }
}

// Precondition checks
const rejected = [
  ['null matrix pointer', null, 2, 2],
  ['null out pointer', [4, 2, 2, 4], 2, 2],
  ['zero rows', [4], 0, 0],
  ['negative rows', [4], -1, -1],
  ['non-square (2x3)', [1, 2, 3, 4, 5, 6], 2, 3],
  ['above ceiling', [4], MAX_DIMENSION + 1, MAX_DIMENSION + 1],
];

for (const [name, A_vals, rows, cols] of rejected) {
  const hasOut = name !== 'null out pointer';
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const count = Math.max(rows * cols, 1);
  const outPtr = hasOut ? Module._malloc(count * 8) : 0;
  if (hasOut) {
    for (let i = 0; i < count; i++) Module.setValue(outPtr + i * 8, SENTINEL, 'double');
  }

  try {
    const info = cholesky(aPtr, rows, cols, outPtr);
    report(`cholesky ${name}: InvalidInput`, info, INVALID_INPUT);

    if (hasOut) {
      const untouched = readDoubles(outPtr, count).every(v => v === SENTINEL);
      report(`cholesky ${name}: output untouched`, untouched, true);
    }
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

process.exit(failed ? 1 : 0);

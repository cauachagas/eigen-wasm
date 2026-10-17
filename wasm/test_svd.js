// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// svd() via JacobiSVD over WASM memory.
// Returns Eigen's ComputationInfo verbatim (Success = 0, NumericalIssue = 1, InvalidInput = 3).
// Verified by:
//   - Singular values descending order.
//   - Reconstruction: ||U * diag(S) * V^T - A|| <= ref * PRECISION.
//   - Non-finite inputs return InvalidInput.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const svd = Module.cwrap('svd', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const svdSingularValues = Module.cwrap('svdSingularValues', 'number', ['number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -6.6666666666666e-100;
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

// Compute U * diag(S) * Vt in JS where:
// U is rows x k, S is length k, Vt is k x cols.
function computeRecon(U, S, Vt, rows, cols) {
  const k = Math.min(rows, cols);
  // diag(S) * Vt has size k x cols:
  const SVt = new Array(k * cols).fill(0);
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < cols; j++) {
      SVt[i * cols + j] = S[i] * Vt[i * cols + j];
    }
  }

  // U * (SVt) has size rows x cols:
  const recon = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let p = 0; p < k; p++) {
        recon[i * cols + j] += U[i * k + p] * SVt[p * cols + j];
      }
    }
  }
  return recon;
}

function testSVD(name, A_vals, rows, cols, expectedS) {
  let aPtr = 0, sPtr = 0, uPtr = 0, vtPtr = 0;
  const k = Math.min(rows, cols);
  try {
    aPtr = alloc(A_vals);
    sPtr = Module._malloc(k * 8);
    uPtr = Module._malloc(rows * k * 8);
    vtPtr = Module._malloc(k * cols * 8);

    const info = svd(aPtr, rows, cols, sPtr, uPtr, vtPtr);
    report(`${name}: info`, info, SUCCESS);

    const S = readDoubles(sPtr, k);
    const U = readDoubles(uPtr, rows * k);
    const Vt = readDoubles(vtPtr, k * cols);

    // 1. Descending order of singular values
    let isDescending = true;
    for (let i = 0; i < k - 1; i++) {
      if (S[i] < S[i + 1] - 1e-12) isDescending = false;
    }
    report(`${name}: S descending`, isDescending, true);

    // 2. Expected singular values if provided
    if (expectedS) {
      for (let i = 0; i < k; i++) {
        const diff = Math.abs(S[i] - expectedS[i]);
        const pass = diff <= PRECISION * Math.max(Math.abs(expectedS[i]), 1.0);
        if (!pass) failed++;
        report(`${name}: S[${i}]`, pass, true);
      }
    }

    // 3. Reconstruction: ||U * diag(S) * V^T - A||
    const reconA = computeRecon(U, S, Vt, rows, cols);
    const diff = reconA.map((val, idx) => val - A_vals[idx]);
    const resNorm = norm(diff);
    const refNorm = norm(A_vals);
    const passRecon = resNorm <= Math.max(refNorm, 1.0) * PRECISION;
    if (!passRecon) failed++;
    report(`${name}: reconstruction ||U S V^T - A|| = ${resNorm.toExponential(3)}`, passRecon, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (sPtr !== 0) Module._free(sPtr);
    if (uPtr !== 0) Module._free(uPtr);
    if (vtPtr !== 0) Module._free(vtPtr);
  }
}

// 2x2 Square with prescribed singular values 3, 2
testSVD('SVD 2x2 diag(3, -2)', [3, 0, 0, -2], 2, 2, [3, 2]);

// 2x2 Rank-1 matrix (singular values: 5, 0)
testSVD('SVD 2x2 rank 1', [1.8, 2.4, 2.4, 3.2], 2, 2, [5, 0]);

// 3x2 Rectangular (singular values: 7, 3)
testSVD('SVD 3x2', [0, 7, 3, 0, 0, 0], 3, 2, [7, 3]);

// 2x3 Rectangular (singular values: 7, 3)
testSVD('SVD 2x3', [0, 3, 0, 7, 0, 0], 2, 3, [7, 3]);

// Non-finite input check: NaN / Infinity returns InvalidInput
{
  const nonFiniteA = [1, NaN, 3, 4];
  const aPtr = alloc(nonFiniteA);
  const sPtr = Module._malloc(2 * 8);
  const uPtr = Module._malloc(4 * 8);
  const vtPtr = Module._malloc(4 * 8);
  Module.setValue(sPtr, SENTINEL, 'double');

  try {
    const info = svd(aPtr, 2, 2, sPtr, uPtr, vtPtr);
    report('non-finite input returns InvalidInput', info, INVALID_INPUT);

    const untouched = Module.getValue(sPtr, 'double') === SENTINEL;
    report('non-finite leaves output untouched', untouched, true);
  } finally {
    Module._free(aPtr);
    Module._free(sPtr);
    Module._free(uPtr);
    Module._free(vtPtr);
  }
}

// Precondition checks
const rejected = [
  ['null matrix pointer', null, 2, 2],
  ['zero rows', [1], 0, 1],
  ['zero cols', [1], 1, 0],
  ['negative dimensions', [1], -2, 2],
  ['above ceiling', [1], MAX_DIMENSION + 1, 2],
];

for (const [name, A_vals, rows, cols] of rejected) {
  const k = Math.max(Math.min(rows, cols), 1);
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const sPtr = Module._malloc(k * 8);
  const uPtr = Module._malloc(Math.max(rows, 1) * k * 8);
  const vtPtr = Module._malloc(k * Math.max(cols, 1) * 8);
  Module.setValue(sPtr, SENTINEL, 'double');

  try {
    const info = svd(aPtr, rows, cols, sPtr, uPtr, vtPtr);
    report(`svd ${name}: InvalidInput`, info, INVALID_INPUT);

    const untouched = Module.getValue(sPtr, 'double') === SENTINEL;
    report(`svd ${name}: output untouched`, untouched, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    Module._free(sPtr);
    Module._free(uPtr);
    Module._free(vtPtr);
  }
}

// Test svdSingularValues
{
  const diagA = [
    3, 0,
    0, -2,
  ];
  let aPtr = 0, sPtr = 0;
  try {
    aPtr = alloc(diagA);
    sPtr = Module._malloc(2 * 8);
    Module.setValue(sPtr, SENTINEL, 'double');
    Module.setValue(sPtr + 8, SENTINEL, 'double');

    const info = svdSingularValues(aPtr, 2, 2, sPtr);
    report('svdSingularValues info', info, SUCCESS);

    const s = readDoubles(sPtr, 2);
    const descending = s[0] >= s[1];
    report('svdSingularValues descending', descending, true);
    report('svdSingularValues S[0]', Math.abs(s[0] - 3.0) <= PRECISION, true);
    report('svdSingularValues S[1]', Math.abs(s[1] - 2.0) <= PRECISION, true);

    // Non-finite input
    const nanMat = [NaN, 0, 0, 1];
    const nanPtr = alloc(nanMat);
    Module.setValue(sPtr, SENTINEL, 'double');
    Module.setValue(sPtr + 8, SENTINEL, 'double');
    const nanInfo = svdSingularValues(nanPtr, 2, 2, sPtr);
    report('svdSingularValues non-finite input returns InvalidInput', nanInfo, INVALID_INPUT);
    report('svdSingularValues non-finite leaves output untouched',
      Module.getValue(sPtr, 'double') === SENTINEL && Module.getValue(sPtr + 8, 'double') === SENTINEL, true);
    Module._free(nanPtr);

    // Null input
    const nullInfo = svdSingularValues(0, 2, 2, sPtr);
    report('svdSingularValues null input returns InvalidInput', nullInfo, INVALID_INPUT);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (sPtr !== 0) Module._free(sPtr);
  }
}

process.exit(failed ? 1 : 0);

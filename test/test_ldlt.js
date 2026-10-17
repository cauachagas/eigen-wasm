// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_ldlt.js: TDD test suite for Ticket 007 (LDLT and Bunch-Kaufman)
// Verifies LDLT factorization for positive semi-definite and indefinite symmetric matrices.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const ldlt = Module.cwrap('ldlt', 'number', ['number', 'number', 'number', 'number', 'number']);
const bunchKaufman = Module.cwrap('bunchKaufman', 'number', ['number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const NUMERICAL_ISSUE = 1;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -4.4444444444444e-100;
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

function readInts(ptr, count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(Module.getValue(ptr + i * 4, 'i32'));
  return arr;
}

function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// Reconstruction check: ||P * (L * D * L^T) * P^T - A|| <= ||A|| * PRECISION
function testLDLT(name, A_vals, n) {
  let aPtr = 0, lPtr = 0, dPtr = 0, transPtr = 0;
  try {
    aPtr = alloc(A_vals);
    lPtr = Module._malloc(n * n * 8);
    dPtr = Module._malloc(n * 8);
    transPtr = Module._malloc(n * 4);

    const info = ldlt(aPtr, n, lPtr, dPtr, transPtr);
    report(`${name}: info`, info, SUCCESS);

    const L = readDoubles(lPtr, n * n);
    const D = readDoubles(dPtr, n);
    const P = readInts(transPtr, n);

    // Compute L * diag(D) * L^T
    const LD = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        LD[i * n + j] = L[i * n + j] * D[j];
      }
    }
    const reconA = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        for (let k = 0; k < n; k++) {
          reconA[i * n + j] += LD[i * n + k] * L[j * n + k];
        }
      }
    }

    // Apply transpositions P on both sides: P * reconA * P^T
    // Transpositions apply on left: for i = n - 1 down to 0, swap row i and row P[i]
    for (let i = n - 1; i >= 0; --i) {
      const target = P[i];
      if (i !== target) {
        for (let col = 0; col < n; ++col) {
          const tmp = reconA[i * n + col];
          reconA[i * n + col] = reconA[target * n + col];
          reconA[target * n + col] = tmp;
        }
      }
    }
    // Transpositions apply on right (transpose): for i = 0 to n - 1, swap col i and col P[i]
    for (let i = 0; i < n; ++i) {
      const target = P[i];
      if (i !== target) {
        for (let row = 0; row < n; ++row) {
          const tmp = reconA[row * n + i];
          reconA[row * n + i] = reconA[row * n + target];
          reconA[row * n + target] = tmp;
        }
      }
    }

    const diff = reconA.map((val, idx) => val - A_vals[idx]);
    const resNorm = norm(diff);
    const pass = resNorm <= Math.max(norm(A_vals), 1.0) * PRECISION;
    if (!pass) failed++;
    report(`${name}: residual ||P L D L^T P^T - A|| = ${resNorm.toExponential(3)}`, pass, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (lPtr !== 0) Module._free(lPtr);
    if (dPtr !== 0) Module._free(dPtr);
    if (transPtr !== 0) Module._free(transPtr);
  }
}

// 1. Semi-definite positive matrix where Cholesky would fail
// A = [1, 2; 2, 4] (rank 1, eigenvalues 5 and 0)
testLDLT('LDLT positive semidefinite 2x2', [1, 2, 2, 4], 2);

// 2. 3x3 positive definite
testLDLT('LDLT 3x3', [4, 12, -16, 12, 45, -56, -16, -56, 97], 3);

// 3. BunchKaufman for indefinite symmetric matrix
// A = [0, 1; 1, 0] (eigenvalues 1 and -1)
{
  const indef = [0, 1, 1, 0];
  const aPtr = alloc(indef);
  const reconPtr = Module._malloc(4 * 8);
  try {
    const bkInfo = bunchKaufman(aPtr, 2, reconPtr);
    report('bunchKaufman indefinite info', bkInfo, SUCCESS);

    const recon = readDoubles(reconPtr, 4);
    const diff = recon.map((val, idx) => val - indef[idx]);
    const resNorm = norm(diff);
    const pass = resNorm <= PRECISION;
    report(`bunchKaufman residual ||recon - A|| = ${resNorm.toExponential(3)}`, pass, true);
  } finally {
    Module._free(aPtr);
    Module._free(reconPtr);
  }
}

// 4. Asymmetric matrix returns InvalidInput with untouched buffers
{
  const asymmetric = [1, 2, 3, 4];
  const aPtr = alloc(asymmetric);
  const lPtr = Module._malloc(4 * 8);
  const dPtr = Module._malloc(2 * 8);
  const transPtr = Module._malloc(2 * 4);
  Module.setValue(lPtr, SENTINEL, 'double');

  try {
    const info = ldlt(aPtr, 2, lPtr, dPtr, transPtr);
    report('LDLT asymmetric returns InvalidInput', info, INVALID_INPUT);

    const untouched = Module.getValue(lPtr, 'double') === SENTINEL;
    report('LDLT asymmetric leaves output untouched', untouched, true);
  } finally {
    Module._free(aPtr);
    Module._free(lPtr);
    Module._free(dPtr);
    if (transPtr !== 0) Module._free(transPtr);
  }
}

process.exit(failed ? 1 : 0);

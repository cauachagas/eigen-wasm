// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_ldlt.js: TDD test suite for Ticket 007 (LDLT and Bunch-Kaufman)
// Verifies LDLT factorization for positive semi-definite and indefinite symmetric matrices.
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const ldlt = Module.cwrap('ldlt', 'number', ['number', 'number', 'number', 'number']);
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

function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// Reconstruction check: ||L * D * L^T - A|| <= ||A|| * PRECISION
function testLDLT(name, A_vals, n) {
  let aPtr = 0, lPtr = 0, dPtr = 0;
  try {
    aPtr = alloc(A_vals);
    lPtr = Module._malloc(n * n * 8);
    dPtr = Module._malloc(n * 8);

    const info = ldlt(aPtr, n, lPtr, dPtr);
    report(`${name}: info`, info, SUCCESS);

    const L = readDoubles(lPtr, n * n);
    const D = readDoubles(dPtr, n);

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

    const diff = reconA.map((val, idx) => val - A_vals[idx]);
    const resNorm = norm(diff);
    const pass = resNorm <= Math.max(norm(A_vals), 1.0) * PRECISION;
    if (!pass) failed++;
    report(`${name}: residual ||L D L^T - A|| = ${resNorm.toExponential(3)}`, pass, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (lPtr !== 0) Module._free(lPtr);
    if (dPtr !== 0) Module._free(dPtr);
  }
}

// 1. Semi-definite positive matrix where Cholesky would fail
// A = [1, 2; 2, 4] (rank 1, eigenvalues 5 and 0)
testLDLT('LDLT positive semidefinite 2x2', [1, 2, 2, 4], 2);

// 2. 3x3 positive definite
testLDLT('LDLT 3x3', [4, 12, -16, 12, 45, -56, -16, -56, 97], 3);

// 3. Asymmetric matrix returns InvalidInput with untouched buffers
{
  const asymmetric = [1, 2, 3, 4];
  const aPtr = alloc(asymmetric);
  const lPtr = Module._malloc(4 * 8);
  const dPtr = Module._malloc(2 * 8);
  Module.setValue(lPtr, SENTINEL, 'double');

  try {
    const info = ldlt(aPtr, 2, lPtr, dPtr);
    report('LDLT asymmetric returns InvalidInput', info, INVALID_INPUT);

    const untouched = Module.getValue(lPtr, 'double') === SENTINEL;
    report('LDLT asymmetric leaves output untouched', untouched, true);
  } finally {
    Module._free(aPtr);
    Module._free(lPtr);
    Module._free(dPtr);
  }
}

process.exit(failed ? 1 : 0);

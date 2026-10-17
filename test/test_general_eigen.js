// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_general_eigen.js: TDD test suite for Ticket 013 (General Eigensolver over RealSchur)
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const generalEigen = Module.cwrap('generalEigen', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const NO_CONVERGENCE = 2;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -1.1111111111111e-100;
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

// 1. Matrix with complex conjugate eigenvalues
// Rotation 90 degrees:
// [ 0, -1 ]
// [ 1,  0 ]
// Eigenvalues are +i and -i (real = [0, 0], imag = [1, -1])
{
  const n = 2;
  const A = [0, -1, 1, 0];
  const aPtr = alloc(A);
  const realValPtr = Module._malloc(n * 8);
  const imagValPtr = Module._malloc(n * 8);
  const realVecPtr = Module._malloc(n * n * 8);
  const imagVecPtr = Module._malloc(n * n * 8);

  const info = generalEigen(aPtr, n, realValPtr, imagValPtr, realVecPtr, imagVecPtr);
  report('generalEigen 2x2 rotation info', info, SUCCESS);

  const realVals = readDoubles(realValPtr, n);
  const imagVals = readDoubles(imagValPtr, n);

  report('real parts of rotation eigenvalues are 0', realVals.map(v => Math.round(v)), [0, 0]);
  report('imag parts are complex conjugates [1, -1]', imagVals.map(v => Math.round(v)), [1, -1]);

  Module._free(aPtr);
  Module._free(realValPtr);
  Module._free(imagValPtr);
  Module._free(realVecPtr);
  Module._free(imagVecPtr);
}

// 2. Preconditions: non-positive or oversized dimension
{
  const A = [1];
  const aPtr = alloc(A);
  const rVal = Module._malloc(8);
  const iVal = Module._malloc(8);
  const rVec = Module._malloc(8);
  const iVec = Module._malloc(8);
  Module.setValue(rVal, SENTINEL, 'double');

  const info = generalEigen(aPtr, 0, rVal, iVal, rVec, iVec);
  report('generalEigen n=0 returns InvalidInput', info, INVALID_INPUT);

  const untouched = Module.getValue(rVal, 'double') === SENTINEL;
  report('generalEigen output untouched on InvalidInput', untouched, true);

  Module._free(aPtr);
  Module._free(rVal);
  Module._free(iVal);
  Module._free(rVec);
  Module._free(iVec);
}

process.exit(failed ? 1 : 0);

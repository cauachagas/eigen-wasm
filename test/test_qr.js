// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// qr() and solveLeastSquares() over WASM memory.
// Returns Eigen's ComputationInfo verbatim (Success = 0, NumericalIssue = 1, InvalidInput = 3).
// Verified by:
//   - Q orthogonality: ||Q^T Q - I|| <= ref * PRECISION
//   - QR reconstruction: ||Q R - A|| <= ref * PRECISION
//   - Least squares normal equations: ||A^T (A x - b)|| <= ref * PRECISION
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const qr = Module.cwrap('qr', 'number', ['number', 'number', 'number', 'number', 'number']);
const solveLeastSquares = Module.cwrap('solveLeastSquares', 'number', ['number', 'number', 'number', 'number', 'number']);
const matMul = Module.cwrap('matMul', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -8.8888888888888e-100;
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

// Test QR factorization
function testQR(name, A_vals, rows, cols) {
  let aPtr = 0, qPtr = 0, rPtr = 0;
  try {
    aPtr = alloc(A_vals);
    qPtr = Module._malloc(rows * rows * 8);
    rPtr = Module._malloc(rows * cols * 8);
    for (let i = 0; i < rows * cols; i++) Module.setValue(rPtr + i * 8, SENTINEL, 'double');

    const info = qr(aPtr, rows, cols, qPtr, rPtr);
    report(`${name}: info`, info, SUCCESS);

    const Q = readDoubles(qPtr, rows * rows);
    const R = readDoubles(rPtr, rows * cols);

    // 1. Q^T Q == I
    // Compute Q^T * Q using matMul
    const qTrans = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < rows; j++) {
        qTrans.push(Q[j * rows + i]);
      }
    }
    const qtPtr = alloc(qTrans);
    const qtQPtr = Module._malloc(rows * rows * 8);
    matMul(qtPtr, qPtr, rows, rows, rows, qtQPtr);
    const qtQ = readDoubles(qtQPtr, rows * rows);
    Module._free(qtPtr);
    Module._free(qtQPtr);

    const diffOrth = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < rows; j++) {
        diffOrth.push(qtQ[i * rows + j] - (i === j ? 1 : 0));
      }
    }
    const orthNorm = norm(diffOrth);
    const passOrth = orthNorm <= Math.sqrt(rows) * PRECISION;
    if (!passOrth) failed++;
    report(`${name}: Q orthogonality ||Q^T Q - I|| = ${orthNorm.toExponential(3)}`, passOrth, true);

    // 2. Q * R == A
    const qrPtr = Module._malloc(rows * cols * 8);
    matMul(qPtr, rPtr, rows, rows, cols, qrPtr);
    const reconA = readDoubles(qrPtr, rows * cols);
    Module._free(qrPtr);

    const diffRecon = reconA.map((val, idx) => val - A_vals[idx]);
    const reconNorm = norm(diffRecon);
    const aNorm = norm(A_vals);
    const passRecon = reconNorm <= Math.max(aNorm, 1.0) * PRECISION;
    if (!passRecon) failed++;
    report(`${name}: reconstruction ||Q R - A|| = ${reconNorm.toExponential(3)}`, passRecon, true);

    // 3. R is strictly upper-triangular: entries with i > j must be exactly 0.0
    let lowerZero = true;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (i > j && R[i * cols + j] !== 0) {
          lowerZero = false;
        }
      }
    }
    if (!lowerZero) failed++;
    report(`${name}: R strictly upper triangular (zeros below diagonal)`, lowerZero, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (qPtr !== 0) Module._free(qPtr);
    if (rPtr !== 0) Module._free(rPtr);
  }
}

// 2x2 Square
testQR('QR 2x2', [1, 2, 3, 4], 2, 2);

// 3x2 Rectangular (rows > cols)
testQR('QR 3x2', [1, 2, 3, 4, 5, 6], 3, 2);

// 2x3 Rectangular (rows < cols)
testQR('QR 2x3', [1, 2, 3, 4, 5, 6], 2, 3);

// Test least squares solver
function testLS(name, A_vals, b_vals, rows, cols, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(b_vals);
    xPtr = Module._malloc(cols * 8);

    const info = solveLeastSquares(aPtr, bPtr, rows, cols, xPtr);
    report(`${name}: info`, info, SUCCESS);

    const x = readDoubles(xPtr, cols);
    if (expectedX) {
      for (let i = 0; i < cols; i++) {
        const diff = Math.abs(x[i] - expectedX[i]);
        const pass = diff <= PRECISION * Math.max(Math.abs(expectedX[i]), 1.0);
        if (!pass) failed++;
        report(`${name}: x[${i}]`, pass, true);
      }
    }

    // Normal equations check: A^T (A x - b) == 0
    // Ax:
    const Ax = new Array(rows).fill(0);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        Ax[i] += A_vals[i * cols + j] * x[j];
      }
    }
    const r = Ax.map((val, idx) => val - b_vals[idx]);

    // A^T * r:
    const atR = new Array(cols).fill(0);
    for (let j = 0; j < cols; j++) {
      for (let i = 0; i < rows; i++) {
        atR[j] += A_vals[i * cols + j] * r[i];
      }
    }
    const normalNorm = norm(atR);
    const passNormal = normalNorm <= Math.max(norm(b_vals), 1.0) * PRECISION;
    if (!passNormal) failed++;
    report(`${name}: normal equations ||A^T (Ax - b)|| = ${normalNorm.toExponential(3)}`, passNormal, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (bPtr !== 0) Module._free(bPtr);
    if (xPtr !== 0) Module._free(xPtr);
  }
}

// 2x2 exact system
testLS('LS 2x2', [1, 2, 3, 4], [5, 11], 2, 2, [1, 2]);

// 3x2 overdetermined system:
// [1, 1] [x0]   [ 2]
// [1, 2] [x1] = [ 3]
// [1, 3]        [ 5]
// Normal equations:
// A^T A = [3, 6; 6, 14]
// A^T b = [10, 23]
// Solution: x1 = 1.5, x0 = 1/3
testLS('LS 3x2', [1, 1, 1, 2, 1, 3], [2, 3, 5], 3, 2, [1/3, 1.5]);

// Preconditions / rejected inputs
const rejected = [
  ['null matrix pointer', null, 2, 2],
  ['zero rows', [1], 0, 1],
  ['zero cols', [1], 1, 0],
  ['negative rows', [1], -1, 2],
  ['above ceiling', [1], MAX_DIMENSION + 1, 2],
];

for (const [name, A_vals, rows, cols] of rejected) {
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const qPtr = Module._malloc(Math.max(rows * rows, 1) * 8);
  const rPtr = Module._malloc(Math.max(rows * cols, 1) * 8);
  Module.setValue(qPtr, SENTINEL, 'double');
  Module.setValue(rPtr, SENTINEL, 'double');

  try {
    const info = qr(aPtr, rows, cols, qPtr, rPtr);
    report(`qr ${name}: InvalidInput`, info, INVALID_INPUT);

    const qUntouched = Module.getValue(qPtr, 'double') === SENTINEL;
    const rUntouched = Module.getValue(rPtr, 'double') === SENTINEL;
    report(`qr ${name}: buffers untouched`, qUntouched && rUntouched, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    Module._free(qPtr);
    Module._free(rPtr);
  }
}

// Contract tests for matMul dynamic dimensions
{
  const aPtr = alloc([1, 2, 3, 4]);
  const bPtr = alloc([5, 6, 7, 8]);
  const outPtr = Module._malloc(4 * 8);
  Module.setValue(outPtr, SENTINEL, 'double');

  try {
    const infoNull = matMul(0, bPtr, 2, 2, 2, outPtr);
    report('matMul null A pointer: InvalidInput', infoNull, INVALID_INPUT);
    report('matMul null A pointer: output untouched', Module.getValue(outPtr, 'double') === SENTINEL, true);

    const infoZero = matMul(aPtr, bPtr, 0, 2, 2, outPtr);
    report('matMul zero rowsA: InvalidInput', infoZero, INVALID_INPUT);
    report('matMul zero rowsA: output untouched', Module.getValue(outPtr, 'double') === SENTINEL, true);

    const infoCeil = matMul(aPtr, bPtr, 2, MAX_DIMENSION + 1, 2, outPtr);
    report('matMul colsA above ceiling: InvalidInput', infoCeil, INVALID_INPUT);
    report('matMul colsA above ceiling: output untouched', Module.getValue(outPtr, 'double') === SENTINEL, true);
  } finally {
    Module._free(aPtr);
    Module._free(bPtr);
    Module._free(outPtr);
  }
}

// Test non-finite input rejection and untouched buffers for qr and solveLeastSquares
{
  const nanMat = [NaN, 1, 2, 3];
  const aPtr = alloc(nanMat);
  const bPtr = alloc([1, 2]);
  const xPtr = Module._malloc(2 * 8);
  Module.setValue(xPtr, SENTINEL, 'double');
  Module.setValue(xPtr + 8, SENTINEL, 'double');

  const lsInfo = solveLeastSquares(aPtr, bPtr, 2, 2, xPtr);
  report('LS NaN in A returns InvalidInput', lsInfo, INVALID_INPUT);
  report('LS NaN in A leaves output untouched',
    Module.getValue(xPtr, 'double') === SENTINEL && Module.getValue(xPtr + 8, 'double') === SENTINEL, true);

  const qPtr = Module._malloc(4 * 8);
  const rPtr = Module._malloc(4 * 8);
  Module.setValue(qPtr, SENTINEL, 'double');
  Module.setValue(rPtr, SENTINEL, 'double');
  const qrInfo = qr(aPtr, 2, 2, qPtr, rPtr);
  report('QR NaN in A returns InvalidInput', qrInfo, INVALID_INPUT);
  report('QR NaN in A leaves buffers untouched',
    Module.getValue(qPtr, 'double') === SENTINEL && Module.getValue(rPtr, 'double') === SENTINEL, true);

  Module._free(aPtr);
  Module._free(bPtr);
  Module._free(xPtr);
  Module._free(qPtr);
  Module._free(rPtr);
}

process.exit(failed ? 1 : 0);

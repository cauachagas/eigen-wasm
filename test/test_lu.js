// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// solveLU() and inv() over WASM memory: solving A x = b and computing inv(A)
// using FullPivLU over row-major matrices, returning Eigen's ComputationInfo verbatim.
// Verification uses residual norms (||A x - b|| and ||A * inv(A) - I||) and known hand-computed solutions.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const solveLU = Module.cwrap('solveLU', 'number', ['number', 'number', 'number', 'number']);
const inv = Module.cwrap('inv', 'number', ['number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

// Eigen::ComputationInfo enum values verbatim
const SUCCESS = 0;
const NUMERICAL_ISSUE = 1;
const INVALID_INPUT = 3;

// Precision for double (matching Eigen reference suite EIGEN_TEST_PRECISION: 1e-6)
const PRECISION = 1e-6;

// Sentinel to verify output buffer is untouched on failure
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

// Eigen's relative check: diff <= min(|got|, |expected|) * PRECISION
function closeEnough(got, expected) {
  return Number.isFinite(got) && Number.isFinite(expected) &&
      Math.abs(got - expected) <= Math.min(Math.abs(got), Math.abs(expected)) * PRECISION;
}

// Residual norm check: ||diff|| <= referenceNorm * PRECISION
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

// Matrix-vector multiply in JS for residual ||A x - b|| computation
function matVecMul(A, x, n) {
  const res = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      res[i] += A[i * n + j] * x[j];
    }
  }
  return res;
}

// Matrix-matrix multiply in JS for residual ||A * invA - I|| computation
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

// Euclidean / Frobenius norm
function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

// --- 1. Test solveLU successful cases and residual check ---

function testSolveLU(name, A_vals, b_vals, n, expectedX) {
  let aPtr = 0, bPtr = 0, xPtr = 0;
  try {
    aPtr = alloc(A_vals);
    bPtr = alloc(b_vals);
    xPtr = Module._malloc(n * 8);

    const info = solveLU(aPtr, bPtr, n, xPtr);
    report(`${name}: info`, info, SUCCESS);

    const x = readDoubles(xPtr, n);
    for (let i = 0; i < n; i++) {
      if (expectedX) {
        const pass = closeEnough(x[i], expectedX[i]);
        if (!pass) failed++;
        report(`${name}: coeff[${i}]`, pass, true);
      }
    }

    // Residual check: ||A x - b|| <= max(||b||, 1) * PRECISION
    const Ax = matVecMul(A_vals, x, n);
    const diff = Ax.map((val, idx) => val - b_vals[idx]);
    const resNorm = norm(diff);
    const bNorm = norm(b_vals);
    const passResidual = residualPasses(resNorm, bNorm);
    if (!passResidual) failed++;
    report(`${name}: residual ||Ax - b|| = ${resNorm.toExponential(3)}`, passResidual, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw an unexpected error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (bPtr !== 0) Module._free(bPtr);
    if (xPtr !== 0) Module._free(xPtr);
  }
}

// 1x1: 2*x = 8 => x = 4
testSolveLU('solveLU 1x1', [2], [8], 1, [4]);

// 2x2:
// [1, 2] [x0] = [5] => x0 = 1, x1 = 2
// [3, 4] [x1] = [11]
testSolveLU('solveLU 2x2', [1, 2, 3, 4], [5, 11], 2, [1, 2]);

// 3x3:
// [2,  1, -1] [x0] = [ 8] => x0 = 2, x1 = 3, x2 = -1
// [-3, -1, 2] [x1] = [-11]
// [-2,  1, 2] [x2] = [-3]
testSolveLU('solveLU 3x3',
  [2, 1, -1, -3, -1, 2, -2, 1, 2],
  [8, -11, -3],
  3,
  [2, 3, -1]
);

// --- 2. Test inv successful cases and identity residual check ---

function testInv(name, A_vals, n, expectedInv) {
  let aPtr = 0, invPtr = 0;
  try {
    aPtr = alloc(A_vals);
    invPtr = Module._malloc(n * n * 8);

    const info = inv(aPtr, n, invPtr);
    report(`${name}: info`, info, SUCCESS);

    const invA = readDoubles(invPtr, n * n);
    if (expectedInv) {
      for (let i = 0; i < n * n; i++) {
        const pass = closeEnough(invA[i], expectedInv[i]);
        if (!pass) failed++;
        report(`${name}: coeff[${i}]`, pass, true);
      }
    }

    // Identity residual check: ||A * invA - I|| <= max(||I||, 1) * PRECISION
    const prod = matMul(A_vals, invA, n);
    const diff = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const expectedVal = i === j ? 1 : 0;
        diff.push(prod[i * n + j] - expectedVal);
      }
    }
    const resNorm = norm(diff);
    const passResidual = residualPasses(resNorm, Math.sqrt(n));
    if (!passResidual) failed++;
    report(`${name}: residual ||A*invA - I|| = ${resNorm.toExponential(3)}`, passResidual, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw an unexpected error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (invPtr !== 0) Module._free(invPtr);
  }
}

// 1x1: [4]^-1 = [0.25]
testInv('inv 1x1', [4], 1, [0.25]);

// 2x2:
// [4, 7]^-1 = [ 0.6, -0.7]
// [2, 6]      [-0.2,  0.4]
// det = 24 - 14 = 10
testInv('inv 2x2', [4, 7, 2, 6], 2, [0.6, -0.7, -0.2, 0.4]);

// --- 3. Test singular matrices: must return NumericalIssue and leave output untouched ---

{
  // Singular 2x2: row 2 is 2x row 1
  const singularA = [1, 2, 2, 4];
  const b = [3, 6];

  let aPtr = 0, bPtr = 0, outPtr = 0;
  try {
    aPtr = alloc(singularA);
    bPtr = alloc(b);
    outPtr = Module._malloc(2 * 8);
    for (let i = 0; i < 2; i++) Module.setValue(outPtr + i * 8, SENTINEL, 'double');

    const info = solveLU(aPtr, bPtr, 2, outPtr);
    report('solveLU singular returns NumericalIssue', info, NUMERICAL_ISSUE);

    const untouched = readDoubles(outPtr, 2).every(v => v === SENTINEL);
    report('solveLU singular leaves output untouched', untouched, true);
  } catch (err) {
    failed++;
    console.error(`not ok - solveLU singular threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (bPtr !== 0) Module._free(bPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }

  // Singular inv
  let invOutPtr = 0;
  try {
    aPtr = alloc(singularA);
    invOutPtr = Module._malloc(4 * 8);
    for (let i = 0; i < 4; i++) Module.setValue(invOutPtr + i * 8, SENTINEL, 'double');

    const info = inv(aPtr, 2, invOutPtr);
    report('inv singular returns NumericalIssue', info, NUMERICAL_ISSUE);

    const untouched = readDoubles(invOutPtr, 4).every(v => v === SENTINEL);
    report('inv singular leaves output untouched', untouched, true);
  } catch (err) {
    failed++;
    console.error(`not ok - inv singular threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (invOutPtr !== 0) Module._free(invOutPtr);
  }
}

// --- 4. Contract checks on InvalidInput: non-finite, null, non-positive, ceiling ---

// inv with non-finite input (NaN)
{
  let aPtr = 0, outPtr = 0;
  try {
    aPtr = alloc([NaN, 2, 3, 4]);
    outPtr = Module._malloc(4 * 8);
    for (let i = 0; i < 4; i++) Module.setValue(outPtr + i * 8, SENTINEL, 'double');

    const info = inv(aPtr, 2, outPtr);
    report('inv non-finite input returns InvalidInput', info, INVALID_INPUT);

    const untouched = readDoubles(outPtr, 4).every(v => v === SENTINEL);
    report('inv non-finite leaves output untouched', untouched, true);
  } catch (err) {
    failed++;
    console.error(`not ok - inv non-finite threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

// Invalid inputs for solveLU
const solveLURejected = [
  ['null A pointer', null, [1, 2], 2],
  ['null b pointer', [1, 2, 3, 4], null, 2],
  ['null out pointer', [1, 2, 3, 4], [1, 2], 2],
  ['zero dimension', [1], [1], 0],
  ['negative dimension', [1], [1], -2],
  ['above ceiling', [1], [1], MAX_DIMENSION + 1],
];

for (const [name, A_vals, b_vals, n] of solveLURejected) {
  const hasOut = name !== 'null out pointer';
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const bPtr = b_vals === null ? 0 : alloc(b_vals);
  const outPtr = hasOut ? Module._malloc(Math.max(n, 1) * 8) : 0;
  if (hasOut) {
    for (let i = 0; i < Math.max(n, 1); i++) Module.setValue(outPtr + i * 8, SENTINEL, 'double');
  }

  try {
    const info = solveLU(aPtr, bPtr, n, outPtr);
    report(`solveLU ${name} returns InvalidInput`, info, INVALID_INPUT);

    if (hasOut) {
      const untouched = readDoubles(outPtr, Math.max(n, 1)).every(v => v === SENTINEL);
      report(`solveLU ${name} leaves output untouched`, untouched, true);
    }
  } catch (err) {
    failed++;
    console.error(`not ok - solveLU ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (bPtr !== 0) Module._free(bPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

// Invalid inputs for inv
const invRejected = [
  ['null matrix pointer', null, 2],
  ['null out pointer', [1, 2, 3, 4], 2],
  ['zero dimension', [1], 0],
  ['negative dimension', [1], -2],
  ['above ceiling', [1], MAX_DIMENSION + 1],
];

for (const [name, A_vals, n] of invRejected) {
  const hasOut = name !== 'null out pointer';
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const count = Math.max(n * n, 1);
  const outPtr = hasOut ? Module._malloc(count * 8) : 0;
  if (hasOut) {
    for (let i = 0; i < count; i++) Module.setValue(outPtr + i * 8, SENTINEL, 'double');
  }

  try {
    const info = inv(aPtr, n, outPtr);
    report(`inv ${name} returns InvalidInput`, info, INVALID_INPUT);

    if (hasOut) {
      const untouched = readDoubles(outPtr, count).every(v => v === SENTINEL);
      report(`inv ${name} leaves output untouched`, untouched, true);
    }
  } catch (err) {
    failed++;
    console.error(`not ok - inv ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

process.exit(failed ? 1 : 0);

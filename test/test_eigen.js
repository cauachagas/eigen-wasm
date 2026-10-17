// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// symmetricEigen() over WASM memory.
// Returns Eigen's ComputationInfo verbatim (Success = 0, NumericalIssue = 1, InvalidInput = 3).
// Verified by:
//   - Comparison against known analytical eigenvalues/eigenvectors.
//   - Residual norm for each eigenpair: ||A * v_i - lambda_i * v_i|| <= ref * PRECISION.
//   - Orthogonality / unitarity of eigenvectors: ||V^T V - I|| <= ref * PRECISION.
//   - Asymmetric matrix returns InvalidInput with untouched buffers.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const symmetricEigen = Module.cwrap('symmetricEigen', 'number', ['number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -5.5555555555555e-100;
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

function testSymmetricEigen(name, A_vals, n, expectedLambda) {
  let aPtr = 0, valPtr = 0, vecPtr = 0;
  try {
    aPtr = alloc(A_vals);
    valPtr = Module._malloc(n * 8);
    vecPtr = Module._malloc(n * n * 8);

    const info = symmetricEigen(aPtr, n, valPtr, vecPtr);
    report(`${name}: info`, info, SUCCESS);

    const lambdas = readDoubles(valPtr, n);
    const V = readDoubles(vecPtr, n * n);

    // 1. Eigenvalues comparison if provided
    if (expectedLambda) {
      for (let i = 0; i < n; i++) {
        const diff = Math.abs(lambdas[i] - expectedLambda[i]);
        const pass = diff <= PRECISION * Math.max(Math.abs(expectedLambda[i]), 1.0);
        if (!pass) failed++;
        report(`${name}: lambda[${i}]`, pass, true);
      }
    }

    // 2. Eigenvector residual for each column j: ||A * v_j - lambda_j * v_j||
    for (let j = 0; j < n; j++) {
      // Column j of V:
      const v_j = [];
      for (let i = 0; i < n; i++) v_j.push(V[i * n + j]);

      // A * v_j:
      const Av = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let k = 0; k < n; k++) {
          Av[i] += A_vals[i * n + k] * v_j[k];
        }
      }

      // Av - lambda_j * v_j:
      const diff = Av.map((val, idx) => val - lambdas[j] * v_j[idx]);
      const resNorm = norm(diff);
      const pass = resNorm <= Math.max(norm(A_vals), 1.0) * PRECISION;
      if (!pass) failed++;
      report(`${name}: eigenpair ${j} residual ||A v - lambda v|| = ${resNorm.toExponential(3)}`, pass, true);
    }

    // 3. Orthogonality V^T V == I
    const diffOrth = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let dot = 0;
        for (let k = 0; k < n; k++) dot += V[k * n + i] * V[k * n + j]; // V[:, i] . V[:, j]
        diffOrth.push(dot - (i === j ? 1 : 0));
      }
    }
    const orthNorm = norm(diffOrth);
    const passOrth = orthNorm <= Math.sqrt(n) * PRECISION;
    if (!passOrth) failed++;
    report(`${name}: V orthogonality ||V^T V - I|| = ${orthNorm.toExponential(3)}`, passOrth, true);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (valPtr !== 0) Module._free(valPtr);
    if (vecPtr !== 0) Module._free(vecPtr);
  }
}

// 1x1: A = [5] -> lambda = [5]
testSymmetricEigen('1x1', [5], 1, [5]);

// 2x2:
// A = [ 2, 1 ]
//     [ 1, 2 ]
// Characteristic equation: (2 - lambda)^2 - 1 = 0 => lambda = 1, 3.
testSymmetricEigen('2x2', [2, 1, 1, 2], 2, [1, 3]);

// 3x3 diagonal:
testSymmetricEigen('3x3 diagonal', [2, 0, 0, 0, 4, 0, 0, 0, 6], 3, [2, 4, 6]);

// Asymmetric matrix returns InvalidInput
{
  const asymmetric = [
    1, 2,
    3, 4
  ];
  const aPtr = alloc(asymmetric);
  const valPtr = Module._malloc(2 * 8);
  const vecPtr = Module._malloc(4 * 8);
  Module.setValue(valPtr, SENTINEL, 'double');

  try {
    const info = symmetricEigen(aPtr, 2, valPtr, vecPtr);
    report('asymmetric matrix returns InvalidInput', info, INVALID_INPUT);

    const untouched = Module.getValue(valPtr, 'double') === SENTINEL;
    report('asymmetric leaves output untouched', untouched, true);
  } finally {
    Module._free(aPtr);
    Module._free(valPtr);
    Module._free(vecPtr);
  }
}

// Precondition checks
const rejected = [
  ['null matrix pointer', null, 2],
  ['zero dimension', [1], 0],
  ['negative dimension', [1], -1],
  ['above ceiling', [1], MAX_DIMENSION + 1],
];

for (const [name, A_vals, n] of rejected) {
  const count = Math.max(n * n, 1);
  const aPtr = A_vals === null ? 0 : alloc(A_vals);
  const valPtr = Module._malloc(Math.max(n, 1) * 8);
  const vecPtr = Module._malloc(count * 8);
  Module.setValue(valPtr, SENTINEL, 'double');

  try {
    const info = symmetricEigen(aPtr, n, valPtr, vecPtr);
    report(`symmetricEigen ${name}: InvalidInput`, info, INVALID_INPUT);

    const untouched = Module.getValue(valPtr, 'double') === SENTINEL;
    report(`symmetricEigen ${name}: output untouched`, untouched, true);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    Module._free(valPtr);
    Module._free(vecPtr);
  }
}

process.exit(failed ? 1 : 0);

// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_cholesky_solve.js
// Tests for sparseCholeskySolve via opaque handle,
// adapted from deps/eigen/test/simplicial_cholesky.cpp and sparse_solver.h.

import createEigenModule from './eigen_wasm.js';
import {
  SUCCESS,
  INVALID_INPUT,
  SENTINEL,
  createTester
} from './test_helpers.js';

const Module = await createEigenModule();
const { report, alloc, allocInts, readDoubles, readInts, checkFailed } = createTester(Module);

// 4x4 SPD Matrix (1D Poisson / Laplacian):
// [  2 -1  0  0 ]
// [ -1  2 -1  0 ]
// [  0 -1  2 -1 ]
// [  0  0 -1  2 ]
const spdValues = [2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0];
const spdInner = [0, 1, 0, 1, 2, 1, 2, 3, 2, 3];
const spdOuter = [0, 2, 5, 8, 10];
const n = 4;
const nnz = 10;

// Helper to multiply A (4x4) by dense vector x
function mulAx(x) {
  return [
    2.0 * x[0] - x[1],
    -x[0] + 2.0 * x[1] - x[2],
    -x[1] + 2.0 * x[2] - x[3],
    -x[2] + 2.0 * x[3]
  ];
}

function normDiff(v1, v2) {
  let s = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    s += diff * diff;
  }
  return Math.sqrt(s);
}

// 1. SimplicialLDLT Solve with single RHS (nrhs = 1)
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  // Factorize
  const fStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  report('SimplicialLDLT factorize succeeds', fStatus, SUCCESS);
  const handle = readInts(pHandle, 1)[0];

  // b = [1.0, 2.0, 3.0, 4.0]
  const b = [1.0, 2.0, 3.0, 4.0];
  const pB = alloc(b);
  const pX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  const sStatus = Module._sparseCholeskySolve(handle, pB, 1, pX);
  report('sparseCholeskySolve LDLT single RHS status', sStatus, SUCCESS);

  const x = readDoubles(pX, 4);
  const Ax = mulAx(x);
  const residual = normDiff(Ax, b);
  report('sparseCholeskySolve LDLT residual < 1e-12', residual < 1e-12, true);

  // Clean up
  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pX);
}

// 2. SimplicialLLT Solve with single RHS (nrhs = 1)
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  const fStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 1, pHandle);
  report('SimplicialLLT factorize succeeds', fStatus, SUCCESS);
  const handle = readInts(pHandle, 1)[0];

  const b = [4.0, 1.0, 2.0, 3.0];
  const pB = alloc(b);
  const pX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  const sStatus = Module._sparseCholeskySolve(handle, pB, 1, pX);
  report('sparseCholeskySolve LLT single RHS status', sStatus, SUCCESS);

  const x = readDoubles(pX, 4);
  const Ax = mulAx(x);
  const residual = normDiff(Ax, b);
  report('sparseCholeskySolve LLT residual < 1e-12', residual < 1e-12, true);

  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pX);
}

// 3. Handle Reuse: Multiple solves on the same handle with different right-hand sides
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  const handle = readInts(pHandle, 1)[0];

  const b1 = [1.0, 0.0, 0.0, 0.0];
  const b2 = [0.0, 0.0, 0.0, 1.0];
  const pB1 = alloc(b1);
  const pB2 = alloc(b2);
  const pX1 = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
  const pX2 = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  // First solve
  report('Solve b1 on handle succeeds', Module._sparseCholeskySolve(handle, pB1, 1, pX1), SUCCESS);
  const x1 = readDoubles(pX1, 4);
  report('Residual b1 < 1e-12', normDiff(mulAx(x1), b1) < 1e-12, true);

  // Second solve on SAME handle
  report('Solve b2 on same handle succeeds', Module._sparseCholeskySolve(handle, pB2, 1, pX2), SUCCESS);
  const x2 = readDoubles(pX2, 4);
  report('Residual b2 < 1e-12', normDiff(mulAx(x2), b2) < 1e-12, true);

  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB1);
  Module._free(pB2);
  Module._free(pX1);
  Module._free(pX2);
}

// 4. Multiple Right-Hand Sides (nrhs = 2) in Row-Major Layout
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  const handle = readInts(pHandle, 1)[0];

  // B is 4 x 2 in row-major:
  // row 0: [1.0, 0.0]
  // row 1: [2.0, 1.0]
  // row 2: [3.0, 0.0]
  // row 3: [4.0, 1.0]
  const B = [
    1.0, 0.0,
    2.0, 1.0,
    3.0, 0.0,
    4.0, 1.0
  ];
  const pB = alloc(B);
  const pX = alloc(new Array(8).fill(SENTINEL));

  const status = Module._sparseCholeskySolve(handle, pB, 2, pX);
  report('sparseCholeskySolve nrhs = 2 status', status, SUCCESS);

  const X = readDoubles(pX, 8);
  // Column 0 of X should solve col 0 of B: [1, 2, 3, 4]
  const col0X = [X[0], X[2], X[4], X[6]];
  const col0B = [1.0, 2.0, 3.0, 4.0];
  report('Multiple RHS col 0 residual < 1e-12', normDiff(mulAx(col0X), col0B) < 1e-12, true);

  // Column 1 of X should solve col 1 of B: [0, 1, 0, 1]
  const col1X = [X[1], X[3], X[5], X[7]];
  const col1B = [0.0, 1.0, 0.0, 1.0];
  report('Multiple RHS col 1 residual < 1e-12', normDiff(mulAx(col1X), col1B) < 1e-12, true);

  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pX);
}

// 5. CSR Storage Order Solve (storageOrder = 1)
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  // Factorize CSR
  const fStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 1, 0, pHandle);
  report('SimplicialLDLT factorize CSR succeeds', fStatus, SUCCESS);
  const handle = readInts(pHandle, 1)[0];

  const b = [1.0, 2.0, 3.0, 4.0];
  const pB = alloc(b);
  const pX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  const sStatus = Module._sparseCholeskySolve(handle, pB, 1, pX);
  report('sparseCholeskySolve CSR status', sStatus, SUCCESS);

  const x = readDoubles(pX, 4);
  const residual = normDiff(mulAx(x), b);
  report('sparseCholeskySolve CSR residual < 1e-12', residual < 1e-12, true);

  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pX);
}

// 6. Input Validation and Untouched Buffer Invariants
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-1]);

  Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  const validHandle = readInts(pHandle, 1)[0];

  const b = [1.0, 2.0, 3.0, 4.0];
  const pB = alloc(b);
  const pX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  function allUntouched(ptr, count) {
    const vals = readDoubles(ptr, count);
    return vals.every(v => v === SENTINEL);
  }

  // Non-existent handle
  report('Non-existent handle returns INVALID_INPUT', Module._sparseCholeskySolve(99999, pB, 1, pX), INVALID_INPUT);
  report('outX untouched on non-existent handle', allUntouched(pX, 4), true);

  // Negative handle
  report('Negative handle returns INVALID_INPUT', Module._sparseCholeskySolve(-1, pB, 1, pX), INVALID_INPUT);
  report('outX untouched on negative handle', allUntouched(pX, 4), true);

  // Null b pointer
  report('Null b returns INVALID_INPUT', Module._sparseCholeskySolve(validHandle, 0, 1, pX), INVALID_INPUT);
  report('outX untouched on null b', allUntouched(pX, 4), true);

  // Null outX pointer
  report('Null outX returns INVALID_INPUT', Module._sparseCholeskySolve(validHandle, pB, 1, 0), INVALID_INPUT);

  // Invalid nrhs (<= 0)
  report('nrhs <= 0 returns INVALID_INPUT', Module._sparseCholeskySolve(validHandle, pB, 0, pX), INVALID_INPUT);
  report('outX untouched on nrhs <= 0', allUntouched(pX, 4), true);

  // Non-finite value in b (NaN)
  const nanB = [1.0, NaN, 3.0, 4.0];
  const pNanB = alloc(nanB);
  report('NaN in b returns INVALID_INPUT', Module._sparseCholeskySolve(validHandle, pNanB, 1, pX), INVALID_INPUT);
  report('outX untouched on NaN in b', allUntouched(pX, 4), true);
  Module._free(pNanB);

  // Non-finite value in b (Infinity)
  const infB = [1.0, Infinity, 3.0, 4.0];
  const pInfB = alloc(infB);
  report('Infinity in b returns INVALID_INPUT', Module._sparseCholeskySolve(validHandle, pInfB, 1, pX), INVALID_INPUT);
  report('outX untouched on Infinity in b', allUntouched(pX, 4), true);
  Module._free(pInfB);

  Module._sparseCholeskyDestroy(validHandle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pX);
}

if (checkFailed() > 0) {
  process.exit(1);
}
console.log('ALL TESTS PASSED');

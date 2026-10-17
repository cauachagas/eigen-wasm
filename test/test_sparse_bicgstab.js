// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_bicgstab.js
// Tests for sparseBiCGSTAB iterative solver for general square matrices,
// adapted from deps/eigen/test/bicgstab.cpp and sparse_solver.h.

import createEigenModule from './eigen_wasm.js';
import {
  SUCCESS,
  NUMERICAL_ISSUE,
  NO_CONVERGENCE,
  INVALID_INPUT,
  SENTINEL,
  createTester
} from './test_helpers.js';

const Module = await createEigenModule();
const { report, alloc, allocInts, readDoubles, readInts, checkFailed } = createTester(Module);

function normDiff(v1, v2) {
  let s = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    s += diff * diff;
  }
  return Math.sqrt(s);
}

function vecNorm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i] * v[i];
  }
  return Math.sqrt(s);
}

// 1. Upstream Issue #2899: 4x4 non-symmetric matrix in CSC format
// A:
// [ 1.0,           0.0,          0.0,          0.0 ]
// [ -1.0/6.0,  2.0/3.0,     -1.0/6.0,     -1.0/3.0 ]
// [  0.0,     -1.0/3.0,      1.0,         -2.0/3.0 ]
// [  0.0,     -1.0/3.0,     -1.0/3.0,      2.0/3.0 ]
// b = [0, 1, 1, 1]^T -> exact x = [0, 15, 18, 18]^T
{
  const n = 4;
  // Non-zeros in CSC order (col 0: 2 entries, col 1: 3 entries, col 2: 3 entries, col 3: 3 entries)
  // Col 0: row 0 = 1.0, row 1 = -1/6
  // Col 1: row 1 = 2/3, row 2 = -1/3, row 3 = -1/3
  // Col 2: row 1 = -1/6, row 2 = 1.0, row 3 = -1/3
  // Col 3: row 1 = -1/3, row 2 = -2/3, row 3 = 2/3
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;

  const b = [0.0, 1.0, 1.0, 1.0];
  const expectedX = [0.0, 15.0, 18.0, 18.0];

  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc(b);
  const pOutX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
  const pOutIters = allocInts([-1]);
  const pOutErr = alloc([SENTINEL]);

  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0, // CSC
    pB, 1, pOutX,
    100, 1e-12,
    pOutIters, pOutErr
  );

  report('BiCGSTAB CSC (upstream #2899) succeeds', status, SUCCESS);
  const xSol = readDoubles(pOutX, n);
  report('BiCGSTAB solution matches expected solution', normDiff(xSol, expectedX) < 1e-6, true);

  const iters = readInts(pOutIters, 1)[0];
  report('BiCGSTAB reported positive iterations', iters > 0 && iters <= 100, true);

  const estErr = readDoubles(pOutErr, 1)[0];
  report('BiCGSTAB reported error below tolerance', estErr <= 1e-12, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutIters);
  Module._free(pOutErr);
}

// 2. Upstream Issue #2856: 14x14 sparse matrix in CSR format
{
  const n = 14;
  // D = Identity(14, 14) + D(6, 13) = 1 + D(13, 12) = 1
  // In CSR format:
  // rows 0..5: (i, i) = 1
  // row 6: (6, 6) = 1, (6, 13) = 1
  // rows 7..12: (i, i) = 1
  // row 13: (13, 12) = 1, (13, 13) = 1
  const csrValues = [];
  const csrInner = [];
  const csrOuter = [0];

  for (let r = 0; r < n; r++) {
    if (r === 6) {
      csrValues.push(1.0, 1.0);
      csrInner.push(6, 13);
    } else if (r === 13) {
      csrValues.push(1.0, 1.0);
      csrInner.push(12, 13);
    } else {
      csrValues.push(1.0);
      csrInner.push(r);
    }
    csrOuter.push(csrValues.length);
  }
  const nnz = csrValues.length;

  // b has b(12) = -1001, rest 0
  const b = new Array(n).fill(0.0);
  b[12] = -1001.0;

  // Expected x: x(6) = -1001, x(12) = -1001, x(13) = 1001, rest 0
  const expectedX = new Array(n).fill(0.0);
  expectedX[6] = -1001.0;
  expectedX[12] = -1001.0;
  expectedX[13] = 1001.0;

  const pVals = alloc(csrValues);
  const pInner = allocInts(csrInner);
  const pOuter = allocInts(csrOuter);
  const pB = alloc(b);
  const pOutX = alloc(new Array(n).fill(SENTINEL));
  const pOutIters = allocInts([-1]);
  const pOutErr = alloc([SENTINEL]);

  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 1, // CSR
    pB, 1, pOutX,
    100, 1e-12,
    pOutIters, pOutErr
  );

  report('BiCGSTAB CSR (upstream #2856) succeeds', status, SUCCESS);
  const xSol = readDoubles(pOutX, n);
  report('BiCGSTAB #2856 solution matches expected', normDiff(xSol, expectedX) < 1e-6, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutIters);
  Module._free(pOutErr);
}

// 3. Defaults: maxIterations <= 0 and tolerance <= 0
{
  const n = 4;
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;
  const b = [0.0, 1.0, 1.0, 1.0];
  const expectedX = [0.0, 15.0, 18.0, 18.0];

  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc(b);
  const pOutX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
  const pOutIters = allocInts([-1]);
  const pOutErr = alloc([SENTINEL]);

  // maxIterations = 0 (defaults to 2 * n = 8), tolerance = 0.0 (defaults to machine epsilon)
  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, pOutX,
    0, 0.0,
    pOutIters, pOutErr
  );

  report('BiCGSTAB default parameters succeeds', status, SUCCESS);
  const xSol = readDoubles(pOutX, n);
  report('Default parameters solution accurate', normDiff(xSol, expectedX) < 1e-5, true);

  const iters = readInts(pOutIters, 1)[0];
  report('Default maxIterations allowed convergence', iters > 0 && iters <= 8, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutIters);
  Module._free(pOutErr);
}

// 4. Optional diagnostic pointers: null outIterations and null outEstimatedError
{
  const n = 4;
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;
  const b = [0.0, 1.0, 1.0, 1.0];
  const expectedX = [0.0, 15.0, 18.0, 18.0];

  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc(b);
  const pOutX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);

  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, pOutX,
    20, 1e-10,
    0, 0 // null diagnostic pointers
  );

  report('BiCGSTAB with null diagnostics succeeds', status, SUCCESS);
  const xSol = readDoubles(pOutX, n);
  report('Solution computed with null diagnostics', normDiff(xSol, expectedX) < 1e-5, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
}

// 5. Multiple Right-Hand Sides (nrhs = 2) in Row-Major layout
{
  const n = 4;
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;

  // b1 = [0, 1, 1, 1] -> exact x1 = [0, 15, 18, 18]
  // b2 = [1, -2/3, -1/3, 1] -> exact x2 = [1, 2, 3, 4]
  // Row-major b matrix (4x2):
  // row 0: 0.0, 1.0
  // row 1: 1.0, -2.0 / 3.0
  // row 2: 1.0, -1.0 / 3.0
  // row 3: 1.0, 1.0
  const bRowMajor = [
    0.0, 1.0,
    1.0, -2.0 / 3.0,
    1.0, -1.0 / 3.0,
    1.0, 1.0
  ];
  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc(bRowMajor);
  const pOutX = alloc(new Array(8).fill(SENTINEL));
  const pOutIters = allocInts([-1]);
  const pOutErr = alloc([SENTINEL]);

  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 2, pOutX,
    50, 1e-10,
    pOutIters, pOutErr
  );

  report('BiCGSTAB multi-RHS succeeds', status, SUCCESS);
  const xData = readDoubles(pOutX, 8);
  const xCol0 = [xData[0], xData[2], xData[4], xData[6]];
  const xCol1 = [xData[1], xData[3], xData[5], xData[7]];

  report('Multi-RHS column 0 matches expected x1', normDiff(xCol0, [0.0, 15.0, 18.0, 18.0]) < 1e-5, true);
  report('Multi-RHS column 1 matches expected x2', normDiff(xCol1, [1.0, 2.0, 3.0, 4.0]) < 1e-5, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutIters);
  Module._free(pOutErr);
}

// 6. NoConvergence (status = 2) when iteration budget is insufficient
{
  const n = 4;
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;
  const b = [0.0, 1.0, 1.0, 1.0];

  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc(b);
  const pOutX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
  const pOutIters = allocInts([-1]);
  const pOutErr = alloc([SENTINEL]);

  // Restricting to 1 iteration with tight tolerance guarantees NoConvergence
  const status = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, pOutX,
    1, 1e-14,
    pOutIters, pOutErr
  );

  report('BiCGSTAB returns NoConvergence when budget exhausted', status, NO_CONVERGENCE);

  const iters = readInts(pOutIters, 1)[0];
  report('NoConvergence reports 1 executed iteration', iters, 1);

  const estErr = readDoubles(pOutErr, 1)[0];
  report('NoConvergence reports estimated error > 1e-14', estErr > 1e-14, true);

  const xSol = readDoubles(pOutX, n);
  report('NoConvergence writes best-effort solution', xSol[0] !== SENTINEL, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutIters);
  Module._free(pOutErr);
}

// 7. Input validation and Untouched Buffer Invariant
{
  const n = 4;
  const cscValues = [
    1.0, -1.0 / 6.0,
    2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0,
    -1.0 / 6.0, 1.0, -1.0 / 3.0,
    -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0
  ];
  const cscInner = [
    0, 1,
    1, 2, 3,
    1, 2, 3,
    1, 2, 3
  ];
  const cscOuter = [0, 2, 5, 8, 11];
  const nnz = 11;

  const pVals = alloc(cscValues);
  const pInner = allocInts(cscInner);
  const pOuter = allocInts(cscOuter);
  const pB = alloc([0.0, 1.0, 1.0, 1.0]);

  function testInvalid(name, vals, inner, outer, dim, nonZeros, order, bPtr, nrhs, maxIters = 10, tol = 1e-6) {
    const pX = alloc([SENTINEL, SENTINEL, SENTINEL, SENTINEL]);
    const pIters = allocInts([-999]);
    const pErr = alloc([SENTINEL]);

    const status = Module._sparseBiCGSTAB(
      vals, inner, outer, dim, nonZeros, order,
      bPtr, nrhs, pX,
      maxIters, tol,
      pIters, pErr
    );
    report(`${name} returns INVALID_INPUT`, status, INVALID_INPUT);
    const xData = readDoubles(pX, 4);
    report(`${name} leaves outX untouched`, xData.every(v => v === SENTINEL), true);
    report(`${name} leaves outIterations untouched`, readInts(pIters, 1)[0], -999);
    report(`${name} leaves outEstimatedError untouched`, readDoubles(pErr, 1)[0], SENTINEL);

    Module._free(pX);
    Module._free(pIters);
    Module._free(pErr);
  }

  testInvalid('Null values', 0, pInner, pOuter, n, nnz, 0, pB, 1);
  testInvalid('Null innerIndices', pVals, 0, pOuter, n, nnz, 0, pB, 1);
  testInvalid('Null outerStarts', pVals, pInner, 0, n, nnz, 0, pB, 1);
  testInvalid('Null b', pVals, pInner, pOuter, n, nnz, 0, 0, 1);

  testInvalid('Invalid dimension n = 0', pVals, pInner, pOuter, 0, nnz, 0, pB, 1);
  testInvalid('Negative dimension n = -1', pVals, pInner, pOuter, -1, nnz, 0, pB, 1);
  testInvalid('Dimension exceeding max', pVals, pInner, pOuter, 1000001, nnz, 0, pB, 1);

  testInvalid('Negative nnz', pVals, pInner, pOuter, n, -1, 0, pB, 1);
  testInvalid('NNZ exceeding n*n', pVals, pInner, pOuter, n, 17, 0, pB, 1);
  testInvalid('Invalid storageOrder', pVals, pInner, pOuter, n, nnz, 2, pB, 1);
  testInvalid('Invalid nrhs = 0', pVals, pInner, pOuter, n, nnz, 0, pB, 0);
  testInvalid('Negative nrhs', pVals, pInner, pOuter, n, nnz, 0, pB, -1);

  // Non-monotonic inner indices
  const badInner = allocInts([1, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
  testInvalid('Non-monotonic innerIndices', pVals, badInner, pOuter, n, nnz, 0, pB, 1);
  Module._free(badInner);

  // Non-finite values in matrix
  const nanVals = alloc([NaN, -1.0 / 6.0, 2.0 / 3.0, -1.0 / 3.0, -1.0 / 3.0, -1.0 / 6.0, 1.0, -1.0 / 3.0, -1.0 / 3.0, -2.0 / 3.0, 2.0 / 3.0]);
  testInvalid('NaN in matrix values', nanVals, pInner, pOuter, n, nnz, 0, pB, 1);
  Module._free(nanVals);

  // Non-finite values in b
  const infB = alloc([0.0, Infinity, 1.0, 1.0]);
  testInvalid('Infinity in b vector', pVals, pInner, pOuter, n, nnz, 0, infB, 1);
  Module._free(infB);

  // Non-finite tolerance
  testInvalid('NaN in tolerance', pVals, pInner, pOuter, n, nnz, 0, pB, 1, 10, NaN);
  testInvalid('Infinity in tolerance', pVals, pInner, pOuter, n, nnz, 0, pB, 1, 10, Infinity);

  // Null outX pointer
  const pDiagIters = allocInts([-999]);
  const pDiagErr = alloc([SENTINEL]);
  const nullXStatus = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, 0,
    10, 1e-6,
    pDiagIters, pDiagErr
  );
  report('Null outX returns INVALID_INPUT', nullXStatus, INVALID_INPUT);
  report('Null outX leaves outIterations untouched', readInts(pDiagIters, 1)[0], -999);
  report('Null outX leaves outEstimatedError untouched', readDoubles(pDiagErr, 1)[0], SENTINEL);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pDiagIters);
  Module._free(pDiagErr);
}

// 8. NumericalIssue (division by zero / breakdown on singular system)
{
  // 2x2 singular system: [[1, 1], [1, 1]] with inconsistent b = [1, -1]
  const singVals = alloc([1.0, 1.0, 1.0, 1.0]);
  const singInner = allocInts([0, 1, 0, 1]);
  const singOuter = allocInts([0, 2, 4]);
  const bInconsistent = alloc([1.0, -1.0]);

  const pX = alloc([SENTINEL, SENTINEL]);
  const pIters = allocInts([-999]);
  const pErr = alloc([SENTINEL]);

  const status = Module._sparseBiCGSTAB(
    singVals, singInner, singOuter, 2, 4, 0,
    bInconsistent, 1, pX,
    10, 1e-12,
    pIters, pErr
  );

  report('Singular breakdown system returns NUMERICAL_ISSUE', status, NUMERICAL_ISSUE);
  const xData = readDoubles(pX, 2);
  report('NUMERICAL_ISSUE leaves outX untouched', xData.every(v => v === SENTINEL), true);
  report('NUMERICAL_ISSUE leaves outIterations untouched', readInts(pIters, 1)[0], -999);
  report('NUMERICAL_ISSUE leaves outEstimatedError untouched', readDoubles(pErr, 1)[0], SENTINEL);

  Module._free(singVals);
  Module._free(singInner);
  Module._free(singOuter);
  Module._free(bInconsistent);
  Module._free(pX);
  Module._free(pIters);
  Module._free(pErr);
}

if (checkFailed() === 0) {
  console.log('ALL TESTS PASSED');
}
process.exit(checkFailed());

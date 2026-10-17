// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_solvers_integration.js
// End-to-end integration, capacity limits, and untouched buffer invariant tests
// for sparse direct and iterative solvers.

import createEigenModule from './eigen_wasm.js';
import {
  SUCCESS,
  NUMERICAL_ISSUE,
  INVALID_INPUT,
  SENTINEL,
  createTester
} from './test_helpers.js';

const Module = await createEigenModule();
const { report, alloc, allocInts, readDoubles, readInts, checkFailed } = createTester(Module);

// 1. Opaque Handle Stress and Lifecycle Integrity
{
  // Allocate 10 concurrent solver instances (alternating LDLT and LLT)
  const spdValues = [2.0, -1.0, -1.0, 2.0];
  const spdInner = [0, 1, 0, 1];
  const spdOuter = [0, 2, 4];
  const n = 2;
  const nnz = 4;

  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);

  const handles = [];
  for (let i = 0; i < 10; i++) {
    const pHandle = allocInts([-1]);
    const solverType = i % 2; // 0 = LDLT, 1 = LLT
    const status = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, solverType, pHandle);
    report(`Concurrent factorize instance ${i} succeeds`, status, SUCCESS);
    const h = readInts(pHandle, 1)[0];
    report(`Concurrent instance ${i} positive handle`, h > 0, true);
    handles.push(h);
    Module._free(pHandle);
  }

  // Verify all allocated handles are distinct
  const uniqueHandles = new Set(handles);
  report('All 10 solver handles are unique', uniqueHandles.size, 10);

  // Solve through each instance
  const b = [1.0, 1.0];
  const pB = alloc(b);
  for (let i = 0; i < 10; i++) {
    const pX = alloc([SENTINEL, SENTINEL]);
    const status = Module._sparseCholeskySolve(handles[i], pB, 1, pX);
    report(`Solve instance ${i} succeeds`, status, SUCCESS);
    const x = readDoubles(pX, 2);
    // [ 2 -1; -1 2 ] * [1; 1] = [1; 1]
    report(`Solve instance ${i} solution accurate`, Math.abs(x[0] - 1.0) < 1e-10 && Math.abs(x[1] - 1.0) < 1e-10, true);
    Module._free(pX);
  }

  // Destroy handles in reverse order
  for (let i = 9; i >= 0; i--) {
    const status = Module._sparseCholeskyDestroy(handles[i]);
    report(`Destroy instance ${i} succeeds`, status, SUCCESS);
    // Verify double destroy is rejected
    const secondDestroy = Module._sparseCholeskyDestroy(handles[i]);
    report(`Double destroy instance ${i} returns INVALID_INPUT`, secondDestroy, INVALID_INPUT);

    // Verify solve with destroyed handle is rejected and leaves outX untouched
    const pX = alloc([SENTINEL, SENTINEL]);
    const solveStatus = Module._sparseCholeskySolve(handles[i], pB, 1, pX);
    report(`Solve destroyed handle ${i} returns INVALID_INPUT`, solveStatus, INVALID_INPUT);
    const x = readDoubles(pX, 2);
    report(`Solve destroyed handle ${i} leaves outX untouched`, x[0] === SENTINEL && x[1] === SENTINEL, true);
    Module._free(pX);
  }

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
}

// 2. Large Scale Dimension Limits (1,000,000 ceiling per REQ-SOLV-025)
{
  const pHandle = allocInts([-1]);
  const pVals = alloc([1.0]);
  const pInner = allocInts([0]);
  const pOuter = allocInts([0, 1]);

  // Dimension = 1,000,001 exceeds ceiling -> INVALID_INPUT
  const overDimStatus = Module._sparseCholeskyFactorize(
    pVals, pInner, pOuter, 1000001, 1, 0, 0, pHandle
  );
  report('Cholesky rejects n > 1,000,000 with INVALID_INPUT', overDimStatus, INVALID_INPUT);
  report('Cholesky leaves outHandle untouched on dimension limit', readInts(pHandle, 1)[0], -1);

  // NNZ > 10,000,000 exceeds ceiling -> INVALID_INPUT
  const overNnzStatus = Module._sparseCholeskyFactorize(
    pVals, pInner, pOuter, 1000, 10000001, 0, 0, pHandle
  );
  report('Cholesky rejects nnz > 10,000,000 with INVALID_INPUT', overNnzStatus, INVALID_INPUT);

  // Conjugate Gradient rejects dimension > 1,000,000
  const pOutX = alloc([SENTINEL]);
  const pIters = allocInts([-999]);
  const pErr = alloc([SENTINEL]);
  const cgOverDim = Module._sparseConjugateGradient(
    pVals, pInner, pOuter, 1000001, 1, 0,
    pVals, 1, pOutX,
    10, 1e-6,
    pIters, pErr
  );
  report('CG rejects n > 1,000,000 with INVALID_INPUT', cgOverDim, INVALID_INPUT);
  report('CG preserves outX on dimension ceiling', readDoubles(pOutX, 1)[0], SENTINEL);
  report('CG preserves outIterations on dimension ceiling', readInts(pIters, 1)[0], -999);
  report('CG preserves outEstimatedError on dimension ceiling', readDoubles(pErr, 1)[0], SENTINEL);

  // BiCGSTAB rejects nnz > 10,000,000
  const bicgOverNnz = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, 1000, 10000001, 0,
    pVals, 1, pOutX,
    10, 1e-6,
    pIters, pErr
  );
  report('BiCGSTAB rejects nnz > 10,000,000 with INVALID_INPUT', bicgOverNnz, INVALID_INPUT);
  report('BiCGSTAB preserves outX on nnz ceiling', readDoubles(pOutX, 1)[0], SENTINEL);

  // Multi-RHS total elements limit (> 20,000,000)
  const cgOverRhs = Module._sparseConjugateGradient(
    pVals, pInner, pOuter, 1000000, 1, 0,
    pVals, 21, pOutX, // 1,000,000 * 21 = 21,000,000 > 20,000,000
    10, 1e-6,
    pIters, pErr
  );
  report('CG rejects n * nrhs > 20,000,000 with INVALID_INPUT', cgOverRhs, INVALID_INPUT);
  report('CG preserves outX on capacity ceiling', readDoubles(pOutX, 1)[0], SENTINEL);

  Module._free(pHandle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pOutX);
  Module._free(pIters);
  Module._free(pErr);
}

// 3. End-to-End Equivalence: Direct Solver vs CG vs BiCGSTAB on 3x3 SPD System
{
  // 3x3 SPD Matrix:
  // [  4 -1  0 ]
  // [ -1  4 -1 ]
  // [  0 -1  4 ]
  const spdValues = [4.0, -1.0, -1.0, 4.0, -1.0, -1.0, 4.0];
  const spdInner = [0, 1, 0, 1, 2, 1, 2];
  const spdOuter = [0, 2, 5, 7];
  const n = 3;
  const nnz = 7;
  const b = [3.0, 2.0, 3.0]; // Exact solution is [1.0, 1.0, 1.0]

  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pB = alloc(b);

  // Direct Solve via SimplicialLDLT
  const pHandle = allocInts([-1]);
  const fStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  report('E2E Cholesky factorize succeeds', fStatus, SUCCESS);
  const handle = readInts(pHandle, 1)[0];

  const pOutDirect = alloc([SENTINEL, SENTINEL, SENTINEL]);
  const dStatus = Module._sparseCholeskySolve(handle, pB, 1, pOutDirect);
  report('E2E Cholesky solve succeeds', dStatus, SUCCESS);
  const xDirect = readDoubles(pOutDirect, 3);
  report('E2E Direct solution matches [1, 1, 1]', Math.abs(xDirect[0] - 1.0) < 1e-10 && Math.abs(xDirect[1] - 1.0) < 1e-10 && Math.abs(xDirect[2] - 1.0) < 1e-10, true);

  // Iterative Solve via Conjugate Gradient
  const pOutCG = alloc([SENTINEL, SENTINEL, SENTINEL]);
  const pCGIters = allocInts([-1]);
  const pCGErr = alloc([SENTINEL]);
  const cgStatus = Module._sparseConjugateGradient(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, pOutCG,
    20, 1e-12,
    pCGIters, pCGErr
  );
  report('E2E CG solve succeeds', cgStatus, SUCCESS);
  const xCG = readDoubles(pOutCG, 3);
  report('E2E CG solution matches Direct solution', Math.abs(xCG[0] - xDirect[0]) < 1e-6 && Math.abs(xCG[1] - xDirect[1]) < 1e-6 && Math.abs(xCG[2] - xDirect[2]) < 1e-6, true);

  // Iterative Solve via BiCGSTAB
  const pOutBiCG = alloc([SENTINEL, SENTINEL, SENTINEL]);
  const pBiCGIters = allocInts([-1]);
  const pBiCGErr = alloc([SENTINEL]);
  const bicgStatus = Module._sparseBiCGSTAB(
    pVals, pInner, pOuter, n, nnz, 0,
    pB, 1, pOutBiCG,
    20, 1e-12,
    pBiCGIters, pBiCGErr
  );
  report('E2E BiCGSTAB solve succeeds', bicgStatus, SUCCESS);
  const xBiCG = readDoubles(pOutBiCG, 3);
  report('E2E BiCGSTAB solution matches Direct solution', Math.abs(xBiCG[0] - xDirect[0]) < 1e-6 && Math.abs(xBiCG[1] - xDirect[1]) < 1e-6 && Math.abs(xBiCG[2] - xDirect[2]) < 1e-6, true);

  // Clean up
  Module._sparseCholeskyDestroy(handle);
  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pB);
  Module._free(pHandle);
  Module._free(pOutDirect);
  Module._free(pOutCG);
  Module._free(pCGIters);
  Module._free(pCGErr);
  Module._free(pOutBiCG);
  Module._free(pBiCGIters);
  Module._free(pBiCGErr);
}

if (checkFailed() === 0) {
  console.log('ALL TESTS PASSED');
}
process.exit(checkFailed());

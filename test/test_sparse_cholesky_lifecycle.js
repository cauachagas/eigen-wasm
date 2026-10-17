// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_cholesky_lifecycle.js
// Tests for sparseCholeskyFactorize and sparseCholeskyDestroy lifecycle functions,
// adapted from deps/eigen/test/simplicial_cholesky.cpp and sparse_solver.h.

import createEigenModule from './eigen_wasm.js';
import {
  SUCCESS,
  NUMERICAL_ISSUE,
  INVALID_INPUT,
  SENTINEL,
  createTester
} from './test_helpers.js';

const Module = await createEigenModule();
const { report, alloc, allocInts, readInts, checkFailed } = createTester(Module);

// 1. Valid SPD Matrix (Tridiagonal Poisson 1D, 4x4)
// Matrix:
// [  2 -1  0  0 ]
// [ -1  2 -1  0 ]
// [  0 -1  2 -1 ]
// [  0  0 -1  2 ]
// In CSC (ColMajor, storageOrder = 0):
// col 0: (0, 2.0), (1, -1.0)
// col 1: (0, -1.0), (1, 2.0), (2, -1.0)
// col 2: (1, -1.0), (2, 2.0), (3, -1.0)
// col 3: (2, -1.0), (3, 2.0)
const spdValues = [2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0];
const spdInner = [0, 1, 0, 1, 2, 1, 2, 3, 2, 3];
const spdOuter = [0, 2, 5, 8, 10];
const n = 4;
const nnz = 10;

// Test SimplicialLDLT (solverType = 0)
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([SENTINEL]);

  const status = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, pHandle);
  report('sparseCholeskyFactorize SimplicialLDLT status', status, SUCCESS);

  const handle = readInts(pHandle, 1)[0];
  report('sparseCholeskyFactorize SimplicialLDLT returns positive handle', handle > 0, true);

  // Destroy handle
  const destroyStatus = Module._sparseCholeskyDestroy(handle);
  report('sparseCholeskyDestroy valid handle status', destroyStatus, SUCCESS);

  // Double destroy should fail with INVALID_INPUT
  const doubleDestroyStatus = Module._sparseCholeskyDestroy(handle);
  report('sparseCholeskyDestroy double destroy returns INVALID_INPUT', doubleDestroyStatus, INVALID_INPUT);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

// Test SimplicialLLT (solverType = 1) on SPD matrix
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([SENTINEL]);

  const status = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 1, pHandle);
  report('sparseCholeskyFactorize SimplicialLLT status', status, SUCCESS);

  const handle = readInts(pHandle, 1)[0];
  report('sparseCholeskyFactorize SimplicialLLT returns positive handle', handle > 0, true);

  const destroyStatus = Module._sparseCholeskyDestroy(handle);
  report('sparseCholeskyDestroy LLT handle status', destroyStatus, SUCCESS);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

// Upstream test: Zero-pivot matrix (adapted from test_simplicial_cholesky_determinant_asserts)
// 6x6 diagonal matrix with (0,0) = 0 and (i,i) = 1 for i >= 1
// Should fail with NUMERICAL_ISSUE (1) for both LLT and LDLT, keeping outHandle untouched!
{
  const nZero = 6;
  const zeroVals = [0.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const zeroInner = [0, 1, 2, 3, 4, 5];
  const zeroOuter = [0, 1, 2, 3, 4, 5, 6];

  const pVals = alloc(zeroVals);
  const pInner = allocInts(zeroInner);
  const pOuter = allocInts(zeroOuter);
  const pHandle = allocInts([99999]); // Sentinel value

  // LLT with zero pivot
  const statusLLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, nZero, 6, 0, 1, pHandle);
  report('sparseCholeskyFactorize LLT zero pivot returns NUMERICAL_ISSUE', statusLLT, NUMERICAL_ISSUE);
  report('sparseCholeskyFactorize LLT zero pivot preserves outHandle', readInts(pHandle, 1)[0], 99999);

  // LDLT with zero pivot
  const statusLDLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, nZero, 6, 0, 0, pHandle);
  report('sparseCholeskyFactorize LDLT zero pivot returns NUMERICAL_ISSUE', statusLDLT, NUMERICAL_ISSUE);
  report('sparseCholeskyFactorize LDLT zero pivot preserves outHandle', readInts(pHandle, 1)[0], 99999);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

// Upstream test: Negative-pivot / indefinite matrix
// 6x6 diagonal matrix with (5,5) = -1.0 and (i,i) = 1.0 for i < 5
// LLT must fail with NUMERICAL_ISSUE (1) and preserve outHandle.
// LDLT succeeds for indefinite quasi-definite systems!
{
  const nNeg = 6;
  const negVals = [1.0, 1.0, 1.0, 1.0, 1.0, -1.0];
  const negInner = [0, 1, 2, 3, 4, 5];
  const negOuter = [0, 1, 2, 3, 4, 5, 6];

  const pVals = alloc(negVals);
  const pInner = allocInts(negInner);
  const pOuter = allocInts(negOuter);
  const pHandle = allocInts([88888]);

  // LLT rejects indefinite matrix
  const statusLLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, nNeg, 6, 0, 1, pHandle);
  report('sparseCholeskyFactorize LLT indefinite returns NUMERICAL_ISSUE', statusLLT, NUMERICAL_ISSUE);
  report('sparseCholeskyFactorize LLT indefinite preserves outHandle', readInts(pHandle, 1)[0], 88888);

  // LDLT accepts indefinite symmetric matrix
  const statusLDLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, nNeg, 6, 0, 0, pHandle);
  report('sparseCholeskyFactorize LDLT indefinite succeeds', statusLDLT, SUCCESS);
  const handleLDLT = readInts(pHandle, 1)[0];
  report('sparseCholeskyFactorize LDLT indefinite assigned valid handle', handleLDLT > 0, true);
  Module._sparseCholeskyDestroy(handleLDLT);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

// Test SimplicialLDLT and SimplicialLLT in CSR format (storageOrder = 1)
{
  // For a symmetric matrix, CSR has identical values/indices as CSC
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([-99999]);

  // CSR LDLT
  const statusLDLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 1, 0, pHandle);
  report('sparseCholeskyFactorize CSR LDLT status', statusLDLT, SUCCESS);
  const handleLDLT = readInts(pHandle, 1)[0];
  report('sparseCholeskyFactorize CSR LDLT returns positive handle', handleLDLT > 0, true);
  Module._sparseCholeskyDestroy(handleLDLT);

  // CSR LLT
  const statusLLT = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 1, 1, pHandle);
  report('sparseCholeskyFactorize CSR LLT status', statusLLT, SUCCESS);
  const handleLLT = readInts(pHandle, 1)[0];
  report('sparseCholeskyFactorize CSR LLT returns positive handle', handleLLT > 0, true);
  Module._sparseCholeskyDestroy(handleLLT);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

// Input validation and untouched buffer invariants
{
  const pVals = alloc(spdValues);
  const pInner = allocInts(spdInner);
  const pOuter = allocInts(spdOuter);
  const pHandle = allocInts([77777]);

  // Null values pointer
  report('Null values returns INVALID_INPUT', Module._sparseCholeskyFactorize(0, pInner, pOuter, n, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on null values', readInts(pHandle, 1)[0], 77777);

  // Null innerIndices pointer
  report('Null innerIndices returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, 0, pOuter, n, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on null innerIndices', readInts(pHandle, 1)[0], 77777);

  // Null outerStarts pointer
  report('Null outerStarts returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, 0, n, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on null outerStarts', readInts(pHandle, 1)[0], 77777);

  // Null outHandle pointer
  report('Null outHandle returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 0, 0), INVALID_INPUT);

  // Invalid dimension (n <= 0)
  report('Dimension <= 0 returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, 0, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on dim <= 0', readInts(pHandle, 1)[0], 77777);

  // Dimension above ceiling (n > 1000000)
  report('Dimension > 1000000 returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, 1000001, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on dim > 1000000', readInts(pHandle, 1)[0], 77777);

  // Negative NNZ
  report('Negative NNZ returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, -1, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on negative NNZ', readInts(pHandle, 1)[0], 77777);

  // Invalid solverType (not 0 or 1)
  report('Invalid solverType returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 0, 2, pHandle), INVALID_INPUT);
  report('outHandle untouched on invalid solverType', readInts(pHandle, 1)[0], 77777);

  // Invalid storageOrder (not 0 or 1)
  report('Invalid storageOrder returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pInner, pOuter, n, nnz, 3, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on invalid storageOrder', readInts(pHandle, 1)[0], 77777);

  // Non-monotonic inner indices (unsorted)
  const unsortedInner = [1, 0, 0, 1, 2, 1, 2, 3, 2, 3];
  const pUnsorted = allocInts(unsortedInner);
  report('Unsorted inner indices returns INVALID_INPUT', Module._sparseCholeskyFactorize(pVals, pUnsorted, pOuter, n, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on unsorted inner indices', readInts(pHandle, 1)[0], 77777);
  Module._free(pUnsorted);

  // Non-finite value (NaN)
  const nanVals = [2.0, NaN, -1.0, 2.0, -1.0, -1.0, 2.0, -1.0, -1.0, 2.0];
  const pNan = alloc(nanVals);
  report('NaN values returns INVALID_INPUT', Module._sparseCholeskyFactorize(pNan, pInner, pOuter, n, nnz, 0, 0, pHandle), INVALID_INPUT);
  report('outHandle untouched on NaN values', readInts(pHandle, 1)[0], 77777);
  Module._free(pNan);

  // Destroy non-existent handle
  report('Destroy invalid handle ID returns INVALID_INPUT', Module._sparseCholeskyDestroy(12345), INVALID_INPUT);
  report('Destroy negative handle ID returns INVALID_INPUT', Module._sparseCholeskyDestroy(-1), INVALID_INPUT);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
}

if (checkFailed() > 0) {
  process.exit(1);
}
console.log('ALL TESTS PASSED');

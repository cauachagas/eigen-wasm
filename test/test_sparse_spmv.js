// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_spmv.js: TDD test suite for Sparse Matrix-Vector Product (Ticket 02)
// Adapted from upstream Eigen C++ tests in deps/eigen/test/sparse_product.cpp
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();

const sparseMatMulVec = Module.cwrap('sparseMatMulVec', 'number', [
  'number', // rows
  'number', // cols
  'number', // nnz
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number', // x
  'number'  // outY
]);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const SENTINEL_VAL = -999.0;

let failed = 0;

function report(name, result, expected) {
  if (result === expected) {
    console.log(`ok - ${name}`);
  } else {
    console.error(`not ok - ${name}: expected ${expected}, got ${result}`);
    failed++;
  }
}

function reportArray(name, actual, expected, tol = 1e-9) {
  let ok = actual.length === expected.length;
  if (ok) {
    for (let i = 0; i < actual.length; i++) {
      if (Math.abs(actual[i] - expected[i]) > tol) {
        ok = false;
        break;
      }
    }
  }
  if (ok) {
    console.log(`ok - ${name}`);
  } else {
    console.error(`not ok - ${name}: expected [${expected}], got [${actual}]`);
    failed++;
  }
}

function allocDoubles(vals) {
  const ptr = Module._malloc(vals.length * 8);
  for (let i = 0; i < vals.length; i++) Module.setValue(ptr + i * 8, vals[i], 'double');
  return ptr;
}

function allocInts(vals) {
  const ptr = Module._malloc(vals.length * 4);
  for (let i = 0; i < vals.length; i++) Module.setValue(ptr + i * 4, vals[i], 'i32');
  return ptr;
}

function readDoubles(ptr, count) {
  const res = [];
  for (let i = 0; i < count; i++) res.push(Module.getValue(ptr + i * 8, 'double'));
  return res;
}

// -----------------------------------------------------------------------------
// Test 1: CSC 3x3 matrix-vector multiplication y = A * x
// Matrix A:
// [ 1, 0, 2 ]
// [ 0, 0, 3 ]
// [ 4, 5, 6 ]
// x = [2, 3, 4]^T -> y = [10, 12, 47]^T
// -----------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const nnz = 6;
  // Col-major (CSC):
  // Col 0: (0, 1.0), (2, 4.0)
  // Col 1: (2, 5.0)
  // Col 2: (0, 2.0), (1, 3.0), (2, 6.0)
  const aOuterStarts = allocInts([0, 2, 3, 6]);
  const aInnerIndices = allocInts([0, 2, 2, 0, 1, 2]);
  const aValues = allocDoubles([1.0, 4.0, 5.0, 2.0, 3.0, 6.0]);
  const x = allocDoubles([2.0, 3.0, 4.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL, SENTINEL_VAL]);

  const ret = sparseMatMulVec(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, 0, x, outY);
  report('SpMV CSC 3x3 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMV CSC 3x3 computed values', readDoubles(outY, 3), [10.0, 12.0, 47.0]);

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(x);
  Module._free(outY);
}

// -----------------------------------------------------------------------------
// Test 2: CSR 3x3 matrix-vector multiplication y = A * x
// Same matrix A in Row-Major:
// Row 0: (0, 1.0), (2, 2.0)
// Row 1: (2, 3.0)
// Row 2: (0, 4.0), (1, 5.0), (2, 6.0)
// -----------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const nnz = 6;
  const aOuterStarts = allocInts([0, 2, 3, 6]);
  const aInnerIndices = allocInts([0, 2, 2, 0, 1, 2]);
  const aValues = allocDoubles([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
  const x = allocDoubles([2.0, 3.0, 4.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL, SENTINEL_VAL]);

  const ret = sparseMatMulVec(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, 1, x, outY);
  report('SpMV CSR 3x3 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMV CSR 3x3 computed values', readDoubles(outY, 3), [10.0, 12.0, 47.0]);

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(x);
  Module._free(outY);
}

// -----------------------------------------------------------------------------
// Test 3: Rectangular CSC 2x4 matrix:
// [ 10,  0, 20,  0 ]
// [  0, 30,  0, 40 ]
// x = [1, 2, 3, 4] -> y = [70, 220]
// -----------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 4;
  const nnz = 4;
  // Col 0: (0, 10)
  // Col 1: (1, 30)
  // Col 2: (0, 20)
  // Col 3: (1, 40)
  const aOuterStarts = allocInts([0, 1, 2, 3, 4]);
  const aInnerIndices = allocInts([0, 1, 0, 1]);
  const aValues = allocDoubles([10.0, 30.0, 20.0, 40.0]);
  const x = allocDoubles([1.0, 2.0, 3.0, 4.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);

  const ret = sparseMatMulVec(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, 0, x, outY);
  report('SpMV Rectangular CSC 2x4 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMV Rectangular CSC 2x4 computed values', readDoubles(outY, 2), [70.0, 220.0]);

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(x);
  Module._free(outY);
}

// -----------------------------------------------------------------------------
// Test 4: Empty sparse matrix (nnz = 0)
// -----------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const nnz = 0;
  const aOuterStarts = allocInts([0, 0, 0, 0]);
  const aInnerIndices = allocInts([0]); // dummy allocation
  const aValues = allocDoubles([0.0]);  // dummy allocation
  const x = allocDoubles([1.0, 2.0, 3.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL, SENTINEL_VAL]);

  const ret = sparseMatMulVec(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, 0, x, outY);
  report('SpMV Empty matrix returns SUCCESS', ret, SUCCESS);
  reportArray('SpMV Empty matrix outputs zeros', readDoubles(outY, 3), [0.0, 0.0, 0.0]);

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(x);
  Module._free(outY);
}

// -----------------------------------------------------------------------------
// Test 5: Validation and Unwanted Behavior (REQ-SP-013, REQ-SP-014, REQ-SP-061)
// Output buffers must remain completely untouched.
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 1]);
  const validInner = allocInts([0]);
  const validVals = allocDoubles([5.0]);
  const validX = allocDoubles([2.0, 3.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);

  // Null pointers
  report('SpMV null aValues returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, 0, validInner, validOuter, 0, validX, outY), INVALID_INPUT);
  report('SpMV null outY returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, validOuter, 0, validX, 0), INVALID_INPUT);
  report('SpMV null x returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, validOuter, 0, 0, outY), INVALID_INPUT);

  // Invalid dimensions
  report('SpMV rows <= 0 returns INVALID_INPUT',
    sparseMatMulVec(0, 2, 1, validVals, validInner, validOuter, 0, validX, outY), INVALID_INPUT);
  report('SpMV cols <= 0 returns INVALID_INPUT',
    sparseMatMulVec(2, 0, 1, validVals, validInner, validOuter, 0, validX, outY), INVALID_INPUT);
  report('SpMV nnz < 0 returns INVALID_INPUT',
    sparseMatMulVec(2, 2, -1, validVals, validInner, validOuter, 0, validX, outY), INVALID_INPUT);
  report('SpMV nnz > rows * cols returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 5, validVals, validInner, validOuter, 0, validX, outY), INVALID_INPUT);

  // Invalid storageOrder
  report('SpMV invalid storageOrder returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, validOuter, 2, validX, outY), INVALID_INPUT);

  // Non-monotonic outerStarts
  const badOuter = allocInts([0, 2, 1]);
  report('SpMV non-monotonic outerStarts returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, badOuter, 0, validX, outY), INVALID_INPUT);

  // OuterStarts not ending with nnz
  const badEndOuter = allocInts([0, 0, 2]);
  report('SpMV outerStarts end != nnz returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, badEndOuter, 0, validX, outY), INVALID_INPUT);

  // Non-finite value in x
  const nanX = allocDoubles([NaN, 3.0]);
  report('SpMV NaN in x returns INVALID_INPUT',
    sparseMatMulVec(2, 2, 1, validVals, validInner, validOuter, 0, nanX, outY), INVALID_INPUT);

  // Buffer untouched check
  const actualY = readDoubles(outY, 2);
  report('SpMV output buffer untouched on errors',
    actualY[0] === SENTINEL_VAL && actualY[1] === SENTINEL_VAL, true);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(validX);
  Module._free(outY);
  Module._free(badOuter);
  Module._free(badEndOuter);
  Module._free(nanX);
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}

// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_ops.js: TDD test suite for Sparse Scaling and Transposition (Ticket 04)
// Adapted from upstream Eigen C++ tests in deps/eigen/test/sparse_basic.cpp
import EigenWasmModule from './eigen_wasm.js';
import { SENTINEL } from './test_helpers.js';

const Module = await EigenWasmModule();

const sparseScale = Module.cwrap('sparseScale', 'number', [
  'number', // rows
  'number', // cols
  'number', // nnz
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number', // alpha (double)
  'number', // outValues
  'number', // outInnerIndices
  'number'  // outOuterStarts
]);

const sparseTranspose = Module.cwrap('sparseTranspose', 'number', [
  'number', // rows
  'number', // cols
  'number', // nnz
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number', // outValues
  'number', // outInnerIndices
  'number'  // outOuterStarts
]);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const SENTINEL_VAL = SENTINEL;
const SENTINEL_INT = -999;

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

function readInts(ptr, count) {
  const res = [];
  for (let i = 0; i < count; i++) res.push(Module.getValue(ptr + i * 4, 'i32'));
  return res;
}

// -----------------------------------------------------------------------------
// Test 1: sparseScale (Out-of-place and In-place)
// Matrix A (3x3 CSC):
// [ 2, 0, 4 ]
// [ 0, 6, 0 ]
// [ 8, 0, 10 ]
// -----------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const nnz = 5;
  const aOuter = allocInts([0, 2, 3, 5]);
  const aInner = allocInts([0, 2, 1, 0, 2]);
  const aVals = allocDoubles([2.0, 8.0, 6.0, 4.0, 10.0]);

  // Out-of-place scaling by alpha = 2.5
  const outVals = allocDoubles(new Array(nnz).fill(SENTINEL_VAL));
  const outInner = allocInts(new Array(nnz).fill(SENTINEL_INT));
  const outOuter = allocInts(new Array(cols + 1).fill(SENTINEL_INT));

  const retOut = sparseScale(rows, cols, nnz, aVals, aInner, aOuter, 0, 2.5, outVals, outInner, outOuter);
  report('sparseScale out-of-place returns SUCCESS', retOut, SUCCESS);
  reportArray('sparseScale out-of-place values', readDoubles(outVals, nnz), [5.0, 20.0, 15.0, 10.0, 25.0]);
  reportArray('sparseScale out-of-place innerIndices', readInts(outInner, nnz), [0, 2, 1, 0, 2]);
  reportArray('sparseScale out-of-place outerStarts', readInts(outOuter, cols + 1), [0, 2, 3, 5]);

  // In-place scaling by alpha = 0.5 on the out buffers
  const retIn = sparseScale(rows, cols, nnz, outVals, outInner, outOuter, 0, 0.5, outVals, outInner, outOuter);
  report('sparseScale in-place returns SUCCESS', retIn, SUCCESS);
  reportArray('sparseScale in-place values', readDoubles(outVals, nnz), [2.5, 10.0, 7.5, 5.0, 12.5]);

  Module._free(aOuter);
  Module._free(aInner);
  Module._free(aVals);
  Module._free(outVals);
  Module._free(outInner);
  Module._free(outOuter);
}

// -----------------------------------------------------------------------------
// Test 2: sparseTranspose (CSC 2x3 -> CSC 3x2)
// Matrix A (2x3):
// [ 1, 0, 2 ]
// [ 0, 3, 4 ]
// CSC layout of A:
// Col 0: (0, 1.0)
// Col 1: (1, 3.0)
// Col 2: (0, 2.0), (1, 4.0)
// outerStarts = [0, 1, 2, 4], innerIndices = [0, 1, 0, 1], values = [1.0, 3.0, 2.0, 4.0]
//
// Transpose A^T (3x2):
// [ 1, 0 ]
// [ 0, 3 ]
// [ 2, 4 ]
// CSC layout of A^T:
// Col 0: (0, 1.0), (2, 2.0)
// Col 1: (1, 3.0), (2, 4.0)
// outerStarts = [0, 2, 4], innerIndices = [0, 2, 1, 2], values = [1.0, 2.0, 3.0, 4.0]
// -----------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 3;
  const nnz = 4;
  const aOuter = allocInts([0, 1, 2, 4]);
  const aInner = allocInts([0, 1, 0, 1]);
  const aVals = allocDoubles([1.0, 3.0, 2.0, 4.0]);

  // A^T has rowsT = 3, colsT = 2. outerStarts size = colsT + 1 = 3.
  const tVals = allocDoubles(new Array(nnz).fill(SENTINEL_VAL));
  const tInner = allocInts(new Array(nnz).fill(SENTINEL_INT));
  const tOuter = allocInts(new Array(rows + 1).fill(SENTINEL_INT));

  const retT = sparseTranspose(rows, cols, nnz, aVals, aInner, aOuter, 0, tVals, tInner, tOuter);
  report('sparseTranspose CSC returns SUCCESS', retT, SUCCESS);
  reportArray('sparseTranspose CSC outerStarts', readInts(tOuter, rows + 1), [0, 2, 4]);
  reportArray('sparseTranspose CSC innerIndices', readInts(tInner, nnz), [0, 2, 1, 2]);
  reportArray('sparseTranspose CSC values', readDoubles(tVals, nnz), [1.0, 2.0, 3.0, 4.0]);

  // Double transpose (A^T)^T must equal original A
  const ttVals = allocDoubles(new Array(nnz).fill(SENTINEL_VAL));
  const ttInner = allocInts(new Array(nnz).fill(SENTINEL_INT));
  const ttOuter = allocInts(new Array(cols + 1).fill(SENTINEL_INT));

  const retTT = sparseTranspose(cols, rows, nnz, tVals, tInner, tOuter, 0, ttVals, ttInner, ttOuter);
  report('sparseTranspose involution (A^T)^T returns SUCCESS', retTT, SUCCESS);
  reportArray('sparseTranspose involution outerStarts', readInts(ttOuter, cols + 1), [0, 1, 2, 4]);
  reportArray('sparseTranspose involution innerIndices', readInts(ttInner, nnz), [0, 1, 0, 1]);
  reportArray('sparseTranspose involution values', readDoubles(ttVals, nnz), [1.0, 3.0, 2.0, 4.0]);

  Module._free(aOuter);
  Module._free(aInner);
  Module._free(aVals);
  Module._free(tVals);
  Module._free(tInner);
  Module._free(tOuter);
  Module._free(ttVals);
  Module._free(ttInner);
  Module._free(ttOuter);
}

// -----------------------------------------------------------------------------
// Test 3: sparseTranspose CSR (2x3 CSR -> 3x2 CSR)
// Matrix A (2x3 CSR):
// [ 1, 0, 2 ]
// [ 0, 3, 4 ]
// CSR layout:
// Row 0: (0, 1.0), (2, 2.0)
// Row 1: (1, 3.0), (2, 4.0)
// outerStarts = [0, 2, 4], innerIndices = [0, 2, 1, 2], values = [1.0, 2.0, 3.0, 4.0]
// Transpose A^T (3x2 CSR):
// Row 0: (0, 1.0)
// Row 1: (1, 3.0)
// Row 2: (0, 2.0), (1, 4.0)
// outerStarts = [0, 1, 2, 4], innerIndices = [0, 1, 0, 1], values = [1.0, 3.0, 2.0, 4.0]
// -----------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 3;
  const nnz = 4;
  const aOuter = allocInts([0, 2, 4]);
  const aInner = allocInts([0, 2, 1, 2]);
  const aVals = allocDoubles([1.0, 2.0, 3.0, 4.0]);

  // Transposed CSR has rows = 3, cols = 2. outerStarts size = rows + 1 = 4.
  const tVals = allocDoubles(new Array(nnz).fill(SENTINEL_VAL));
  const tInner = allocInts(new Array(nnz).fill(SENTINEL_INT));
  const tOuter = allocInts(new Array(cols + 1).fill(SENTINEL_INT));

  const retT = sparseTranspose(rows, cols, nnz, aVals, aInner, aOuter, 1, tVals, tInner, tOuter);
  report('sparseTranspose CSR returns SUCCESS', retT, SUCCESS);
  reportArray('sparseTranspose CSR outerStarts', readInts(tOuter, cols + 1), [0, 1, 2, 4]);
  reportArray('sparseTranspose CSR innerIndices', readInts(tInner, nnz), [0, 1, 0, 1]);
  reportArray('sparseTranspose CSR values', readDoubles(tVals, nnz), [1.0, 3.0, 2.0, 4.0]);

  Module._free(aOuter);
  Module._free(aInner);
  Module._free(aVals);
  Module._free(tVals);
  Module._free(tInner);
  Module._free(tOuter);
}

// -----------------------------------------------------------------------------
// Test 4: Validation and Unwanted Behavior (REQ-SP-043, REQ-SP-052)
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 1]);
  const validInner = allocInts([0]);
  const validVals = allocDoubles([5.0]);
  const outVals = allocDoubles([SENTINEL_VAL]);
  const outInner = allocInts([SENTINEL_INT]);
  const outOuter = allocInts([SENTINEL_INT, SENTINEL_INT]);

  report('sparseScale null pointer returns INVALID_INPUT',
    sparseScale(2, 2, 1, 0, validInner, validOuter, 0, 2.0, outVals, outInner, outOuter),
    INVALID_INPUT);

  report('sparseScale preserves outValues on error',
    readDoubles(outVals, 1)[0], SENTINEL_VAL);
  report('sparseScale preserves outInner on error',
    readInts(outInner, 1)[0], SENTINEL_INT);
  report('sparseScale preserves outOuter on error',
    readInts(outOuter, 2)[0], SENTINEL_INT);

  report('sparseTranspose invalid storageOrder returns INVALID_INPUT',
    sparseTranspose(2, 2, 1, validVals, validInner, validOuter, 2, outVals, outInner, outOuter),
    INVALID_INPUT);

  report('sparseTranspose preserves outValues on error',
    readDoubles(outVals, 1)[0], SENTINEL_VAL);
  report('sparseTranspose preserves outInner on error',
    readInts(outInner, 1)[0], SENTINEL_INT);
  report('sparseTranspose preserves outOuter on error',
    readInts(outOuter, 2)[0], SENTINEL_INT);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(outVals);
  Module._free(outInner);
  Module._free(outOuter);
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}

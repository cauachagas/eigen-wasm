// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_spmm.js: TDD test suite for Sparse-Dense Matrix Product (Ticket 02)
// Adapted from upstream Eigen C++ tests in deps/eigen/test/sparse_product.cpp
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();

const sparseMatMulDense = Module.cwrap('sparseMatMulDense', 'number', [
  'number', // rowsA
  'number', // colsA
  'number', // colsB
  'number', // nnz
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number', // b (row-major dense colsA x colsB)
  'number'  // outC (row-major dense rowsA x colsB)
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
// Test 1: CSC 3x3 matrix * Row-Major 3x2 dense matrix
// Matrix A:
// [ 1, 0, 2 ]
// [ 0, 0, 3 ]
// [ 4, 5, 6 ]
// Matrix B (3x2):
// [ 1, 2 ]
// [ 3, 4 ]
// [ 5, 6 ]
// Expected C = A * B (3x2 row-major):
// [ 11, 14 ]
// [ 15, 18 ]
// [ 49, 64 ]
// -----------------------------------------------------------------------------
{
  const rowsA = 3;
  const colsA = 3;
  const colsB = 2;
  const nnz = 6;
  const aOuterStarts = allocInts([0, 2, 3, 6]);
  const aInnerIndices = allocInts([0, 2, 2, 0, 1, 2]);
  const aValues = allocDoubles([1.0, 4.0, 5.0, 2.0, 3.0, 6.0]);
  const b = allocDoubles([
    1.0, 2.0,
    3.0, 4.0,
    5.0, 6.0
  ]);
  const outC = allocDoubles(new Array(6).fill(SENTINEL_VAL));

  const ret = sparseMatMulDense(rowsA, colsA, colsB, nnz, aValues, aInnerIndices, aOuterStarts, 0, b, outC);
  report('SpMM CSC 3x3 * Dense 3x2 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMM CSC 3x3 * Dense 3x2 computed values',
    readDoubles(outC, 6),
    [11.0, 14.0, 15.0, 18.0, 49.0, 64.0]
  );

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(b);
  Module._free(outC);
}

// -----------------------------------------------------------------------------
// Test 2: CSR 3x3 matrix * Row-Major 3x2 dense matrix
// -----------------------------------------------------------------------------
{
  const rowsA = 3;
  const colsA = 3;
  const colsB = 2;
  const nnz = 6;
  const aOuterStarts = allocInts([0, 2, 3, 6]);
  const aInnerIndices = allocInts([0, 2, 2, 0, 1, 2]);
  const aValues = allocDoubles([1.0, 2.0, 3.0, 4.0, 5.0, 6.0]);
  const b = allocDoubles([
    1.0, 2.0,
    3.0, 4.0,
    5.0, 6.0
  ]);
  const outC = allocDoubles(new Array(6).fill(SENTINEL_VAL));

  const ret = sparseMatMulDense(rowsA, colsA, colsB, nnz, aValues, aInnerIndices, aOuterStarts, 1, b, outC);
  report('SpMM CSR 3x3 * Dense 3x2 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMM CSR 3x3 * Dense 3x2 computed values',
    readDoubles(outC, 6),
    [11.0, 14.0, 15.0, 18.0, 49.0, 64.0]
  );

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(b);
  Module._free(outC);
}

// -----------------------------------------------------------------------------
// Test 3: Rectangular CSC 2x3 * Dense 3x4 -> Dense 2x4
// A (2x3):
// [ 2, 0, 3 ]
// [ 0, 4, 0 ]
// B (3x4):
// [ 1, 2, 3, 4 ]
// [ 5, 6, 7, 8 ]
// [ 9, 1, 2, 0 ]
// C (2x4):
// Row 0: 2*[1,2,3,4] + 3*[9,1,2,0] = [2+27, 4+3, 6+6, 8+0] = [29, 7, 12, 8]
// Row 1: 4*[5,6,7,8] = [20, 24, 28, 32]
// -----------------------------------------------------------------------------
{
  const rowsA = 2;
  const colsA = 3;
  const colsB = 4;
  const nnz = 3;
  // Col 0: (0, 2.0)
  // Col 1: (1, 4.0)
  // Col 2: (0, 3.0)
  const aOuterStarts = allocInts([0, 1, 2, 3]);
  const aInnerIndices = allocInts([0, 1, 0]);
  const aValues = allocDoubles([2.0, 4.0, 3.0]);
  const b = allocDoubles([
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 1, 2, 0
  ]);
  const outC = allocDoubles(new Array(8).fill(SENTINEL_VAL));

  const ret = sparseMatMulDense(rowsA, colsA, colsB, nnz, aValues, aInnerIndices, aOuterStarts, 0, b, outC);
  report('SpMM Rectangular 2x3 * 3x4 returns SUCCESS', ret, SUCCESS);
  reportArray('SpMM Rectangular 2x3 * 3x4 computed values',
    readDoubles(outC, 8),
    [29.0, 7.0, 12.0, 8.0, 20.0, 24.0, 28.0, 32.0]
  );

  Module._free(aOuterStarts);
  Module._free(aInnerIndices);
  Module._free(aValues);
  Module._free(b);
  Module._free(outC);
}

// -----------------------------------------------------------------------------
// Test 4: Validation and Unwanted Behavior (REQ-SP-022)
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 1]);
  const validInner = allocInts([0]);
  const validVals = allocDoubles([5.0]);
  const validB = allocDoubles([1.0, 2.0]);
  const outC = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);

  report('SpMM null b returns INVALID_INPUT',
    sparseMatMulDense(2, 2, 1, 1, validVals, validInner, validOuter, 0, 0, outC), INVALID_INPUT);
  report('SpMM null outC returns INVALID_INPUT',
    sparseMatMulDense(2, 2, 1, 1, validVals, validInner, validOuter, 0, validB, 0), INVALID_INPUT);
  report('SpMM colsB <= 0 returns INVALID_INPUT',
    sparseMatMulDense(2, 2, 0, 1, validVals, validInner, validOuter, 0, validB, outC), INVALID_INPUT);

  const actualC = readDoubles(outC, 2);
  report('SpMM output buffer untouched on error',
    actualC[0] === SENTINEL_VAL && actualC[1] === SENTINEL_VAL, true);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(validB);
  Module._free(outC);
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}

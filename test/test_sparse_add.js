// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_add.js: TDD test suite for Sparse Addition with Two-Pass Allocation (Ticket 03)
// Adapted from upstream Eigen C++ tests in deps/eigen/test/sparse_basic.cpp
import EigenWasmModule from './eigen_wasm.js';
import { SENTINEL } from './test_helpers.js';

const Module = await EigenWasmModule();

const sparseAddGetNnz = Module.cwrap('sparseAddGetNnz', 'number', [
  'number', // rows
  'number', // cols
  'number', // nnzA
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // nnzB
  'number', // bValues
  'number', // bInnerIndices
  'number', // bOuterStarts
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number'  // outNnz
]);

const sparseAdd = Module.cwrap('sparseAdd', 'number', [
  'number', // rows
  'number', // cols
  'number', // nnzA
  'number', // aValues
  'number', // aInnerIndices
  'number', // aOuterStarts
  'number', // nnzB
  'number', // bValues
  'number', // bInnerIndices
  'number', // bOuterStarts
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
// Test 1: CSC Addition with partially overlapping sparsity patterns
// Matrix A (3x3):
// [ 1, 0, 2 ]
// [ 0, 3, 0 ]
// [ 4, 0, 5 ]
// Col 0: (0, 1.0), (2, 4.0)
// Col 1: (1, 3.0)
// Col 2: (0, 2.0), (2, 5.0)
//
// Matrix B (3x3):
// [ 0, 10,  2 ]
// [ 0, 30,  0 ]
// [ 0,  0, 50 ]
// Col 0: empty
// Col 1: (0, 10.0), (1, 30.0)
// Col 2: (0, 2.0), (2, 50.0)
//
// Expected C = A + B (3x3):
// [ 1, 10,  4 ]
// [ 0, 33,  0 ]
// [ 4,  0, 55 ]
// Col 0: (0, 1.0), (2, 4.0)
// Col 1: (0, 10.0), (1, 33.0)
// Col 2: (0, 4.0), (2, 55.0)
// Total nnz = 6.
// -----------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const nnzA = 5;
  const aOuter = allocInts([0, 2, 3, 5]);
  const aInner = allocInts([0, 2, 1, 0, 2]);
  const aVals = allocDoubles([1.0, 4.0, 3.0, 2.0, 5.0]);

  const nnzB = 4;
  const bOuter = allocInts([0, 0, 2, 4]);
  const bInner = allocInts([0, 1, 0, 2]);
  const bVals = allocDoubles([10.0, 30.0, 2.0, 50.0]);

  const outNnzPtr = allocInts([SENTINEL_INT]);

  // Pass 1: query NNZ
  const qRet = sparseAddGetNnz(rows, cols, nnzA, aVals, aInner, aOuter, nnzB, bVals, bInner, bOuter, 0, outNnzPtr);
  report('sparseAddGetNnz CSC returns SUCCESS', qRet, SUCCESS);
  const outNnz = readInts(outNnzPtr, 1)[0];
  report('sparseAddGetNnz CSC computed NNZ', outNnz, 6);

  // Pass 2: allocate and compute
  const outVals = allocDoubles(new Array(outNnz).fill(SENTINEL_VAL));
  const outInner = allocInts(new Array(outNnz).fill(SENTINEL_INT));
  const outOuter = allocInts(new Array(cols + 1).fill(SENTINEL_INT));

  const aRet = sparseAdd(rows, cols, nnzA, aVals, aInner, aOuter, nnzB, bVals, bInner, bOuter, 0, outVals, outInner, outOuter);
  report('sparseAdd CSC returns SUCCESS', aRet, SUCCESS);

  reportArray('sparseAdd CSC outerStarts', readInts(outOuter, cols + 1), [0, 2, 4, 6]);
  reportArray('sparseAdd CSC innerIndices', readInts(outInner, outNnz), [0, 2, 0, 1, 0, 2]);
  reportArray('sparseAdd CSC values', readDoubles(outVals, outNnz), [1.0, 4.0, 10.0, 33.0, 4.0, 55.0]);

  Module._free(aOuter);
  Module._free(aInner);
  Module._free(aVals);
  Module._free(bOuter);
  Module._free(bInner);
  Module._free(bVals);
  Module._free(outNnzPtr);
  Module._free(outVals);
  Module._free(outInner);
  Module._free(outOuter);
}

// -----------------------------------------------------------------------------
// Test 2: CSR Addition with Cancellation to Zero
// A = [ [1, -5], [0, 2] ]
// B = [ [-1, 5], [3, 0] ]
// C = A + B = [ [0, 0], [3, 2] ]
// Terms (0, 0) and (0, 1) cancel to zero.
// Resulting NNZ = 2 (only row 1 has nonzeros: (1,0)=3, (1,1)=2).
// -----------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 2;
  const nnzA = 3;
  // Row 0: (0, 1.0), (1, -5.0)
  // Row 1: (1, 2.0)
  const aOuter = allocInts([0, 2, 3]);
  const aInner = allocInts([0, 1, 1]);
  const aVals = allocDoubles([1.0, -5.0, 2.0]);

  const nnzB = 3;
  // Row 0: (0, -1.0), (1, 5.0)
  // Row 1: (0, 3.0)
  const bOuter = allocInts([0, 2, 3]);
  const bInner = allocInts([0, 1, 0]);
  const bVals = allocDoubles([-1.0, 5.0, 3.0]);

  const outNnzPtr = allocInts([SENTINEL_INT]);

  const qRet = sparseAddGetNnz(rows, cols, nnzA, aVals, aInner, aOuter, nnzB, bVals, bInner, bOuter, 1, outNnzPtr);
  report('sparseAddGetNnz CSR cancellation returns SUCCESS', qRet, SUCCESS);
  const outNnz = readInts(outNnzPtr, 1)[0];
  report('sparseAddGetNnz CSR cancellation NNZ count', outNnz, 2);

  const outVals = allocDoubles(new Array(outNnz).fill(SENTINEL_VAL));
  const outInner = allocInts(new Array(outNnz).fill(SENTINEL_INT));
  const outOuter = allocInts(new Array(rows + 1).fill(SENTINEL_INT));

  const aRet = sparseAdd(rows, cols, nnzA, aVals, aInner, aOuter, nnzB, bVals, bInner, bOuter, 1, outVals, outInner, outOuter);
  report('sparseAdd CSR cancellation returns SUCCESS', aRet, SUCCESS);

  reportArray('sparseAdd CSR cancellation outerStarts', readInts(outOuter, rows + 1), [0, 0, 2]);
  reportArray('sparseAdd CSR cancellation innerIndices', readInts(outInner, outNnz), [0, 1]);
  reportArray('sparseAdd CSR cancellation values', readDoubles(outVals, outNnz), [3.0, 2.0]);

  Module._free(aOuter);
  Module._free(aInner);
  Module._free(aVals);
  Module._free(bOuter);
  Module._free(bInner);
  Module._free(bVals);
  Module._free(outNnzPtr);
  Module._free(outVals);
  Module._free(outInner);
  Module._free(outOuter);
}

// -----------------------------------------------------------------------------
// Test 3: Validation and Unwanted Behavior (REQ-SP-033)
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 1]);
  const validInner = allocInts([0]);
  const validVals = allocDoubles([5.0]);
  const outNnz = allocInts([SENTINEL_INT]);

  report('sparseAddGetNnz null pointer returns INVALID_INPUT',
    sparseAddGetNnz(2, 2, 1, 0, validInner, validOuter, 1, validVals, validInner, validOuter, 0, outNnz),
    INVALID_INPUT);

  report('sparseAddGetNnz invalid storageOrder returns INVALID_INPUT',
    sparseAddGetNnz(2, 2, 1, validVals, validInner, validOuter, 1, validVals, validInner, validOuter, 3, outNnz),
    INVALID_INPUT);

  report('sparseAddGetNnz outNnz buffer untouched on error',
    readInts(outNnz, 1)[0], SENTINEL_INT);

  // Untouched output buffers for sparseAdd on invalid input
  const outVals = allocDoubles([SENTINEL_VAL]);
  const outInner = allocInts([SENTINEL_INT]);
  const outOuter = allocInts([SENTINEL_INT, SENTINEL_INT]);

  report('sparseAdd invalid input returns INVALID_INPUT',
    sparseAdd(2, 2, 1, 0, validInner, validOuter, 1, validVals, validInner, validOuter, 0, outVals, outInner, outOuter),
    INVALID_INPUT);

  report('sparseAdd outValues untouched on error',
    readDoubles(outVals, 1)[0], SENTINEL_VAL);
  report('sparseAdd outInner untouched on error',
    readInts(outInner, 1)[0], SENTINEL_INT);
  report('sparseAdd outOuter untouched on error',
    readInts(outOuter, 2)[0], SENTINEL_INT);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(outNnz);
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

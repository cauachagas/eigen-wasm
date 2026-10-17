// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_triplets.js: TDD test suite for Sparse Triplet Assembly (Ticket 01)
// Adapted from upstream Eigen C++ tests in deps/eigen/test/sparse_basic.cpp
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();

const sparseFromTriplets = Module.cwrap('sparseFromTriplets', 'number', [
  'number', // rows
  'number', // cols
  'number', // tripletCount
  'number', // tripletRows
  'number', // tripletCols
  'number', // tripletValues
  'number', // storageOrder (0 = CSC, 1 = CSR)
  'number', // outValues
  'number', // outInnerIndices
  'number', // outOuterStarts
  'number'  // outNnz
]);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const SENTINEL_VAL = -999.0;
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

// ---------------------------------------------------------------------------
// Test 1: Canonical CSC Conversion (storageOrder == 0)
// Upstream reference: deps/eigen/test/sparse_basic.cpp line 1259-1265
// 3x3 matrix:
// [ 1.0  0.0  4.0 ]
// [ 2.0  0.0  0.0 ]
// [ 0.0  3.0  5.0 ]
// ---------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const tripletCount = 5;

  const pRows = allocInts([0, 1, 2, 0, 2]);
  const pCols = allocInts([0, 0, 1, 2, 2]);
  const pVals = allocDoubles([1.0, 2.0, 3.0, 4.0, 5.0]);

  // Allocate output buffers: max nnz = 5, outerSize = cols + 1 = 4
  const pOutVals = Module._malloc(5 * 8);
  const pOutInner = Module._malloc(5 * 4);
  const pOutOuter = Module._malloc(4 * 4);
  const pOutNnz = Module._malloc(4);

  const status = sparseFromTriplets(
    rows, cols, tripletCount,
    pRows, pCols, pVals,
    0, // CSC
    pOutVals, pOutInner, pOutOuter, pOutNnz
  );

  report('sparseFromTriplets CSC status', status, SUCCESS);

  const outNnz = Module.getValue(pOutNnz, 'i32');
  report('sparseFromTriplets CSC nnz count', outNnz, 5);

  const outOuter = readInts(pOutOuter, 4);
  const expectedOuter = [0, 2, 3, 5];
  for (let i = 0; i < 4; i++) {
    report(`sparseFromTriplets CSC outerStarts[${i}]`, outOuter[i], expectedOuter[i]);
  }

  const outInner = readInts(pOutInner, 5);
  const expectedInner = [0, 1, 2, 0, 2];
  for (let i = 0; i < 5; i++) {
    report(`sparseFromTriplets CSC innerIndices[${i}]`, outInner[i], expectedInner[i]);
  }

  const outVals = readDoubles(pOutVals, 5);
  const expectedVals = [1.0, 2.0, 3.0, 4.0, 5.0];
  for (let i = 0; i < 5; i++) {
    report(`sparseFromTriplets CSC values[${i}]`, Math.abs(outVals[i] - expectedVals[i]) < 1e-12, true);
  }

  Module._free(pRows);
  Module._free(pCols);
  Module._free(pVals);
  Module._free(pOutVals);
  Module._free(pOutInner);
  Module._free(pOutOuter);
  Module._free(pOutNnz);
}

// ---------------------------------------------------------------------------
// Test 2: Automatic Summation of Duplicate Triplets
// Upstream reference: deps/eigen/test/sparse_basic.cpp line 568-571
// ---------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 2;
  const tripletCount = 4;

  // Duplicate (0, 0) with values 1.5 + 2.5 = 4.0
  // Duplicate (1, 1) with values 10.0 + (-2.0) = 8.0
  const pRows = allocInts([0, 1, 0, 1]);
  const pCols = allocInts([0, 1, 0, 1]);
  const pVals = allocDoubles([1.5, 10.0, 2.5, -2.0]);

  const pOutVals = Module._malloc(4 * 8);
  const pOutInner = Module._malloc(4 * 4);
  const pOutOuter = Module._malloc(3 * 4); // cols + 1 = 3
  const pOutNnz = Module._malloc(4);

  const status = sparseFromTriplets(
    rows, cols, tripletCount,
    pRows, pCols, pVals,
    0, // CSC
    pOutVals, pOutInner, pOutOuter, pOutNnz
  );

  report('sparseFromTriplets duplicate summation status', status, SUCCESS);

  const outNnz = Module.getValue(pOutNnz, 'i32');
  report('sparseFromTriplets duplicate summation unique nnz', outNnz, 2);

  const outVals = readDoubles(pOutVals, 2);
  report('sparseFromTriplets summed (0,0) value', Math.abs(outVals[0] - 4.0) < 1e-12, true);
  report('sparseFromTriplets summed (1,1) value', Math.abs(outVals[1] - 8.0) < 1e-12, true);

  Module._free(pRows);
  Module._free(pCols);
  Module._free(pVals);
  Module._free(pOutVals);
  Module._free(pOutInner);
  Module._free(pOutOuter);
  Module._free(pOutNnz);
}

// ---------------------------------------------------------------------------
// Test 3: Canonical CSR Conversion (storageOrder == 1)
// ---------------------------------------------------------------------------
{
  const rows = 3;
  const cols = 3;
  const tripletCount = 5;

  const pRows = allocInts([0, 1, 2, 0, 2]);
  const pCols = allocInts([0, 0, 1, 2, 2]);
  const pVals = allocDoubles([1.0, 2.0, 3.0, 4.0, 5.0]);

  const pOutVals = Module._malloc(5 * 8);
  const pOutInner = Module._malloc(5 * 4);
  const pOutOuter = Module._malloc(4 * 4); // rows + 1 = 4
  const pOutNnz = Module._malloc(4);

  const status = sparseFromTriplets(
    rows, cols, tripletCount,
    pRows, pCols, pVals,
    1, // CSR
    pOutVals, pOutInner, pOutOuter, pOutNnz
  );

  report('sparseFromTriplets CSR status', status, SUCCESS);

  const outNnz = Module.getValue(pOutNnz, 'i32');
  report('sparseFromTriplets CSR nnz count', outNnz, 5);

  const outOuter = readInts(pOutOuter, 4);
  const expectedOuter = [0, 2, 3, 5]; // Row offsets
  for (let i = 0; i < 4; i++) {
    report(`sparseFromTriplets CSR outerStarts[${i}]`, outOuter[i], expectedOuter[i]);
  }

  const outInner = readInts(pOutInner, 5);
  const expectedInner = [0, 2, 0, 1, 2]; // Col indices per row
  for (let i = 0; i < 5; i++) {
    report(`sparseFromTriplets CSR innerIndices[${i}]`, outInner[i], expectedInner[i]);
  }

  Module._free(pRows);
  Module._free(pCols);
  Module._free(pVals);
  Module._free(pOutVals);
  Module._free(pOutInner);
  Module._free(pOutOuter);
  Module._free(pOutNnz);
}

// ---------------------------------------------------------------------------
// Test 4: Validation & Untouched Invariant
// ---------------------------------------------------------------------------
{
  const pSentinelVals = Module._malloc(8);
  const pSentinelInner = Module._malloc(4);
  const pSentinelOuter = Module._malloc(4);
  const pSentinelNnz = Module._malloc(4);

  Module.setValue(pSentinelVals, SENTINEL_VAL, 'double');
  Module.setValue(pSentinelInner, SENTINEL_INT, 'i32');
  Module.setValue(pSentinelOuter, SENTINEL_INT, 'i32');
  Module.setValue(pSentinelNnz, SENTINEL_INT, 'i32');

  // Null pointers
  const nullStatus = sparseFromTriplets(3, 3, 1, 0, 0, 0, 0, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects null pointers with InvalidInput', nullStatus, INVALID_INPUT);
  report('sparseFromTriplets preserves values buffer on null', Module.getValue(pSentinelVals, 'double'), SENTINEL_VAL);
  report('sparseFromTriplets preserves inner buffer on null', Module.getValue(pSentinelInner, 'i32'), SENTINEL_INT);
  report('sparseFromTriplets preserves outer buffer on null', Module.getValue(pSentinelOuter, 'i32'), SENTINEL_INT);
  report('sparseFromTriplets preserves nnz on null', Module.getValue(pSentinelNnz, 'i32'), SENTINEL_INT);

  // Invalid storageOrder
  const tRow = Module._malloc(4);
  const tCol = Module._malloc(4);
  const tVal = Module._malloc(8);
  Module.setValue(tRow, 0, 'i32');
  Module.setValue(tCol, 0, 'i32');
  Module.setValue(tVal, 1.0, 'double');

  const invalidOrderStatus = sparseFromTriplets(3, 3, 1, tRow, tCol, tVal, 99, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects invalid storageOrder with InvalidInput', invalidOrderStatus, INVALID_INPUT);

  // Out of bounds coordinate (row >= rows)
  Module.setValue(tRow, 10, 'i32');
  const oobStatus = sparseFromTriplets(3, 3, 1, tRow, tCol, tVal, 0, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects out-of-bounds triplet coordinate', oobStatus, INVALID_INPUT);

  // Negative rows
  const negRowStatus = sparseFromTriplets(-1, 3, 1, tRow, tCol, tVal, 0, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects negative rows', negRowStatus, INVALID_INPUT);

  // Non-finite values (NaN and Infinity)
  Module.setValue(tRow, 0, 'i32');
  Module.setValue(tCol, 0, 'i32');
  Module.setValue(tVal, NaN, 'double');
  const nanStatus = sparseFromTriplets(3, 3, 1, tRow, tCol, tVal, 0, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects NaN triplet value with InvalidInput', nanStatus, INVALID_INPUT);
  report('sparseFromTriplets preserves values buffer on NaN', Module.getValue(pSentinelVals, 'double'), SENTINEL_VAL);

  Module.setValue(tVal, Infinity, 'double');
  const infStatus = sparseFromTriplets(3, 3, 1, tRow, tCol, tVal, 0, pSentinelVals, pSentinelInner, pSentinelOuter, pSentinelNnz);
  report('sparseFromTriplets rejects Infinity triplet value with InvalidInput', infStatus, INVALID_INPUT);
  report('sparseFromTriplets preserves values buffer on Infinity', Module.getValue(pSentinelVals, 'double'), SENTINEL_VAL);

  Module._free(tRow);
  Module._free(tCol);
  Module._free(tVal);
  Module._free(pSentinelVals);
  Module._free(pSentinelInner);
  Module._free(pSentinelOuter);
  Module._free(pSentinelNnz);
}

if (failed > 0) {
  console.error(`\n${failed} test_sparse_triplets assertion(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_sparse_triplets assertions passed.');
}

// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_sparse_validation.js: End-to-end boundary, limit, and untouched-invariant validation suite
// Validates REQ-SP-060, REQ-SP-061, REQ-SP-062 across all exposed sparse operations.
import EigenWasmModule from './eigen_wasm.js';
import { SENTINEL } from './test_helpers.js';

const Module = await EigenWasmModule();

const sparseFromTriplets = Module.cwrap('sparseFromTriplets', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseMatMulVec = Module.cwrap('sparseMatMulVec', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseMatMulDense = Module.cwrap('sparseMatMulDense', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseAddGetNnz = Module.cwrap('sparseAddGetNnz', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseAdd = Module.cwrap('sparseAdd', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseScale = Module.cwrap('sparseScale', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseTranspose = Module.cwrap('sparseTranspose', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseCholeskyFactorize = Module.cwrap('sparseCholeskyFactorize', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseConjugateGradient = Module.cwrap('sparseConjugateGradient', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
]);
const sparseBiCGSTAB = Module.cwrap('sparseBiCGSTAB', 'number', [
  'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'
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
// Test 1: Dimension Limits (REQ-SP-060, REQ-SP-061)
// Up to 1,000,000 rows/cols and 10,000,000 nonzeros allowed.
// -----------------------------------------------------------------------------
{
  const outVals = allocDoubles([SENTINEL_VAL]);
  const outInner = allocInts([SENTINEL_INT]);
  const outOuter = Module._malloc(1000001 * 4);
  const outNnz = allocInts([SENTINEL_INT]);

  const rowsTrip = allocInts([0]);
  const colsTrip = allocInts([0]);
  const valsTrip = allocDoubles([42.0]);

  // Dimension = 1,000,000 (maximum valid)
  const retMax = sparseFromTriplets(1000000, 1000000, 1, rowsTrip, colsTrip, valsTrip, 0, outVals, outInner, outOuter, outNnz);
  report('sparseFromTriplets accepts 1,000,000 dimension', retMax, SUCCESS);
  report('sparseFromTriplets written nnz count', readInts(outNnz, 1)[0], 1);

  // Dimension = 1,000,001 (exceeds ceiling)
  Module.setValue(outNnz, SENTINEL_INT, 'i32');
  const retOver = sparseFromTriplets(1000001, 1000000, 1, rowsTrip, colsTrip, valsTrip, 0, outVals, outInner, outOuter, outNnz);
  report('sparseFromTriplets rejects > 1,000,000 rows with INVALID_INPUT', retOver, INVALID_INPUT);
  report('sparseFromTriplets preserves outNnz on ceiling error', readInts(outNnz, 1)[0], SENTINEL_INT);

  // NNZ > 10,000,000
  const retOverNnz = sparseFromTriplets(100, 100, 10000001, rowsTrip, colsTrip, valsTrip, 0, outVals, outInner, outOuter, outNnz);
  report('sparseFromTriplets rejects > 10,000,000 triplets with INVALID_INPUT', retOverNnz, INVALID_INPUT);

  Module._free(outVals);
  Module._free(outInner);
  Module._free(outOuter);
  Module._free(outNnz);
  Module._free(rowsTrip);
  Module._free(colsTrip);
  Module._free(valsTrip);
}

// -----------------------------------------------------------------------------
// Test 2: Unsorted / Non-Monotonic Inner Indices Rejected (REQ-SP-014, REQ-SP-033)
// -----------------------------------------------------------------------------
{
  const rows = 2;
  const cols = 2;
  const nnz = 2;
  // Col 0 has 2 entries: indices [1, 0] (unsorted!)
  const badOuter = allocInts([0, 2, 2]);
  const badInner = allocInts([1, 0]);
  const vals = allocDoubles([1.0, 2.0]);
  const x = allocDoubles([1.0, 1.0]);
  const outY = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);

  const retSpMV = sparseMatMulVec(rows, cols, nnz, vals, badInner, badOuter, 0, x, outY);
  report('sparseMatMulVec rejects unsorted inner indices with INVALID_INPUT', retSpMV, INVALID_INPUT);
  report('sparseMatMulVec preserves outY buffer', readDoubles(outY, 2)[0], SENTINEL_VAL);

  const b = allocDoubles([1.0, 1.0]);
  const outC = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const retSpMM = sparseMatMulDense(rows, cols, 1, nnz, vals, badInner, badOuter, 0, b, outC);
  report('sparseMatMulDense rejects unsorted inner indices with INVALID_INPUT', retSpMM, INVALID_INPUT);
  report('sparseMatMulDense preserves outC buffer', readDoubles(outC, 2)[0], SENTINEL_VAL);

  const outScaleVals = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const outScaleInner = allocInts([SENTINEL_INT, SENTINEL_INT]);
  const outScaleOuter = allocInts([SENTINEL_INT, SENTINEL_INT, SENTINEL_INT]);
  const retScale = sparseScale(rows, cols, nnz, vals, badInner, badOuter, 0, 2.0, outScaleVals, outScaleInner, outScaleOuter);
  report('sparseScale rejects unsorted inner indices with INVALID_INPUT', retScale, INVALID_INPUT);
  report('sparseScale preserves outValues on unsorted inner indices', readDoubles(outScaleVals, 2)[0], SENTINEL_VAL);

  Module._free(badOuter);
  Module._free(badInner);
  Module._free(vals);
  Module._free(x);
  Module._free(outY);
  Module._free(b);
  Module._free(outC);
  Module._free(outScaleVals);
  Module._free(outScaleInner);
  Module._free(outScaleOuter);
}

// -----------------------------------------------------------------------------
// Test 3: Untouched Invariant across All Operations on Null Pointer
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 1]);
  const validInner = allocInts([0]);
  const validVals = allocDoubles([10.0]);

  const outY = allocDoubles([SENTINEL_VAL]);
  report('SpMV rejects null with INVALID_INPUT',
    sparseMatMulVec(1, 1, 1, 0, validInner, validOuter, 0, validVals, outY), INVALID_INPUT);
  report('SpMV outY untouched', readDoubles(outY, 1)[0], SENTINEL_VAL);

  const outC = allocDoubles([SENTINEL_VAL]);
  report('SpMM rejects null with INVALID_INPUT',
    sparseMatMulDense(1, 1, 1, 1, 0, validInner, validOuter, 0, validVals, outC), INVALID_INPUT);
  report('SpMM outC untouched', readDoubles(outC, 1)[0], SENTINEL_VAL);

  const outNnz = allocInts([SENTINEL_INT]);
  report('sparseAddGetNnz rejects null with INVALID_INPUT',
    sparseAddGetNnz(1, 1, 1, 0, validInner, validOuter, 1, validVals, validInner, validOuter, 0, outNnz), INVALID_INPUT);
  report('sparseAddGetNnz outNnz untouched', readInts(outNnz, 1)[0], SENTINEL_INT);

  const outAddVals = allocDoubles([SENTINEL_VAL]);
  const outAddInner = allocInts([SENTINEL_INT]);
  const outAddOuter = allocInts([SENTINEL_INT, SENTINEL_INT]);
  report('sparseAdd rejects null with INVALID_INPUT',
    sparseAdd(1, 1, 1, 0, validInner, validOuter, 1, validVals, validInner, validOuter, 0, outAddVals, outAddInner, outAddOuter), INVALID_INPUT);
  report('sparseAdd outValues untouched', readDoubles(outAddVals, 1)[0], SENTINEL_VAL);
  report('sparseAdd outInner untouched', readInts(outAddInner, 1)[0], SENTINEL_INT);
  report('sparseAdd outOuter untouched', readInts(outAddOuter, 2)[0], SENTINEL_INT);

  const outTransVals = allocDoubles([SENTINEL_VAL]);
  const outTransInner = allocInts([SENTINEL_INT]);
  const outTransOuter = allocInts([SENTINEL_INT, SENTINEL_INT]);
  report('sparseTranspose rejects null with INVALID_INPUT',
    sparseTranspose(1, 1, 1, 0, validInner, validOuter, 0, outTransVals, outTransInner, outTransOuter), INVALID_INPUT);
  report('sparseTranspose outValues untouched', readDoubles(outTransVals, 1)[0], SENTINEL_VAL);
  report('sparseTranspose outInner untouched', readInts(outTransInner, 1)[0], SENTINEL_INT);
  report('sparseTranspose outOuter untouched', readInts(outTransOuter, 2)[0], SENTINEL_INT);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(outY);
  Module._free(outC);
  Module._free(outNnz);
  Module._free(outAddVals);
  Module._free(outAddInner);
  Module._free(outAddOuter);
  Module._free(outTransVals);
  Module._free(outTransInner);
  Module._free(outTransOuter);
}

// -----------------------------------------------------------------------------
// Test 4: Invalid storageOrder Rejected across Solvers and Ops (REQ-SP-060)
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 2]);
  const validInner = allocInts([0, 1]);
  const validVals = allocDoubles([4.0, 4.0]);
  const n = 2;
  const nnz = 2;
  const INVALID_STORAGE = 2;

  // sparseTranspose with invalid storageOrder
  const outTransVals = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const outTransInner = allocInts([SENTINEL_INT, SENTINEL_INT]);
  const outTransOuter = allocInts([SENTINEL_INT, SENTINEL_INT, SENTINEL_INT]);
  report('sparseTranspose rejects invalid storageOrder',
    sparseTranspose(n, n, nnz, validVals, validInner, validOuter, INVALID_STORAGE, outTransVals, outTransInner, outTransOuter),
    INVALID_INPUT);
  report('sparseTranspose preserves outValues on invalid storageOrder', readDoubles(outTransVals, 1)[0], SENTINEL_VAL);

  // sparseScale with invalid storageOrder
  const outScaleVals = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const outScaleInner = allocInts([SENTINEL_INT, SENTINEL_INT]);
  const outScaleOuter = allocInts([SENTINEL_INT, SENTINEL_INT, SENTINEL_INT]);
  report('sparseScale rejects invalid storageOrder',
    sparseScale(n, n, nnz, validVals, validInner, validOuter, INVALID_STORAGE, 2.0, outScaleVals, outScaleInner, outScaleOuter),
    INVALID_INPUT);
  report('sparseScale preserves outValues on invalid storageOrder', readDoubles(outScaleVals, 1)[0], SENTINEL_VAL);

  // sparseCholeskyFactorize with invalid storageOrder
  const outHandle = allocInts([SENTINEL_INT]);
  report('sparseCholeskyFactorize rejects invalid storageOrder',
    sparseCholeskyFactorize(validVals, validInner, validOuter, n, nnz, INVALID_STORAGE, 0, outHandle),
    INVALID_INPUT);
  report('sparseCholeskyFactorize preserves outHandle on invalid storageOrder', readInts(outHandle, 1)[0], SENTINEL_INT);

  // sparseConjugateGradient with invalid storageOrder
  const b = allocDoubles([1.0, 1.0]);
  const outXCG = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const outItersCG = allocInts([SENTINEL_INT]);
  const outErrCG = allocDoubles([SENTINEL_VAL]);
  report('sparseConjugateGradient rejects invalid storageOrder',
    sparseConjugateGradient(validVals, validInner, validOuter, n, nnz, INVALID_STORAGE, b, 1, outXCG, 100, 1e-6, outItersCG, outErrCG),
    INVALID_INPUT);
  report('sparseConjugateGradient preserves outX on invalid storageOrder', readDoubles(outXCG, 1)[0], SENTINEL_VAL);

  // sparseBiCGSTAB with invalid storageOrder
  const outXBiCG = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  const outItersBiCG = allocInts([SENTINEL_INT]);
  const outErrBiCG = allocDoubles([SENTINEL_VAL]);
  report('sparseBiCGSTAB rejects invalid storageOrder',
    sparseBiCGSTAB(validVals, validInner, validOuter, n, nnz, INVALID_STORAGE, b, 1, outXBiCG, 100, 1e-6, outItersBiCG, outErrBiCG),
    INVALID_INPUT);
  report('sparseBiCGSTAB preserves outX on invalid storageOrder', readDoubles(outXBiCG, 1)[0], SENTINEL_VAL);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(validVals);
  Module._free(outTransVals);
  Module._free(outTransInner);
  Module._free(outTransOuter);
  Module._free(outScaleVals);
  Module._free(outScaleInner);
  Module._free(outScaleOuter);
  Module._free(outHandle);
  Module._free(b);
  Module._free(outXCG);
  Module._free(outItersCG);
  Module._free(outErrCG);
  Module._free(outXBiCG);
  Module._free(outItersBiCG);
  Module._free(outErrBiCG);
}

// -----------------------------------------------------------------------------
// Test 5: validateSparseMatrix Non-Finite (NaN) Detection with Untouched Invariant
// -----------------------------------------------------------------------------
{
  const validOuter = allocInts([0, 1, 2]);
  const validInner = allocInts([0, 1]);
  const nanVals = allocDoubles([NaN, 4.0]);
  const n = 2;
  const nnz = 2;

  const outHandle = allocInts([SENTINEL_INT]);
  report('sparseCholeskyFactorize rejects NaN value with INVALID_INPUT',
    sparseCholeskyFactorize(nanVals, validInner, validOuter, n, nnz, 0, 0, outHandle),
    INVALID_INPUT);
  report('sparseCholeskyFactorize preserves outHandle on NaN', readInts(outHandle, 1)[0], SENTINEL_INT);

  const b = allocDoubles([1.0, 1.0]);
  const outX = allocDoubles([SENTINEL_VAL, SENTINEL_VAL]);
  report('sparseConjugateGradient rejects NaN matrix with INVALID_INPUT',
    sparseConjugateGradient(nanVals, validInner, validOuter, n, nnz, 0, b, 1, outX, 100, 1e-6, 0, 0),
    INVALID_INPUT);
  report('sparseConjugateGradient preserves outX on NaN matrix', readDoubles(outX, 1)[0], SENTINEL_VAL);

  report('sparseBiCGSTAB rejects NaN matrix with INVALID_INPUT',
    sparseBiCGSTAB(nanVals, validInner, validOuter, n, nnz, 0, b, 1, outX, 100, 1e-6, 0, 0),
    INVALID_INPUT);
  report('sparseBiCGSTAB preserves outX on NaN matrix', readDoubles(outX, 1)[0], SENTINEL_VAL);

  Module._free(validOuter);
  Module._free(validInner);
  Module._free(nanVals);
  Module._free(outHandle);
  Module._free(b);
  Module._free(outX);
}

if (failed > 0) {
  console.error(`FAILED: ${failed} tests failed`);
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}

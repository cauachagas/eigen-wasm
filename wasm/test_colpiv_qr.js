// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_colpiv_qr.js: TDD test suite for Ticket 009 (ColPivHouseholderQR and matrix generation)
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const colPivQr = Module.cwrap('colPivQr', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
const rank = Module.cwrap('rank', 'number', ['number', 'number', 'number', 'number']);
const generatePrescribedSingularValues = Module.cwrap('generatePrescribedSingularValues', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -3.3333333333333e-100;
const MAX_DIMENSION = maxDimension();

let failed = 0;

function report(name, result, expected) {
  try {
    assert.deepEqual(result, expected);
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${result}\n  expected: ${expected}`);
  }
}

function alloc(values) {
  const ptr = Module._malloc(values.length * 8);
  for (let i = 0; i < values.length; i++) Module.setValue(ptr + i * 8, values[i], 'double');
  return ptr;
}

function readDoubles(ptr, count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(Module.getValue(ptr + i * 8, 'double'));
  return arr;
}

function readInts(ptr, count) {
  const arr = [];
  for (let i = 0; i < count; i++) arr.push(Module.getValue(ptr + i * 4, 'i32'));
  return arr;
}

// 1. Test deterministic matrix generation with prescribed singular values
{
  const rows = 4, cols = 3;
  const s = [10.0, 5.0, 0.0]; // Prescribed singular values: rank should be 2
  const sPtr = alloc(s);
  const outPtr1 = Module._malloc(rows * cols * 8);
  const outPtr2 = Module._malloc(rows * cols * 8);

  const info1 = generatePrescribedSingularValues(outPtr1, rows, cols, sPtr, s.length, 42);
  const info2 = generatePrescribedSingularValues(outPtr2, rows, cols, sPtr, s.length, 42);

  report('matrix generator info', info1, SUCCESS);

  const mat1 = readDoubles(outPtr1, rows * cols);
  const mat2 = readDoubles(outPtr2, rows * cols);

  // Exact reproducibility check
  report('matrix generator reproducible with same seed', mat1, mat2);

  // 2. ColPivHouseholderQR rank detection on this generated rank-2 matrix
  const qPtr = Module._malloc(rows * rows * 8);
  const rPtr = Module._malloc(rows * cols * 8);
  for (let i = 0; i < rows * cols; i++) Module.setValue(rPtr + i * 8, SENTINEL, 'double');
  const permPtr = Module._malloc(cols * 4);
  const rankPtr = Module._malloc(4);

  const qrInfo = colPivQr(outPtr1, rows, cols, qPtr, rPtr, permPtr, rankPtr);
  report('colPivQr info', qrInfo, SUCCESS);

  const computedRank = Module.getValue(rankPtr, 'i32');
  report('colPivQr rank matches prescribed rank (2)', computedRank, 2);

  // Check R strictly upper triangular (entries with i > j must be 0.0)
  const R = readDoubles(rPtr, rows * cols);
  let lowerZero = true;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (i > j && R[i * cols + j] !== 0) {
        lowerZero = false;
      }
    }
  }
  if (!lowerZero) failed++;
  report('colPivQr R strictly upper triangular (zeros below diagonal)', lowerZero, true);

  // 3. Rejection of NaN input
  const nanMat = [NaN, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const nanPtr = alloc(nanMat);
  Module.setValue(qPtr, SENTINEL, 'double');
  Module.setValue(rPtr, SENTINEL, 'double');
  const nanInfo = colPivQr(nanPtr, rows, cols, qPtr, rPtr, permPtr, rankPtr);
  report('colPivQr NaN input returns InvalidInput', nanInfo, INVALID_INPUT);
  report('colPivQr NaN input leaves buffers untouched',
    Module.getValue(qPtr, 'double') === SENTINEL && Module.getValue(rPtr, 'double') === SENTINEL, true);
  Module._free(nanPtr);

  Module._free(sPtr);
  Module._free(outPtr1);
  Module._free(outPtr2);
  Module._free(qPtr);
  Module._free(rPtr);
  Module._free(permPtr);
  Module._free(rankPtr);
}

// 4. Test standalone rank routine
{
  const rankOutPtr = Module._malloc(4);
  Module.setValue(rankOutPtr, -999, 'i32');

  // Full rank 2x2 identity
  const idMat = [1, 0, 0, 1];
  const idPtr = alloc(idMat);
  const info1 = rank(idPtr, 2, 2, rankOutPtr);
  report('rank identity info', info1, SUCCESS);
  report('rank identity is 2', Module.getValue(rankOutPtr, 'i32'), 2);
  Module._free(idPtr);

  // Rank 1 2x2 matrix
  const r1Mat = [1, 2, 2, 4];
  const r1Ptr = alloc(r1Mat);
  const info2 = rank(r1Ptr, 2, 2, rankOutPtr);
  report('rank rank-1 info', info2, SUCCESS);
  report('rank rank-1 is 1', Module.getValue(rankOutPtr, 'i32'), 1);
  Module._free(r1Ptr);

  // Non-finite input
  Module.setValue(rankOutPtr, -999, 'i32');
  const nanMat = [NaN, 1, 2, 3];
  const nanPtr = alloc(nanMat);
  const nanInfo = rank(nanPtr, 2, 2, rankOutPtr);
  report('rank non-finite input returns InvalidInput', nanInfo, INVALID_INPUT);
  report('rank non-finite leaves output untouched', Module.getValue(rankOutPtr, 'i32'), -999);
  Module._free(nanPtr);

  // Null input
  const nullInfo = rank(0, 2, 2, rankOutPtr);
  report('rank null input returns InvalidInput', nullInfo, INVALID_INPUT);

  Module._free(rankOutPtr);
}

process.exit(failed ? 1 : 0);

// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_colpiv_qr.js: TDD test suite for Ticket 009 (ColPivHouseholderQR and matrix generation)
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const colPivQr = Module.cwrap('colPivQr', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number']);
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
  const permPtr = Module._malloc(cols * 4);
  const rankPtr = Module._malloc(4);

  const qrInfo = colPivQr(outPtr1, rows, cols, qPtr, rPtr, permPtr, rankPtr);
  report('colPivQr info', qrInfo, SUCCESS);

  const computedRank = Module.getValue(rankPtr, 'i32');
  report('colPivQr rank matches prescribed rank (2)', computedRank, 2);

  Module._free(sPtr);
  Module._free(outPtr1);
  Module._free(outPtr2);
  Module._free(qPtr);
  Module._free(rPtr);
  Module._free(permPtr);
  Module._free(rankPtr);
}

process.exit(failed ? 1 : 0);

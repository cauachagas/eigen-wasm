// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_bdc_svd.js: TDD test suite for Ticket 011 (BDCSVD for large matrices)
import assert from 'node:assert/strict';
import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const bdcSvd = Module.cwrap('bdcSvd', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;
const PRECISION = 1e-6;
const SENTINEL = -2.2222222222222e-100;
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

// 1. BDCSVD on a 4x4 matrix
{
  const n = 4;
  // Diagonal matrix with singular values 10, 8, 4, 1
  const A = [
    10, 0, 0, 0,
    0, 8, 0, 0,
    0, 0, 4, 0,
    0, 0, 0, 1
  ];
  const aPtr = alloc(A);
  const sPtr = Module._malloc(n * 8);
  const uPtr = Module._malloc(n * n * 8);
  const vtPtr = Module._malloc(n * n * 8);

  const info = bdcSvd(aPtr, n, n, sPtr, uPtr, vtPtr);
  report('bdcSvd 4x4 info', info, SUCCESS);

  const S = readDoubles(sPtr, n);
  report('bdcSvd singular values match', S.map(v => Math.round(v)), [10, 8, 4, 1]);

  Module._free(aPtr);
  Module._free(sPtr);
  Module._free(uPtr);
  Module._free(vtPtr);
}

// 2. Non-finite input check returns InvalidInput
{
  const A = [1, NaN, 0, 1];
  const aPtr = alloc(A);
  const sPtr = Module._malloc(2 * 8);
  const uPtr = Module._malloc(4 * 8);
  const vtPtr = Module._malloc(4 * 8);
  Module.setValue(sPtr, SENTINEL, 'double');

  const info = bdcSvd(aPtr, 2, 2, sPtr, uPtr, vtPtr);
  report('bdcSvd non-finite returns InvalidInput', info, INVALID_INPUT);

  const untouched = Module.getValue(sPtr, 'double') === SENTINEL;
  report('bdcSvd non-finite leaves buffer untouched', untouched, true);

  Module._free(aPtr);
  Module._free(sPtr);
  Module._free(uPtr);
  Module._free(vtPtr);
}

process.exit(failed ? 1 : 0);

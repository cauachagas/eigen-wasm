// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_helpers.js: Canonical test helpers and constants for WebAssembly test suites.
import assert from 'node:assert/strict';

export const SUCCESS = 0;
export const NUMERICAL_ISSUE = 1;
export const NO_CONVERGENCE = 2;
export const INVALID_INPUT = 3;

export const PRECISION = 1e-6;
export const SENTINEL = -4.4444444444444e-100;

export function createTester(Module) {
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

  function allocInts(values) {
    const ptr = Module._malloc(values.length * 4);
    for (let i = 0; i < values.length; i++) Module.setValue(ptr + i * 4, values[i], 'i32');
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

  function norm(v) {
    let sum = 0;
    for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
    return Math.sqrt(sum);
  }

  function checkFailed() {
    return failed;
  }

  return {
    report,
    alloc,
    allocInts,
    readDoubles,
    readInts,
    norm,
    checkFailed,
  };
}

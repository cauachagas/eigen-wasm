// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// determinant() over WASM memory: the determinant of a row-major rows-by-cols matrix,
// written into a caller-allocated buffer, returning Eigen's ComputationInfo verbatim.
// Expected determinants are hand-computed literals, never recomputed by an Eigen call.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const determinant = Module.cwrap('determinant', 'number', ['number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

// Eigen::ComputationInfo, as returned over the ABI. No mapping: these are the enum's own
// values. determinant() can report SUCCESS or INVALID_INPUT only; the other two values
// belong to decompositions that can fail after being attempted.
const SUCCESS = 0;
const INVALID_INPUT = 3;

// The reference suite's precision for double (EIGEN_TEST_PRECISION in test/Matrix.h).
const PRECISION = 1e-6;

// A determinant that is not a result: survives a failed call if nothing was written.
const SENTINEL = -1.2345678901234e-100;

// Read the dimension ceiling directly from the module so the test and implementation
// cannot drift out of sync.
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

// Eigen's own relative rule: a difference passes when it is at most the smaller magnitude
// times the precision. Both operands must be finite, so a NaN fails instead of passing.
function closeEnough(got, expected) {
  return Number.isFinite(got) && Number.isFinite(expected) &&
      Math.abs(got - expected) <= Math.min(Math.abs(got), Math.abs(expected)) * PRECISION;
}

function reportClose(name, got, expected) {
  if (closeEnough(got, expected)) {
    console.log(`ok - ${name}`);
  } else {
    failed++;
    console.error(`not ok - ${name}\n  got:      ${got}\n  expected: ${expected}`);
  }
}

// Copy a row-major coefficient array into a fresh WASM buffer of doubles.
function alloc(values) {
  const ptr = Module._malloc(values.length * 8);
  for (let i = 0; i < values.length; i++) Module.setValue(ptr + i * 8, values[i], 'double');
  return ptr;
}

// A successful call, named after what it checks.
function check(name, values, rows, cols, expected) {
  let aPtr = 0;
  let outPtr = 0;
  try {
    aPtr = alloc(values);
    outPtr = Module._malloc(8);
    const info = determinant(aPtr, rows, cols, outPtr);
    const det = Module.getValue(outPtr, 'double');
    report(`${name}: ComputationInfo`, info, SUCCESS);
    reportClose(name, det, expected);
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw an unexpected error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

check('1x1', [6], 1, 1, 6);

// |1 2| = 1*4 - 2*3
check('2x2', [1, 2, 3, 4], 2, 2, -2);

// 1*(5*10 - 6*8) - 2*(4*10 - 6*7) + 3*(4*8 - 5*7) = 2 + 4 - 9
check('3x3', [1, 2, 3, 4, 5, 6, 7, 8, 10], 3, 3, -3);

// Upper triangular with a unit diagonal, so the determinant is the product of the diagonal: 1.
// At the dimension ceiling, so the largest matrix the contract admits is exercised rather than
// assumed. Every entry is 0 or 1, so the expected value stays a literal and not an error bound.
const unitUpper = new Array(MAX_DIMENSION * MAX_DIMENSION);
for (let i = 0; i < MAX_DIMENSION; i++) {
  for (let j = 0; j < MAX_DIMENSION; j++) unitUpper[i * MAX_DIMENSION + j] = i <= j ? 1 : 0;
}
check(`${MAX_DIMENSION}x${MAX_DIMENSION} unit upper triangular`, unitUpper, MAX_DIMENSION, MAX_DIMENSION, 1);

// A singular matrix is a determinant, not a failure: its answer is 0 and it still reports
// Success. Only the code is asserted, because no finite determinant equals a computed 0.
{
  let aPtr = 0;
  let outPtr = 0;
  try {
    aPtr = alloc([1, 2, 2, 4]);
    outPtr = Module._malloc(8);
    Module.setValue(outPtr, SENTINEL, 'double');
    const info = determinant(aPtr, 2, 2, outPtr);
    const det = Module.getValue(outPtr, 'double');
    report('singular 2x2 reports Success', info, SUCCESS);
    report('singular 2x2 determinant is zero', Math.abs(det) <= PRECISION * 4, true);
  } catch (err) {
    failed++;
    console.error(`not ok - singular 2x2 threw an error: ${err.message}`);
  } finally {
    if (aPtr !== 0) Module._free(aPtr);
    if (outPtr !== 0) Module._free(outPtr);
  }
}

// The contract seam: every rejected input reports InvalidInput and leaves the caller's
// output buffer exactly as it was. `values` is the matrix handed in; a null entry among the
// pointer arguments is passed as 0.
const rejected = [
  ['null matrix pointer', null, 2, 2, [1, 2, 3, 4]],
  ['null output pointer', [1, 2, 3, 4], 2, 2, null],
  ['both pointers null', null, 3, 3, null],
  ['zero rows', [1, 2, 3, 4], 0, 0, []],
  ['zero cols', [1, 2, 3, 4], 2, 0, []],
  ['negative rows', [1, 2, 3, 4], -3, -3, []],
  ['negative cols', [1, 2, 3, 4], 3, -3, []],
  ['non-square, more rows than cols', [1, 2, 3, 4, 5, 6], 3, 2, []],
  ['non-square, more cols than rows', [1, 2, 3, 4, 5, 6], 2, 3, []],
  ['one row above the ceiling', [1, 2, 3, 4], MAX_DIMENSION + 1, MAX_DIMENSION + 1, []],
  ['the Eigen suite ceiling, 320', [1, 2, 3, 4], 320, 320, []],
];

for (const [name, values, rows, cols, out] of rejected) {
  const hasOut = out !== null;
  const aPtr = values === null ? 0 : alloc(values);
  const outPtr = hasOut ? Module._malloc(8) : 0;
  if (hasOut) Module.setValue(outPtr, SENTINEL, 'double');

  try {
    const info = determinant(aPtr, rows, cols, outPtr);
    report(`${name}: InvalidInput`, info, INVALID_INPUT);

    if (hasOut) {
      const untouched = Module.getValue(outPtr, 'double') === SENTINEL;
      report(`${name}: output untouched`, untouched, true);
    }
  } catch (err) {
    failed++;
    console.error(`not ok - ${name} threw an unexpected error: ${err.message}`);
  } finally {
    if (outPtr !== 0) Module._free(outPtr);
    if (aPtr !== 0) Module._free(aPtr);
  }
}

process.exit(failed ? 1 : 0);
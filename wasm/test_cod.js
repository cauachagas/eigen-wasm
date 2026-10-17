// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// cod() and pseudoInverse() over WASM memory: Complete Orthogonal Decomposition
// and Moore-Penrose pseudoinverse using CompleteOrthogonalDecomposition.
// Adapted directly from upstream Eigen tests in test/qr_colpivoting.cpp.
import assert from 'node:assert/strict';

import EigenWasmModule from './eigen_wasm.js';

const Module = await EigenWasmModule();
const cod = Module.cwrap('cod', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);
const pseudoInverse = Module.cwrap('pseudoInverse', 'number', ['number', 'number', 'number', 'number']);
const maxDimension = Module.cwrap('maxDimension', 'number', []);

const SUCCESS = 0;
const INVALID_INPUT = 3;

const PRECISION = 1e-6;
const SENTINEL = -9.8765432109876e-100;
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

function matMul(A, B, rA, cA, cB) {
  const res = new Array(rA * cB).fill(0);
  for (let i = 0; i < rA; i++) {
    for (let j = 0; j < cB; j++) {
      for (let k = 0; k < cA; k++) {
        res[i * cB + j] += A[i * cA + k] * B[k * cB + j];
      }
    }
  }
  return res;
}

function transpose(A, r, c) {
  const res = new Array(c * r).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      res[j * r + i] = A[i * c + j];
    }
  }
  return res;
}

function norm(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

function isApprox(A, B, tol = PRECISION) {
  if (A.length !== B.length) return false;
  for (let i = 0; i < A.length; i++) {
    const diff = Math.abs(A[i] - B[i]);
    const scale = Math.max(Math.abs(A[i]), Math.abs(B[i]), 1.0);
    if (diff > scale * tol) return false;
  }
  return true;
}

// 1. Test pseudoInverse for square and rectangular rank-deficient matrices
function testPseudoInverse(name, A_vals, rows, cols, expectedRank) {
  let aPtr = 0, pinvPtr = 0;
  try {
    aPtr = alloc(A_vals);
    pinvPtr = alloc(new Array(cols * rows).fill(SENTINEL));

    const status = pseudoInverse(aPtr, rows, cols, pinvPtr);
    report(`${name} status`, status, SUCCESS);

    const pinv = readDoubles(pinvPtr, cols * rows);

    // Penrose Condition 1: A * A^+ * A = A
    const AAplus = matMul(A_vals, pinv, rows, cols, rows);
    const AAplusA = matMul(AAplus, A_vals, rows, rows, cols);
    report(`${name} Penrose condition 1 (A * A+ * A = A)`, isApprox(AAplusA, A_vals), true);

    // Penrose Condition 2: A^+ * A * A^+ = A^+
    const AplusA = matMul(pinv, A_vals, cols, rows, cols);
    const AplusAAplus = matMul(AplusA, pinv, cols, cols, rows);
    report(`${name} Penrose condition 2 (A+ * A * A+ = A+)`, isApprox(AplusAAplus, pinv), true);

    // Penrose Condition 3: (A * A^+)^T = A * A^+
    const AAplusT = transpose(AAplus, rows, rows);
    report(`${name} Penrose condition 3 ((A * A+)^T = A * A+)`, isApprox(AAplusT, AAplus), true);

    // Penrose Condition 4: (A^+ * A)^T = A^+ * A
    const AplusAT = transpose(AplusA, cols, cols);
    report(`${name} Penrose condition 4 ((A+ * A)^T = A+ * A)`, isApprox(AplusAT, AplusA), true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (pinvPtr) Module._free(pinvPtr);
  }
}

// 2. Test cod decomposition (Q * T * Z * P^T = A)
function testCOD(name, A_vals, rows, cols) {
  let aPtr = 0, qPtr = 0, tPtr = 0, zPtr = 0, permPtr = 0, rankPtr = 0;
  try {
    aPtr = alloc(A_vals);
    qPtr = alloc(new Array(rows * rows).fill(SENTINEL));
    tPtr = alloc(new Array(rows * cols).fill(SENTINEL));
    zPtr = alloc(new Array(cols * cols).fill(SENTINEL));
    permPtr = allocInts(new Array(cols).fill(-1));
    rankPtr = allocInts([-1]);

    const status = cod(aPtr, rows, cols, qPtr, tPtr, zPtr, permPtr, rankPtr);
    report(`${name} status`, status, SUCCESS);

    const Q = readDoubles(qPtr, rows * rows);
    const T = readDoubles(tPtr, rows * cols);
    const Z = readDoubles(zPtr, cols * cols);
    const P_indices = readInts(permPtr, cols);
    const rankVal = readInts(rankPtr, 1)[0];

    report(`${name} computed rank is valid`, rankVal >= 0 && rankVal <= Math.min(rows, cols), true);

    // Check Q is unitary: Q * Q^T = I
    const QT = transpose(Q, rows, rows);
    const QQT = matMul(Q, QT, rows, rows, rows);
    const Irows = new Array(rows * rows).fill(0);
    for (let i = 0; i < rows; i++) Irows[i * rows + i] = 1.0;
    report(`${name} Q is orthogonal`, isApprox(QQT, Irows), true);

    // Check Z is unitary: Z * Z^T = I
    const ZT = transpose(Z, cols, cols);
    const ZZT = matMul(Z, ZT, cols, cols, cols);
    const Icols = new Array(cols * cols).fill(0);
    for (let i = 0; i < cols; i++) Icols[i * cols + i] = 1.0;
    report(`${name} Z is orthogonal`, isApprox(ZZT, Icols), true);

    // Reconstruct A:
    // P is a permutation of cols: perm[j] is the source column.
    // Matrix P matrix (cols x cols): element (P_indices[j], j) = 1.
    // P^T has element (j, P_indices[j]) = 1.
    const P = new Array(cols * cols).fill(0);
    for (let j = 0; j < cols; j++) {
      P[P_indices[j] * cols + j] = 1.0;
    }
    const PT = transpose(P, cols, cols);

    // Q (rows x rows) * T (rows x cols) * Z (cols x cols) * P^T (cols x cols)
    const QT_mat = matMul(Q, T, rows, rows, cols);
    const QTZ = matMul(QT_mat, Z, rows, cols, cols);
    const reconstructed = matMul(QTZ, PT, rows, cols, cols);

    report(`${name} reconstruction ||Q * T * Z * P^T - A||`, isApprox(reconstructed, A_vals, 1e-5), true);
  } finally {
    if (aPtr) Module._free(aPtr);
    if (qPtr) Module._free(qPtr);
    if (tPtr) Module._free(tPtr);
    if (zPtr) Module._free(zPtr);
    if (permPtr) Module._free(permPtr);
    if (rankPtr) Module._free(rankPtr);
  }
}

// Cases adapted from upstream test/qr_colpivoting.cpp
// 1. Invertible 2x2
testPseudoInverse('pseudoInverse 2x2 invertible', [1, 2, 3, 4], 2, 2, 2);
testCOD('cod 2x2 invertible', [1, 2, 3, 4], 2, 2);

// 2. Rectangular 3x2 (overdetermined, full rank)
const A3x2 = [
  1, 2,
  3, 4,
  5, 6
];
testPseudoInverse('pseudoInverse 3x2 full rank', A3x2, 3, 2, 2);
testCOD('cod 3x2 full rank', A3x2, 3, 2);

// 3. Rectangular 2x3 (underdetermined, full rank)
const A2x3 = [
  1, 2, 3,
  4, 5, 6
];
testPseudoInverse('pseudoInverse 2x3 full rank', A2x3, 2, 3, 2);
testCOD('cod 2x3 full rank', A2x3, 2, 3);

// 4. Rank deficient 3x3 (rank 1)
const A_rank1 = [
  1, 2, 3,
  2, 4, 6,
  3, 6, 9
];
testPseudoInverse('pseudoInverse 3x3 rank-1', A_rank1, 3, 3, 1);
testCOD('cod 3x3 rank-1', A_rank1, 3, 3);

// Dimension bounds checks and null pointers
{
  let aPtr = alloc([1, 2, 3, 4]);
  let outPtr = alloc(new Array(4).fill(SENTINEL));

  report('pseudoInverse rejects null a', pseudoInverse(0, 2, 2, outPtr), INVALID_INPUT);
  report('pseudoInverse rejects null out', pseudoInverse(aPtr, 2, 2, 0), INVALID_INPUT);
  report('pseudoInverse rejects rows <= 0', pseudoInverse(aPtr, 0, 2, outPtr), INVALID_INPUT);
  report('pseudoInverse rejects cols <= 0', pseudoInverse(aPtr, 2, 0, outPtr), INVALID_INPUT);
  report('pseudoInverse rejects rows > MAX_DIMENSION', pseudoInverse(aPtr, MAX_DIMENSION + 1, 2, outPtr), INVALID_INPUT);
  report('pseudoInverse rejects cols > MAX_DIMENSION', pseudoInverse(aPtr, 2, MAX_DIMENSION + 1, outPtr), INVALID_INPUT);

  const outSentinel = readDoubles(outPtr, 4);
  report('pseudoInverse preserves output buffer on invalid input', outSentinel, new Array(4).fill(SENTINEL));

  Module._free(aPtr);
  Module._free(outPtr);
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll test_cod assertions passed.');
}

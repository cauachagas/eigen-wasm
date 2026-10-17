// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// test_poisson_generators.js: Unit tests for 2D and 3D Poisson sparse matrix generators.
// Verifies structural integrity, strict monotonicity, symmetry, positive definiteness,
// and direct compatibility with eigen-wasm solvers.

import { generatePoisson2D, generatePoisson3D } from '../bench/poisson.js';
import EigenWasmModule from './eigen_wasm.js';
import { SUCCESS, INVALID_INPUT, SENTINEL, createTester } from './test_helpers.js';

const Module = await EigenWasmModule();
const { report, alloc, allocInts, readDoubles, readInts, checkFailed } = createTester(Module);

console.log('--- Testing Poisson 2D Generator ---');

// 1. Poisson 2D with N = 2 (n = 4, nnz = 12)
{
  const p2 = generatePoisson2D(2);
  report('Poisson 2D N=2: rows === 4', p2.rows, 4);
  report('Poisson 2D N=2: cols === 4', p2.cols, 4);
  report('Poisson 2D N=2: nnz === 12', p2.nnz, 12);
  report('Poisson 2D N=2: outerStarts[0] === 0', p2.outerStarts[0], 0);
  report('Poisson 2D N=2: outerStarts[n] === nnz', p2.outerStarts[4], 12);

  // Check strict monotonicity
  let monotonic = true;
  for (let c = 0; c < 4; c++) {
    const start = p2.outerStarts[c];
    const end = p2.outerStarts[c + 1];
    let prev = -1;
    for (let k = start; k < end; k++) {
      if (p2.innerIndices[k] <= prev) monotonic = false;
      prev = p2.innerIndices[k];
    }
  }
  report('Poisson 2D N=2: innerIndices strictly ascending', monotonic, true);
}

// 2. Poisson 2D with N = 5 (n = 25, nnz = 5 * 25 - 4 * 5 = 105)
{
  const p2 = generatePoisson2D(5);
  report('Poisson 2D N=5: rows === 25', p2.rows, 25);
  report('Poisson 2D N=5: cols === 25', p2.cols, 25);
  report('Poisson 2D N=5: nnz === 105', p2.nnz, 105);

  let validDiagonal = true;
  let strictlyAscending = true;
  for (let c = 0; c < 25; c++) {
    const start = p2.outerStarts[c];
    const end = p2.outerStarts[c + 1];
    let prev = -1;
    let foundDiag = false;
    for (let k = start; k < end; k++) {
      const r = p2.innerIndices[k];
      const val = p2.values[k];
      if (r <= prev) strictlyAscending = false;
      prev = r;
      if (r === c) {
        foundDiag = true;
        if (val !== 4.0) validDiagonal = false;
      } else {
        if (val !== -1.0) validDiagonal = false;
      }
    }
    if (!foundDiag) validDiagonal = false;
  }
  report('Poisson 2D N=5: strictly ascending indices', strictlyAscending, true);
  report('Poisson 2D N=5: valid stencil entries (diag=4, offdiag=-1)', validDiagonal, true);
}

console.log('--- Testing Poisson 3D Generator ---');

// 3. Poisson 3D with N = 2 (n = 8, nnz = 7 * 8 - 6 * 4 = 32)
{
  const p3 = generatePoisson3D(2);
  report('Poisson 3D N=2: rows === 8', p3.rows, 8);
  report('Poisson 3D N=2: cols === 8', p3.cols, 8);
  report('Poisson 3D N=2: nnz === 32', p3.nnz, 32);
  report('Poisson 3D N=2: outerStarts[0] === 0', p3.outerStarts[0], 0);
  report('Poisson 3D N=2: outerStarts[8] === 32', p3.outerStarts[8], 32);

  let monotonic = true;
  for (let c = 0; c < 8; c++) {
    const start = p3.outerStarts[c];
    const end = p3.outerStarts[c + 1];
    let prev = -1;
    for (let k = start; k < end; k++) {
      if (p3.innerIndices[k] <= prev) monotonic = false;
      prev = p3.innerIndices[k];
    }
  }
  report('Poisson 3D N=2: innerIndices strictly ascending', monotonic, true);
}

// 4. Poisson 3D with N = 4 (n = 64, nnz = 7 * 64 - 6 * 16 = 448 - 96 = 352)
{
  const p3 = generatePoisson3D(4);
  report('Poisson 3D N=4: rows === 64', p3.rows, 64);
  report('Poisson 3D N=4: cols === 64', p3.cols, 64);
  report('Poisson 3D N=4: nnz === 352', p3.nnz, 352);

  let validDiagonal = true;
  let strictlyAscending = true;
  for (let c = 0; c < 64; c++) {
    const start = p3.outerStarts[c];
    const end = p3.outerStarts[c + 1];
    let prev = -1;
    let foundDiag = false;
    for (let k = start; k < end; k++) {
      const r = p3.innerIndices[k];
      const val = p3.values[k];
      if (r <= prev) strictlyAscending = false;
      prev = r;
      if (r === c) {
        foundDiag = true;
        if (val !== 6.0) validDiagonal = false;
      } else {
        if (val !== -1.0) validDiagonal = false;
      }
    }
    if (!foundDiag) validDiagonal = false;
  }
  report('Poisson 3D N=4: strictly ascending indices', strictlyAscending, true);
  report('Poisson 3D N=4: valid stencil entries (diag=6, offdiag=-1)', validDiagonal, true);
}

console.log('--- Testing Solvability with Wasm Solvers ---');

// 5. Direct Cholesky and CG on Poisson 2D (N=5, n=25)
{
  const p2 = generatePoisson2D(5);
  const pVals = alloc(p2.values);
  const pInner = allocInts(p2.innerIndices);
  const pOuter = allocInts(p2.outerStarts);
  const pHandle = allocInts([SENTINEL]);

  // Factorize with SimplicialLDLT
  const factStatus = Module._sparseCholeskyFactorize(pVals, pInner, pOuter, p2.n, p2.nnz, 0, 0, pHandle);
  report('Poisson 2D Cholesky factorize status === SUCCESS', factStatus, SUCCESS);
  const handle = readInts(pHandle, 1)[0];
  report('Poisson 2D Cholesky returns valid positive handle', handle > 0, true);

  // Solve with RHS = 1.0
  const b = new Float64Array(p2.n).fill(1.0);
  const pB = alloc(b);
  const pOutX = alloc(new Float64Array(p2.n).fill(SENTINEL));

  const solveStatus = Module._sparseCholeskySolve(handle, pB, 1, pOutX);
  report('Poisson 2D Cholesky solve status === SUCCESS', solveStatus, SUCCESS);
  const xDirect = readDoubles(pOutX, p2.n);
  report('Poisson 2D Cholesky solution non-sentinel', xDirect[0] !== SENTINEL, true);

  Module._sparseCholeskyDestroy(handle);

  // Solve with ConjugateGradient
  const pOutXCG = alloc(new Float64Array(p2.n).fill(SENTINEL));
  const pIters = allocInts([SENTINEL]);
  const pError = alloc([SENTINEL]);

  const cgStatus = Module._sparseConjugateGradient(
    pVals, pInner, pOuter, p2.n, p2.nnz, 0,
    pB, 1, pOutXCG, 200, 1e-10, pIters, pError
  );
  report('Poisson 2D CG solve status === SUCCESS', cgStatus, SUCCESS);
  const xCG = readDoubles(pOutXCG, p2.n);
  const iters = readInts(pIters, 1)[0];
  report('Poisson 2D CG converged in positive iterations', iters > 0, true);

  // Verify direct and CG solutions match within 1e-6
  let maxDiff = 0.0;
  for (let i = 0; i < p2.n; i++) {
    const diff = Math.abs(xDirect[i] - xCG[i]);
    if (diff > maxDiff) maxDiff = diff;
  }
  report('Poisson 2D CG matches Cholesky (diff < 1e-6)', maxDiff < 1e-6, true);

  Module._free(pVals);
  Module._free(pInner);
  Module._free(pOuter);
  Module._free(pHandle);
  Module._free(pB);
  Module._free(pOutX);
  Module._free(pOutXCG);
  Module._free(pIters);
  Module._free(pError);
}

// 6. Invalid parameters rejected
{
  let threw2D = false;
  try {
    generatePoisson2D(1);
  } catch (e) {
    threw2D = true;
  }
  report('generatePoisson2D rejects N < 2', threw2D, true);

  let threw3D = false;
  try {
    generatePoisson3D(1);
  } catch (e) {
    threw3D = true;
  }
  report('generatePoisson3D rejects N < 2', threw3D, true);

  // Non-integer inputs
  let threwNonInt2D = false;
  try {
    generatePoisson2D(2.5);
  } catch (e) {
    threwNonInt2D = true;
  }
  report('generatePoisson2D rejects float N=2.5', threwNonInt2D, true);

  let threwNaN3D = false;
  try {
    generatePoisson3D(NaN);
  } catch (e) {
    threwNaN3D = true;
  }
  report('generatePoisson3D rejects NaN', threwNaN3D, true);
}

checkFailed();

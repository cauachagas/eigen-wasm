// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// poisson.js: Canonical Laplacian matrix generators for 2D and 3D Poisson problems.
// Generates Symmetric Positive-Definite (SPD) sparse matrices in compressed CSC/CSR format
// with strictly ascending inner indices and exact Dirichlet boundary conditions.

/**
 * Generate a 2D Poisson sparse Laplacian matrix on an N x N regular grid.
 * Uses standard 5-point finite difference stencil with zero Dirichlet boundary conditions.
 *
 * Matrix properties:
 * - Dimension: n = N^2 rows and columns
 * - Non-zeros: nnz = 5 * N^2 - 4 * N
 * - Diagonal entry: +4.0
 * - Neighbor entry: -1.0
 * - Storage order: CSC (and CSR, as matrix is symmetric)
 *
 * @param {number} N - Number of grid points along each dimension (N >= 2)
 * @returns {{ n: number, rows: number, cols: number, nnz: number, values: Float64Array, innerIndices: Int32Array, outerStarts: Int32Array, storageOrder: number }}
 */
export function generatePoisson2D(N) {
  if (!Number.isInteger(N) || N < 2) {
    throw new Error(`Poisson 2D requires integer grid dimension N >= 2, received ${N}`);
  }

  const n = N * N;
  const nnz = 5 * n - 4 * N;

  const values = new Float64Array(nnz);
  const innerIndices = new Int32Array(nnz);
  const outerStarts = new Int32Array(n + 1);

  let offset = 0;

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const col = j * N + i;
      outerStarts[col] = offset;

      // Bottom neighbor: (i, j - 1)
      if (j > 0) {
        innerIndices[offset] = col - N;
        values[offset] = -1.0;
        offset++;
      }

      // Left neighbor: (i - 1, j)
      if (i > 0) {
        innerIndices[offset] = col - 1;
        values[offset] = -1.0;
        offset++;
      }

      // Diagonal: (i, j)
      innerIndices[offset] = col;
      values[offset] = 4.0;
      offset++;

      // Right neighbor: (i + 1, j)
      if (i < N - 1) {
        innerIndices[offset] = col + 1;
        values[offset] = -1.0;
        offset++;
      }

      // Top neighbor: (i, j + 1)
      if (j < N - 1) {
        innerIndices[offset] = col + N;
        values[offset] = -1.0;
        offset++;
      }
    }
  }

  outerStarts[n] = offset;

  return {
    n,
    rows: n,
    cols: n,
    nnz,
    values,
    innerIndices,
    outerStarts,
    storageOrder: 0 // CSC
  };
}

/**
 * Generate a 3D Poisson sparse Laplacian matrix on an N x N x N regular grid.
 * Uses standard 7-point finite difference stencil with zero Dirichlet boundary conditions.
 *
 * Matrix properties:
 * - Dimension: n = N^3 rows and columns
 * - Non-zeros: nnz = 7 * N^3 - 6 * N^2
 * - Diagonal entry: +6.0
 * - Neighbor entry: -1.0
 * - Storage order: CSC (and CSR, as matrix is symmetric)
 *
 * @param {number} N - Number of grid points along each dimension (N >= 2)
 * @returns {{ n: number, rows: number, cols: number, nnz: number, values: Float64Array, innerIndices: Int32Array, outerStarts: Int32Array, storageOrder: number }}
 */
export function generatePoisson3D(N) {
  if (!Number.isInteger(N) || N < 2) {
    throw new Error(`Poisson 3D requires integer grid dimension N >= 2, received ${N}`);
  }

  const n = N * N * N;
  const nnz = 7 * n - 6 * N * N;

  const values = new Float64Array(nnz);
  const innerIndices = new Int32Array(nnz);
  const outerStarts = new Int32Array(n + 1);

  const N2 = N * N;
  let offset = 0;

  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const col = k * N2 + j * N + i;
        outerStarts[col] = offset;

        // Front neighbor: (i, j, k - 1)
        if (k > 0) {
          innerIndices[offset] = col - N2;
          values[offset] = -1.0;
          offset++;
        }

        // Bottom neighbor: (i, j - 1, k)
        if (j > 0) {
          innerIndices[offset] = col - N;
          values[offset] = -1.0;
          offset++;
        }

        // Left neighbor: (i - 1, j, k)
        if (i > 0) {
          innerIndices[offset] = col - 1;
          values[offset] = -1.0;
          offset++;
        }

        // Diagonal: (i, j, k)
        innerIndices[offset] = col;
        values[offset] = 6.0;
        offset++;

        // Right neighbor: (i + 1, j, k)
        if (i < N - 1) {
          innerIndices[offset] = col + 1;
          values[offset] = -1.0;
          offset++;
        }

        // Top neighbor: (i, j + 1, k)
        if (j < N - 1) {
          innerIndices[offset] = col + N;
          values[offset] = -1.0;
          offset++;
        }

        // Back neighbor: (i, j, k + 1)
        if (k < N - 1) {
          innerIndices[offset] = col + N2;
          values[offset] = -1.0;
          offset++;
        }
      }
    }
  }

  outerStarts[n] = offset;

  return {
    n,
    rows: n,
    cols: n,
    nnz,
    values,
    innerIndices,
    outerStarts,
    storageOrder: 0 // CSC
  };
}

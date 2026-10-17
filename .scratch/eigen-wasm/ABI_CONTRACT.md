# WebAssembly ABI Contract & Conventions

This document specifies the canonical application binary interface (ABI), memory conventions, error codes, and invariants for the Eigen WebAssembly build. It serves as the single source of truth for C++ routines exported in `wasm/eigen_wasm.cpp` and JavaScript callers/tests under `wasm/`.

---

## 1. Error Channel (`ComputationInfo`)

All routines computing a mathematical object return an `int` corresponding directly to `Eigen::ComputationInfo`:

| Value | Code | Meaning | Output Buffers |
|---|---|---|---|
| `0` | `Success` | Computation succeeded | Written with valid results |
| `1` | `NumericalIssue` | Non-positive definite, singular matrix, or pivot failure | **Untouched** |
| `2` | `NoConvergence` | Iterative solver did not converge within budget | **Untouched** |
| `3` | `InvalidInput` | Precondition violated (null pointer, non-square, dimension <= 0, dimension > 255, NaN/Inf) | **Untouched** |

### Output Buffer Invariant
Output buffers are **untouched unless the routine returns `Success`**. Callers can safely pass buffers pre-filled with sentinel values (`-4.4444444444444e-100`) to confirm that rejected calls leave memory completely unmodified.

---

## 2. Dimension Bounds & Constraints

- **Minimum dimension**: `1` (all dimensions must be strictly positive; `<= 0` returns `InvalidInput`).
- **Maximum dimension (Ceiling)**: `2048` (`kMaxDimension = 2048`).
  - Supported by `STACK_SIZE=16MB`, `INITIAL_MEMORY=128MB`, and `MAXIMUM_MEMORY=4GB`.
  - Dimension `> 2048` returns `InvalidInput` before any Eigen routine executes.
  - The module exports `int maxDimension()` returning this ceiling (2048).
- **Squareness**: Matrix inversion, LU solve, Cholesky, LDLT, Bunch-Kaufman, and eigensolvers require `rows == cols`. Rectangular input returns `InvalidInput`.
- **Symmetry**: Cholesky, LDLT, Bunch-Kaufman, and symmetric eigensolvers require |A[i,j] - A[j,i]| <= 1e-12 or relative difference <= 1e-6. Asymmetric input returns `InvalidInput`.

---

## 3. Memory & Pointer Management

1. **Row-Major Layout**: All matrices are passed and returned as contiguous row-major arrays of `double` (IEEE 754 64-bit float). Entry (i, j) of an M x N matrix is at index `i * N + j`.
2. **Caller Allocation**: Buffers are allocated in WASM memory by the caller via exported `_malloc` and released with `_free`.
3. **No Retained Heap Views**: `ALLOW_MEMORY_GROWTH` detaches typed-array views (e.g. `Module.HEAPF64`) upon memory expansion. Use `setValue` and `getValue` to access memory safely.
4. **Aliasing**: The 3x3 matrix multiplication routine `matMul3x3` supports `out` aliasing `a` or `b`. Other routines require non-overlapping buffers.

---

## 4. Exported Routines Reference

| Function | Signature (C / cwrap) | Output Layout |
|---|---|---|
| `matMul3x3` | `(a, b, out)` | 9 doubles (3x3 row-major) |
| `matMul` | `(a, b, rowsA, colsA, colsB, out)` -> `int` | rowsA * colsB doubles (rowsA x colsB row-major) |
| `determinant` | `(a, rows, cols, out)` -> `int` | 1 double |
| `solveLU` | `(a, b, n, out)` -> `int` | n doubles |
| `inv` | `(a, n, out)` -> `int` | n * n doubles (n x n row-major) |
| `cholesky` | `(a, n, l_out)` -> `int` | n * n doubles (lower triangular row-major) |
| `ldlt` | `(a, n, l_out, d_out, trans_out)` -> `int` | L: n * n doubles, D: n doubles, P: n ints |
| `bunchKaufman` | `(a, n, recon_out)` -> `int` | n * n doubles (reconstructed n x n matrix) |
| `qr` | `(a, rows, cols, q_out, r_out)` -> `int` | Q: rows * rows doubles, R: rows * cols doubles |
| `solveLeastSquares` | `(a, b, rows, cols, x_out)` -> `int` | cols doubles |
| `colPivQr` | `(a, rows, cols, q_out, r_out, perm_out, rank_out)` -> `int` | Q: rows * rows, R: rows * cols, P: cols ints, rank: 1 int |
| `rank` | `(a, rows, cols, rank_out)` -> `int` | rank: 1 int |
| `svd` | `(a, rows, cols, s_out, u_out, vt_out)` -> `int` | S: k doubles, U: rows * k doubles, V^T: k * cols doubles (k = min(rows, cols)) |
| `svdSingularValues` | `(a, rows, cols, s_out)` -> `int` | S: min(rows, cols) doubles |
| `bdcSvd` | `(a, rows, cols, s_out, u_out, vt_out)` -> `int` | Same as svd, optimized for large matrices |
| `symmetricEigen` | `(a, n, eivals_out, eivecs_out)` -> `int` | eigenvalues: n doubles, eigenvectors: n * n doubles (row-major) |
| `generalEigen` | `(a, n, re_vals, im_vals, re_vecs, im_vecs)` -> `int` | Real/imag parts: n values each, n * n vectors each |
| `generatePrescribedSingularValues` | `(out, rows, cols, s, s_len, seed)` -> `int` | rows * cols doubles (deterministic PRNG) |
| `maxDimension` | `()` -> `int` | Returns 255 |

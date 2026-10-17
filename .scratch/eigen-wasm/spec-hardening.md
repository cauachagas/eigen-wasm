# Spec: WASM Dense Routines Hardening and Missing Requirements

Status: ready-for-agent

## Problem Statement

Callers using the WebAssembly build of Eigen for dense linear algebra face contract violations, numerical risks, and missing capabilities identified in code reviews:
1. In factorization routines like QR and column-pivoted QR, returning an upper triangular factor R without zeroing its strictly lower triangle exposes uninitialized memory and non-deterministic results to the caller.
2. The error and validity contract is inconsistently applied: factorizations do not systematically check their underlying decomposition info status, and input matrices containing non-finite entries (NaN or Inf) are not rejected upfront, silently propagating invalid numbers or returning Success on corrupted calculations.
3. Callers who only require the matrix rank or singular values currently cannot compute them without invoking full factorizations and allocating unused orthogonal matrices.
4. Callers face API discrepancies between documented signatures and actual exports (for instance dimension parameters in matrix inversion and Cholesky), while numerical symmetry validation behaves inconsistently across different magnitude scales.

## Solution

Harden the exported WebAssembly dense routines against memory corruption and invalid input, align exported signatures with the canonical ABI contract, and introduce the missing rank reduction and spectrum-only routines.

Specifically:
- Ensure upper triangular factors in QR and ColPivQR always zero out the strictly lower triangle in caller-provided buffers before returning.
- Enforce strict input validation across all exported routines: reject null pointers, out-of-range dimensions, non-square shapes where required, and non-finite values (NaN / Inf) by returning InvalidInput without mutating output buffers.
- Systematically verify decomposition convergence and validity via info() before writing any output buffers.
- Correct symmetry tolerance checks to compare relative differences against the minimum magnitude of corresponding coefficients.
- Harmonize C++ exported signatures with the ABI contract.
- Provide a dedicated rank routine and singular-value-only extraction.
- Resolve repository cleanliness standards (clean diff check without trailing whitespace, and complete documentation of all exports in the module README).

## User Stories

1. As a WebAssembly caller, I want the QR factorization routine to guarantee that all entries below the main diagonal in R are strictly zero, so that downstream reconstruction and triangular operations are deterministic.
2. As a WebAssembly caller, I want the column-pivoted QR routine to guarantee that all entries below the main diagonal in R are strictly zero, so that permutation and rank operations do not read uninitialized memory.
3. As a WebAssembly caller, I want all exported routines to validate that input matrices and vectors contain only finite numbers (rejecting NaN and Inf), so that invalid numeric inputs immediately return InvalidInput rather than generating corrupted outputs.
4. As a WebAssembly caller, I want determinant calculation to immediately reject non-finite inputs with InvalidInput, so that NaNs do not silently return as a valid determinant under Success.
5. As a WebAssembly caller, I want QR and least-squares routines to verify decomposition status via info(), so that any internal failure returns NumericalIssue or InvalidInput rather than falsely claiming Success.
6. As a WebAssembly caller, I want solveLeastSquares to leave output buffers completely untouched if the computed solution contains non-finite entries, preserving the untouched-on-failure contract.
7. As a WebAssembly caller, I want matrix symmetry checks to compute relative tolerance with respect to the smaller magnitude between opposing entries, so that matrices with entries of vastly different scales are not spuriously accepted as symmetric.
8. As a WebAssembly caller, I want a dedicated rank routine, so that I can determine matrix rank directly without allocating and unpacking full QR factors.
9. As a WebAssembly caller, I want to compute singular values without allocating or computing U and V matrices, so that spectral analysis is fast and memory-efficient.
10. As a WebAssembly caller, I want exported function signatures for inv and cholesky to match the canonical ABI contract specification, so that runtime binding does not require mismatched parameter lists.
11. As a WebAssembly developer, I want all math operations in the C++ layer to use Eigen numext functions rather than std namespace equivalents, conforming to project coding standards.
12. As a WebAssembly developer, I want all test suites to share canonical test helpers and constants rather than duplicating allocation and reporting boilerplate.
13. As a WebAssembly developer, I want all files in the repository to be free of trailing whitespace and pass git diff --check cleanly.
14. As a WebAssembly developer, I want the module README to accurately list and document all exported routines and their contracts.

## Implementation Decisions

- **Triangular Factor Materialization**:
  In QR and ColPivHouseholderQR routines, R is materialized into an explicitly zero-initialized row-major matrix (e.g. `RowMajorMatrix::Zero(rows, cols)`) before copying the upper triangular view, or the lower triangle is explicitly set to 0.0 prior to writing out to caller memory.
- **Uniform Non-Finite Guarding**:
  All routines receiving input buffers will inspect elements for finitude (`allFinite()`) before executing any decomposition or evaluation. If any entry is NaN or infinite, the routine immediately returns `InvalidInput`.
- **Systematic Info Verification**:
  Every routine wrapping an Eigen solver or decomposition will inspect `solver.info()` and propagate failures as `NumericalIssue` or `NoConvergence` according to Eigen's ComputationInfo conventions.
- **Symmetry Checking Semantics**:
  The symmetry helper will evaluate whether $|A_{ij} - A_{ji}| <= \max(10^{-12}, \min(|A_{ij}|, |A_{ji}|) \times 10^{-6})$, using `numext::` helpers (`numext::abs`, `numext::mini`, `numext::maxi`).
- **Signature Harmonization**:
  Functions operating strictly on square matrices (`inv`, `cholesky`) will take dimension `n` instead of redundant `rows, cols`, matching `ABI_CONTRACT.md`. Test suites will be updated to reflect this unified ABI.
- **Standalone Rank and SVD Singular-Values-Only**:
  - Export `int rank(const double* a, int rows, int cols, int* rank_out)` using ColPivHouseholderQR with thin allocation.
  - Export `int svdSingularValues(const double* a, int rows, int cols, double* s_out)` with `Eigen::ComputeThinU | Eigen::ComputeThinV` disabled (or set to 0 / no vectors computed).
- **Standards and Hygiene**:
  - Replace `std::` math calls in `eigen_wasm.cpp` with `numext::`.
  - Strip trailing whitespace from `.scratch/eigen-wasm/retro.md` and `.scratch/eigen-wasm/review.md`.
  - Update `wasm/README.md` to document the full list of exported functions.
  - Refactor test files to import shared helpers from `test_helpers.js`.

## Testing Decisions

- **Testing Seam**:
  The single canonical testing seam is the Node.js WebAssembly bridge (`wasm/test_*.js`), which executes exported functions in compiled WASM memory, asserts returned ComputationInfo enum codes, and verifies output buffer values and untouched-buffer sentinels.
- **External Behavior Verification**:
  Tests will strictly assert observable external behavior:
  - Output buffers pre-filled with sentinels remain unmodified on all failure cases (null pointer, out-of-range dimension, non-square shape, non-finite input, singularity/numerical failure).
  - Strictly lower triangle of R in QR and ColPivQR tests is verified to contain exactly 0.0 for all entries where row index > column index.
  - Non-finite inputs (NaN, Inf) passed to determinant, LU, Cholesky, QR, LDLT, SVD, and eigensolvers return `InvalidInput` with untouched buffers.
  - Dedicated rank test verifies full-rank and rank-deficient matrices against known algebraic rank.
  - SVD singular-values-only test confirms correct descending singular values without requiring U/V buffers.

## Out of Scope

- Arbitrary-precision or custom scalar types (the WASM interface remains strictly IEEE 754 64-bit `double`).
- Multi-threading, Web Workers, or SIMD vector extensions beyond standard Wasm32.
- Modifying upstream Eigen core headers under `Eigen/` or `contrib/`.

## Further Notes

- The dimension ceiling remains fixed at 255 (`kMaxDimension = 255`) to prevent WebAssembly blocked LU panel memory traps.
- All exit codes and ComputationInfo enums remain unchanged: Success (0), NumericalIssue (1), NoConvergence (2), InvalidInput (3).

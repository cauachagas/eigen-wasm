# Specification: Dense Matrix Operations Completion for WebAssembly

## Problem Statement

Users and client applications compiling and running linear algebra workloads via WebAssembly currently encounter critical gaps in the dense matrix surface. While foundational factorizations (such as FullPivLU, Cholesky LLT, HouseholderQR, JacobiSVD, and Eigensolvers) are available, developers facing demanding numerical tasks are constrained by:
1. Significant performance bottlenecks when solving large linear systems or inverting matrices, because only the computationally expensive FullPivLU is exposed rather than the standard, cache-efficient PartialPivLU.
2. Inability to handle rank-deficient least-squares problems or compute robust Moore-Penrose pseudoinverses due to the lack of Complete Orthogonal Decomposition (COD).
3. Inefficiency when solving symmetric positive-definite systems or triangular systems, forcing users to route through general LU solvers rather than fast Cholesky or direct forward/back substitution.
4. Restriction of linear system solvers to single right-hand-side vectors, preventing batched solves (A * X = B for matrix B).
5. Lack of basic matrix transformations and reductions (such as matrix transposition, trace, and matrix norms) in WebAssembly, forcing client JavaScript code to implement slow or numerically naive operations.

## Solution

Complete the WebAssembly dense matrix operational surface by exporting the missing core routines in C++ with standard C linkage:
1. Fast linear system solvers and inversion using PartialPivLU (`solvePartialLU`, `invPartialLU`).
2. Complete Orthogonal Decomposition and Moore-Penrose pseudoinversion (`cod`, `pseudoInverse`).
3. Dedicated symmetric positive-definite solver (`solveCholesky`) and triangular substitution solvers (`solveTriangularLower`, `solveTriangularUpper`).
4. Matrix right-hand-side extensions for linear systems (`solveLUMatrix`, `solveLeastSquaresMatrix`).
5. Matrix transformations and reductions: in-memory transposition (`transpose`), trace (`trace`), and matrix norms (`matrixNorm` supporting Frobenius norm, 1-norm, and infinity-norm).

All additions preserve the established WebAssembly ABI: contiguous row-major IEEE 754 64-bit float buffers, explicit caller memory management, verbatim mapping of Eigen ComputationInfo error status, strict dimension checking up to the 2048 ceiling, and the untouched-output-buffer invariant on failure.

## User Stories

1. As a scientific web application developer, I want to solve large linear systems using partial-pivoting LU decomposition, so that system solves run with LAPACK-grade cache efficiency and higher throughput.
2. As a web developer, I want to invert invertible square matrices using PartialPivLU, so that inversion of large matrices does not suffer from the full-pivoting overhead.
3. As a robotics engineer running kinematics in the browser, I want to compute the Moore-Penrose pseudoinverse of rectangular or rank-deficient matrices via Complete Orthogonal Decomposition, so that I can compute minimum-norm solutions to underdetermined problems.
4. As a data analyst, I want to perform Complete Orthogonal Decomposition (COD) on arbitrary rectangular matrices, so that I can reliably determine rank, range, and null-space projections.
5. As an optimization researcher, I want to solve symmetric positive-definite systems directly via Cholesky factorization, so that I avoid the unnecessary overhead of general LU solvers.
6. As a numerical library consumer, I want to solve triangular linear systems via direct forward and backward substitution, so that intermediate stages of factorizations can be solved in O(n^2) operations.
7. As an engineer solving systems with multiple excitation vectors, I want to solve A * X = B where B is an n-by-k matrix, so that I can compute batch solutions in a single WebAssembly call.
8. As a statistician fitting multiple regression responses, I want to solve least-squares problems with multiple right-hand-side targets in matrix B, so that multiple response regressions execute in a single pass.
9. As a graphics and geometry programmer, I want to transpose dense matrices in WebAssembly memory, so that matrix orientations can be adjusted without round-tripping data across the JavaScript bridge.
10. As a physicist computing quantum states and invariant properties, I want to compute the trace of a square matrix, so that diagonal summations occur natively with high numerical accuracy.
11. As a numerical analyst verifying matrix conditioning, I want to compute the Frobenius norm of a matrix, so that overall matrix magnitude and residuals can be evaluated.
12. As an algorithm developer assessing stability bounds, I want to compute the matrix 1-norm (maximum absolute column sum), so that condition number estimators can be constructed.
13. As a control systems engineer checking stability margins, I want to compute the matrix infinity-norm (maximum absolute row sum), so that induced operator norms are calculated efficiently.
14. As a client developer, I want all newly exposed routines to validate dimension limits against the 2048 ceiling, so that out-of-bounds requests fail gracefully with InvalidInput instead of causing WebAssembly memory traps.
15. As a frontend developer managing application state, I want all newly exposed routines to leave caller-supplied output buffers untouched when an error or non-convergence occurs, so that sentinel verification and rollback guarantees remain intact.
16. As a TypeScript library author, I want all routine return codes to map verbatim to ComputationInfo (Success=0, NumericalIssue=1, NoConvergence=2, InvalidInput=3), so that error handling is consistent across the entire library API.
17. As an integration tester, I want newly exposed routines to be accompanied by automated Node.js test suites, so that regression testing can run continuously in CI gates.

## Implementation Decisions

- **Single Translation Unit & ABI Parity**: All new dense operations are integrated into the main WebAssembly export unit, preserving the C linkage interface (`extern "C"` and Emscripten export attributes) and row-major layout.
- **Error Channel & Invariants**:
  - Every routine returns an integer representing `Eigen::ComputationInfo`.
  - On any failure (`InvalidInput`, `NumericalIssue`, `NoConvergence`), output buffers are guaranteed to remain untouched.
  - All input matrices and vectors are checked for finiteness (`allFinite()`), null pointers, and dimensions within `[1, 2048]`.
- **Fast LU Routines**:
  - `solvePartialLU`: Uses `Eigen::PartialPivLU`. Checks invertibility or non-singularity before solving.
  - `invPartialLU`: Computes matrix inverse via `Eigen::PartialPivLU`.
- **Complete Orthogonal Decomposition (COD)**:
  - `cod`: Computes Complete Orthogonal Decomposition with rank revealing, producing full orthogonal Q, triangular/trapezoidal T, and orthogonal Z.
  - `pseudoInverse`: Computes the Moore-Penrose pseudoinverse using COD.
- **Specialized Solvers**:
  - `solveCholesky`: Resolves `A * x = b` for symmetric positive-definite systems using `Eigen::LLT`. Validates symmetry and positive-definiteness.
  - `solveTriangularLower` & `solveTriangularUpper`: Solves `L * x = b` or `U * x = b` using unit or non-unit triangular views directly.
- **Multiple Right-Hand-Side (RHS) Solvers**:
  - `solveLUMatrix`: Solves `A * X = B` for `n x n` matrix A and `n x nRHS` matrix B via `FullPivLU`.
  - `solveLeastSquaresMatrix`: Solves least-squares `min ||A * X - B||` for `rows x cols` matrix A and `rows x nRHS` matrix B via `HouseholderQR`.
- **Transformations and Reductions**:
  - `transpose`: Copies element (i, j) of an `r x c` matrix into element (j, i) of a `c x r` matrix in row-major layout.
  - `trace`: Sums diagonal entries of an `n x n` matrix into a caller-provided double.
  - `matrixNorm`: Accepts a norm selector (0 for Frobenius, 1 for 1-norm, 2 for infinity-norm) and writes the computed scalar norm into a double output buffer.
- **Scalar Type Precision**: Strict adherence to IEEE 754 64-bit `double`.

## Testing Decisions

- **Seam**: Testing will occur at the highest existing seam: invoking compiled WebAssembly routines from Node.js through the modularized module loader, exercising memory via `cwrap` and direct heap reads/writes.
- **Black-box Behavioral Testing**:
  - Tests verify mathematical correctness, residuals (`||A * x - b||`, `||A * A_pinv * A - A||`), analytical known values, and orthogonality.
  - Boundary condition tests verify dimension bounds: rejecting dimensions <= 0 and > 2048 with `InvalidInput`.
  - Invariant tests verify that pre-filled sentinel buffers remain byte-identical when a routine fails or encounters invalid input.
- **Prior Art**: Follows patterns established in existing test suites (`test_lu.js`, `test_cholesky.js`, `test_qr.js`, `test_helpers.js`).

## Out of Scope

- Single-precision float (`float`) or complex-number (`std::complex`) matrix operations.
- Sparse matrix solvers or iterative sparse methods.
- Sparse views, matrix expressions, or threading beyond WebAssembly single-threaded runtime.
- Browser UI bindings or WebWorker wrapper generation (delegated to application layer).

## Further Notes

- After implementation, a retrospective skill (`/retro`) will be executed to evaluate cycle outcomes, adherence to standards, and residual debt.
- All new routines must be documented in `wasm/README.md` and added to `.scratch/eigen-wasm/ABI_CONTRACT.md`.

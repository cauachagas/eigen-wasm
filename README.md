# Eigen WASM

WebAssembly build of Eigen's Core and Dense modules, compiled with Emscripten.

## Requirements

An activated emsdk. It bundles its own Python and Node, so no separate install is
needed. If installed locally at `/tmp/emsdk`:

```bash
source /tmp/emsdk/emsdk_env.sh
```

`build.sh` will also attempt to auto-source `/tmp/emsdk/emsdk_env.sh` if `em++` is not
found on `$PATH`.

## Build

Clone the repository with submodules:

```bash
git clone --recursive https://github.com/cauachagas/eigen-wasm.git
cd eigen-wasm
```

Build the WebAssembly module:

```bash
npm run build
# or: ./scripts/build.sh
```

Writes `build/eigen_wasm.js` and `build/eigen_wasm.wasm`. Both are gitignored;
`scripts/build.sh` regenerates them.

`scripts/build.sh` compiles with `-std=c++17` because Emscripten requires it. Eigen itself
is C++14 and needs no newer standard here.

It invokes `em++`, not `emcc`. `emcc` links no C++ runtime: the 3x3 product happens
to touch no libstdc++ symbol, but any Eigen decomposition needs
`__cxa_allocate_exception` and `std::bad_alloc` and fails to link with
`undefined symbol`.

## Test

Run all 18 test suites:

```bash
npm test
# or: for f in test/test_*.js; do node "$f"; done
```

Or individual test suites:

```bash
node test/test_matmul.js
node test/test_determinant.js
node test/test_matrix_ops.js
node test/test_lu.js
node test/test_partial_lu.js
node test/test_cholesky.js
node test/test_dense_solvers.js
node test/test_qr.js
node test/test_matrix_solvers.js
node test/test_svd.js
node test/test_eigen.js
node test/test_ldlt.js
node test/test_colpiv_qr.js
node test/test_cod.js
node test/test_bdc_svd.js
node test/test_general_eigen.js
```


Each exits 0 when every case passes and non-zero if any case fails, so each is usable
as a CI gate. A failing case does not stop the run: the suite reports every mismatch,
then exits non-zero at the end. Expected results are hand-computed literals rather
than values recomputed by the code under test.

Two of the cases in `test_matmul.js` pass `out` as an alias of `a` or `b`, which
`eigen_wasm.cpp` documents as allowed. That guarantee rests on Eigen evaluating the
product into a temporary before storing into `out`, so it is pinned by a test rather
than left as a comment.

`.github/workflows/ci.yml` runs both on GitHub Actions against the
`emscripten/emsdk` image, on any push or pull request to `main`. Eigen's own
`.gitlab-ci.yml` is untouched.

## API

The module exports 31 C routines declared with `EMSCRIPTEN_KEEPALIVE` and `extern "C"`:

```c
// System & Configuration
int  maxDimension();

// Matrix Multiplication & Basic Operations
void matMul3x3(const double* a, const double* b, double* out);
int  matMul(const double* a, const double* b, int rowsA, int colsA, int colsB, double* out);
int  transpose(const double* a, int rows, int cols, double* out);
int  trace(const double* a, int n, double* out);
int  matrixNorm(const double* a, int rows, int cols, int norm_type, double* out);

// Determinant, Inversion & Linear Systems
int  determinant(const double* a, int rows, int cols, double* out);
int  solveLU(const double* a, const double* b, int n, double* out);
int  solveLUMatrix(const double* a, const double* b, int n, int nrhs, double* out);
int  inv(const double* a, int n, double* out);
int  solvePartialLU(const double* a, const double* b, int n, double* out);
int  invPartialLU(const double* a, int n, double* out);
int  solveCholesky(const double* a, const double* b, int n, double* out);
int  solveTriangularLower(const double* l, const double* b, int n, int unit_diag, double* out);
int  solveTriangularUpper(const double* u, const double* b, int n, int unit_diag, double* out);
int  solveLeastSquares(const double* a, const double* b, int rows, int cols, double* x_out);
int  solveLeastSquaresMatrix(const double* a, const double* b, int rows, int cols, int nrhs, double* x_out);

// Factorizations & Decompositions
int  cholesky(const double* a, int n, double* out);
int  ldlt(const double* a, int n, double* l_out, double* d_out, int* trans_out);
int  bunchKaufman(const double* a, int n, double* recon_out);
int  qr(const double* a, int rows, int cols, double* q_out, double* r_out);
int  colPivQr(const double* a, int rows, int cols, double* q_out, double* r_out, int* perm_out, int* rank_out);
int  cod(const double* a, int rows, int cols, double* q_out, double* t_out, double* z_out, int* perm_out, int* rank_out);
int  rank(const double* a, int rows, int cols, int* rank_out);
int  pseudoInverse(const double* a, int rows, int cols, double* pinv_out);

// Singular Value Decomposition & Generation
int  svd(const double* a, int rows, int cols, double* s_out, double* u_out, double* vt_out);
int  svdSingularValues(const double* a, int rows, int cols, double* s_out);
int  bdcSvd(const double* a, int rows, int cols, double* s_out, double* u_out, double* vt_out);
int  generatePrescribedSingularValues(double* out, int rows, int cols, const double* s, int s_len, unsigned int seed);

// Eigensolvers
int  symmetricEigen(const double* a, int n, double* eigenvalues_out, double* eigenvectors_out);
int  generalEigen(const double* a, int n, double* real_eivals, double* imag_eivals, double* real_eivecs, double* imag_eivecs);
```

### Common Conventions and Contracts

1. **Memory Layout**: All matrices are laid out in contiguous row-major order: element `(i, j)` of a `rows x cols` matrix is located at index `cols * i + j`.
2. **Buffer Allocation**: Callers allocate buffers in WebAssembly memory via `Module._malloc(bytes)` and free them with `Module._free(ptr)`.
3. **Return Values**: Mathematical routines return an `int` corresponding verbatim to `Eigen::ComputationInfo`:
   - `0`: `Success` - computation succeeded, output buffers written.
   - `1`: `NumericalIssue` - singular matrix, non-positive definite, non-finite numerical result, or pivot failure.
   - `2`: `NoConvergence` - iterative decomposition did not converge within the iteration budget.
   - `3`: `InvalidInput` - precondition violation (null pointer, dimension <= 0, dimension > 2048, non-square where required, asymmetric where required, or non-finite input).
4. **Output Buffer Invariant**: **Output buffers are untouched unless the routine reports `Success`.** Every precondition is validated before results are written, so rejected calls leave memory completely unmodified. Callers can safely pass pre-filled sentinel buffers to verify contract compliance.
5. **Aliasing**: `matMul3x3` allows `out` to alias `a` or `b`. For all other routines, input and output buffers must not overlap.

### Exported Routines Reference

#### System & Configuration

- `maxDimension()`: Returns the dimension ceiling (`2048`).

#### Matrix Multiplication & Basic Operations

- `matMul3x3(a, b, out)`: Computes fixed 3x3 matrix product `out = a * b`. `a`, `b`, and `out` each point to 9 doubles in row-major order. `out` may alias `a` or `b`.
- `matMul(a, b, rowsA, colsA, colsB, out)`: Dynamic matrix multiplication `out = a * b`. `a` points to `rowsA * colsA` doubles, `b` to `colsA * colsB` doubles, and `out` to `rowsA * colsB` doubles (row-major). Returns `Success` (0) or `InvalidInput` (3).
- `transpose(a, rows, cols, out)`: Transpose of `rows x cols` matrix `a`, written to `out` (`cols * rows` doubles row-major). Returns `Success` or `InvalidInput`.
- `trace(a, n, out)`: Trace (sum of diagonal entries) of square `n x n` matrix `a`, written to `out` (1 double). Returns `Success` or `InvalidInput`.
- `matrixNorm(a, rows, cols, norm_type, out)`: Matrix norm of `rows x cols` matrix `a` (`norm_type`: 0 for Frobenius norm, 1 for 1-norm / maximum absolute column sum, 2 for Infinity-norm / maximum absolute row sum), written to `out` (1 double). Returns `Success` or `InvalidInput`.

#### Determinant, Inversion & Linear Systems

- `determinant(a, rows, cols, out)`: Determinant of square matrix `a` (`rows == cols`), written to `out` (1 double). A singular matrix returns `Success` with `0.0`. Returns `Success` or `InvalidInput`.
- `solveLU(a, b, n, out)`: Solves linear system `A * x = b` via FullPivLU for `n x n` matrix `a` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (singular or non-finite solution), or `InvalidInput`.
- `solveLUMatrix(a, b, n, nrhs, out)`: Solves multiple right-hand sides `A * X = B` via FullPivLU for `n x n` matrix `a` and `n x nrhs` matrix `b`. Solution written to `out` (`n * nrhs` doubles row-major). Returns `Success`, `NumericalIssue` (singular or non-finite solution), or `InvalidInput`.
- `inv(a, n, out)`: Matrix inverse of `n x n` matrix `a` via FullPivLU, written to `out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue` (singular or non-finite inverse), or `InvalidInput`.
- `solvePartialLU(a, b, n, out)`: Solves linear system `A * x = b` via PartialPivLU (with partial row pivoting) for `n x n` matrix `a` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (singular or non-finite solution), or `InvalidInput`.
- `invPartialLU(a, n, out)`: Matrix inverse of `n x n` matrix `a` via PartialPivLU, written to `out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue` (singular or non-finite inverse), or `InvalidInput`.
- `solveCholesky(a, b, n, out)`: Solves linear system `A * x = b` via LLT Cholesky factorization for symmetric positive-definite `n x n` matrix `a` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (non-positive-definite or non-finite solution), or `InvalidInput`.
- `solveTriangularLower(l, b, n, unit_diag, out)`: Solves lower triangular system `L * x = b` (`unit_diag = 0` for explicit diagonal, `1` for unit diagonal with assumed 1s) for `n x n` matrix `l` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (singular/zero diagonal or non-finite), or `InvalidInput`.
- `solveTriangularUpper(u, b, n, unit_diag, out)`: Solves upper triangular system `U * x = b` (`unit_diag = 0` for explicit diagonal, `1` for unit diagonal with assumed 1s) for `n x n` matrix `u` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (singular/zero diagonal or non-finite), or `InvalidInput`.
- `solveLeastSquares(a, b, rows, cols, x_out)`: Solves least-squares problem minimizing `||A * x - b||` via HouseholderQR for `rows x cols` matrix `a` and `rows`-vector `b`. Solution written to `x_out` (`cols` doubles). Returns `Success`, `NumericalIssue` (non-finite solution), or `InvalidInput`.
- `solveLeastSquaresMatrix(a, b, rows, cols, nrhs, x_out)`: Solves multiple right-hand sides least-squares problem minimizing `||A * X - B||` via HouseholderQR for `rows x cols` matrix `a` and `rows x nrhs` matrix `b`. Solution written to `x_out` (`cols * nrhs` doubles row-major). Returns `Success`, `NumericalIssue` (non-finite solution), or `InvalidInput`.

#### Factorizations & Decompositions

- `cholesky(a, n, out)`: LLT Cholesky factorization of symmetric positive-definite `n x n` matrix `a`. Writes lower-triangular factor `L` to `out` (`n * n` doubles row-major). Input must satisfy symmetry tolerance (`|A[i,j] - A[j,i]| <= max(1e-12, min(|A[i,j]|, |A[j,i]|) * 1e-6)`). Returns `Success`, `NumericalIssue` (non-positive-definite), or `InvalidInput`.
- `ldlt(a, n, l_out, d_out, trans_out)`: Robust LDLT decomposition for symmetric positive semi-definite `n x n` matrix `a` (`P^T * A * P = L * D * L^T`). `l_out` receives `n * n` doubles (unit lower triangular), `d_out` receives `n` doubles (diagonal vector D), and `trans_out` receives `n` integers (transposition indices). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `bunchKaufman(a, n, recon_out)`: Bunch-Kaufman decomposition for symmetric indefinite `n x n` matrix `a`. Reconstructed matrix written to `recon_out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `qr(a, rows, cols, q_out, r_out)`: Householder QR factorization (`A = Q * R`). Full orthogonal `Q` written to `q_out` (`rows * rows` doubles row-major); upper-triangular `R` written to `r_out` (`rows * cols` doubles row-major, lower triangle explicitly zeroed). Returns `Success` or `InvalidInput`.
- `colPivQr(a, rows, cols, q_out, r_out, perm_out, rank_out)`: Column-pivoting Householder QR (`A * P = Q * R`) with rank detection. Full `Q` written to `q_out` (`rows * rows` doubles), upper-triangular `R` written to `r_out` (`rows * cols` doubles, lower triangle zeroed), column permutation indices written to `perm_out` (`cols` ints), numerical rank written to `rank_out` (1 int). Returns `Success` or `InvalidInput`.
- `cod(a, rows, cols, q_out, t_out, z_out, perm_out, rank_out)`: Complete Orthogonal Decomposition (`A * P = Q * [T 0] * Z`) with complete rank revealing. Full `Q` written to `q_out` (`rows * rows` doubles), upper-trapezoidal `T` written to `t_out` (`rows * cols` doubles), full `Z` written to `z_out` (`cols * cols` doubles), column permutation indices written to `perm_out` (`cols` ints), numerical rank written to `rank_out` (1 int). Returns `Success` or `InvalidInput`.
- `rank(a, rows, cols, rank_out)`: Standalone matrix rank computation via ColPivHouseholderQR. Numerical rank written to `rank_out` (1 int). Returns `Success` or `InvalidInput`.
- `pseudoInverse(a, rows, cols, pinv_out)`: Moore-Penrose pseudoinverse via CompleteOrthogonalDecomposition for `rows x cols` matrix `a`. Pseudoinverse written to `pinv_out` (`cols * rows` doubles row-major). Returns `Success` or `InvalidInput`.

#### Singular Value Decomposition & Generation

- `svd(a, rows, cols, s_out, u_out, vt_out)`: Thin singular value decomposition via JacobiSVD. Let `k = min(rows, cols)`. Singular values written to `s_out` (`k` doubles in descending order), thin `U` written to `u_out` (`rows * k` doubles), and thin `V^T` written to `vt_out` (`k * cols` doubles). Returns `Success` or `InvalidInput`.
- `svdSingularValues(a, rows, cols, s_out)`: Computes only singular values via JacobiSVD without computing unitary matrices `U` and `V`. Written to `s_out` (`min(rows, cols)` doubles). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `bdcSvd(a, rows, cols, s_out, u_out, vt_out)`: Thin SVD via bidiagonal divide and conquer (`BDCSVD`), optimized for large matrices (`k = min(rows, cols)`). Layout identical to `svd`. Returns `Success` or `InvalidInput`.
- `generatePrescribedSingularValues(out, rows, cols, s, s_len, seed)`: Deterministic matrix generator constructing a `rows x cols` matrix with prescribed singular values `s` (`s_len >= min(rows, cols)`) using an explicit platform-independent linear congruential generator and Gram-Schmidt orthogonalization. Written to `out` (`rows * cols` doubles row-major). Returns `Success` or `InvalidInput`.

#### Eigensolvers

- `symmetricEigen(a, n, eigenvalues_out, eigenvectors_out)`: Eigendecomposition of symmetric `n x n` matrix `a` via SelfAdjointEigenSolver. Eigenvalues in ascending order written to `eigenvalues_out` (`n` doubles), column eigenvectors written to `eigenvectors_out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `generalEigen(a, n, real_eivals, imag_eivals, real_eivecs, imag_eivecs)`: General eigensolver for real non-symmetric `n x n` matrices via RealSchur (`EigenSolver`). Real and imaginary parts of eigenvalues written to `real_eivals` and `imag_eivals` (`n` doubles each); real and imaginary parts of eigenvectors written to `real_eivecs` and `imag_eivecs` (`n * n` doubles each in row-major). Returns `Success`, `NoConvergence`, `NumericalIssue`, or `InvalidInput`.

### Dimension ceiling: 2048

The WebAssembly module enforces a canonical dimension ceiling of 2048 (`kMaxDimension = 2048`),
supported by `-s STACK_SIZE=16MB`, `-s INITIAL_MEMORY=128MB`, and `-s MAXIMUM_MEMORY=4GB` with dynamic
growth.

At dimension 2048, a matrix of double-precision numbers occupies 32 MB, and routines compute stably
and deterministically without memory traps. Dimensions exceeding 2048 return `InvalidInput` (3) before
any memory is allocated or written, preserving the untouched-buffer invariant.

Because single-threaded operations at N = 2048 can require several seconds (e.g. iterative eigensolvers
or singular value decompositions), frontend applications should run heavy dense computations in Web Workers
rather than on the browser's UI thread to prevent interface freezing.

### Worked example

The module is `MODULARIZE`d and exported as `EigenWasmModule`, with `_malloc`,
`_free`, and the `ccall`, `cwrap`, `setValue`, and `getValue` runtime methods
available. [`example.js`](example.js) is a complete worked example; run it with
`node wasm/example.js`:

```js
import EigenWasmModule from './wasm/eigen_wasm.js';

const Module = await EigenWasmModule();
const matMul3x3 = Module.cwrap('matMul3x3', null, ['number', 'number', 'number']);

const a = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const b = [9, 8, 7, 6, 5, 4, 3, 2, 1];

const aPtr = Module._malloc(72);
const bPtr = Module._malloc(72);
const outPtr = Module._malloc(72);
for (let i = 0; i < 9; i++) {
  Module.setValue(aPtr + i * 8, a[i], 'double');
  Module.setValue(bPtr + i * 8, b[i], 'double');
}

matMul3x3(aPtr, bPtr, outPtr);

const result = [];
for (let i = 0; i < 9; i++) result.push(Module.getValue(outPtr + i * 8, 'double'));

Module._free(aPtr);
Module._free(bPtr);
Module._free(outPtr);

console.log(result);   // [30,24,18,84,69,54,138,114,90]
```

`test_matmul.js` imports `multiply3x3` from `example.js` and runs it, so this code is
executed rather than only read. It has rotted before: the version that lacked the
`_free` calls looked fine and leaked on every call.

Use `setValue` and `getValue` rather than a `Module.HEAPF64` view. The build sets
`ALLOW_MEMORY_GROWTH`, which detaches typed-array views when the heap grows, so a
retained view silently reads stale memory.

Free every buffer once you are done with it. Because the heap may grow, leaking is
not bounded by anything: a call per frame without `_free` ends in a killed tab.

## Files

| File | Purpose |
|---|---|
| `build.sh` | `em++` invocation and output paths |
| `eigen_wasm.cpp` | `matMul3x3`, `matMul`, `transpose`, `trace`, `matrixNorm`, `determinant`, `solveLU`, `solveLUMatrix`, `inv`, `solvePartialLU`, `invPartialLU`, `cholesky`, `solveCholesky`, `solveTriangularLower`, `solveTriangularUpper`, `qr`, `solveLeastSquares`, `solveLeastSquaresMatrix`, `ldlt`, `bunchKaufman`, `colPivQr`, `rank`, `cod`, `pseudoInverse`, `svd`, `svdSingularValues`, `bdcSvd`, `generatePrescribedSingularValues`, `symmetricEigen`, `generalEigen`, `maxDimension` |
| `example.js` | Worked example; imported and run by the tests |
| `test_helpers.js` | Shared test assertions, error constants, buffer helpers, and sentinels |
| `test_matmul.js` | Table-driven tests over `matMul3x3` and `matMul` |
| `test_determinant.js` | Value, contract and ceiling tests over `determinant` |
| `test_matrix_ops.js` | Transpose, trace, and matrix norm tests over `transpose`, `trace`, `matrixNorm` |
| `test_lu.js` | Residual, singularity, and contract tests over `solveLU` and `inv` |
| `test_partial_lu.js` | Residual, singularity, and contract tests over `solvePartialLU` and `invPartialLU` |
| `test_cholesky.js` | Residual, symmetry, and positive-definiteness tests over `cholesky` |
| `test_dense_solvers.js` | Cholesky solve and triangular solver tests over `solveCholesky`, `solveTriangularLower`, `solveTriangularUpper` |
| `test_qr.js` | Factorization, residual, least squares, and orthogonality tests over `qr` and `solveLeastSquares` |
| `test_matrix_solvers.js` | Multiple RHS linear solver tests over `solveLUMatrix` and `solveLeastSquaresMatrix` |
| `test_cod.js` | Complete Orthogonal Decomposition and pseudoinverse tests over `cod` and `pseudoInverse` |
| `test_svd.js` | Singular value, reconstruction, and non-finite tests over `svd` |
| `test_eigen.js` | Analytical, eigenvector residual, and symmetry tests over `symmetricEigen` |
| `test_ldlt.js` | Positive semidefinite, residual, and symmetry tests over `ldlt` and `bunchKaufman` |
| `test_colpiv_qr.js` | Rank detection, column permutation, and deterministic matrix generation tests over `colPivQr` and `generatePrescribedSingularValues` |
| `test_bdc_svd.js` | BDCSVD large matrix decomposition and non-finite input tests over `bdcSvd` |
| `test_general_eigen.js` | General eigensolver, complex conjugate pairs, and convergence tests over `generalEigen` |

For the complete ABI specifications, error contracts, and dimension ceilings, see `.scratch/eigen-wasm/ABI_CONTRACT.md`.


`wasm/` is the only local addition to this fork. `Eigen/`, `test/`, `ci/` and `.gitlab-ci.yml` are frozen upstream code, so the Eigen build system does not know this directory exists and the tests here run through GitHub Actions instead of `ctest`.

`AGENTS.md` and the guides under `.agents/` govern this directory as they do the rest of the repository. This README adds the WebAssembly detail: where the two disagree, `AGENTS.md` wins.

`build.sh` honours `SRC` and `OUT` from the environment; unset, it compiles
`eigen_wasm.cpp` to `eigen_wasm.js` beside itself. The compiler is not
configurable: it is always `em++`.

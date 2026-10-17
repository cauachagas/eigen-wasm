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

```bash
./wasm/build.sh
```

Writes `wasm/eigen_wasm.js` and `wasm/eigen_wasm.wasm`. Both are gitignored;
`build.sh` regenerates them. The script resolves paths from its own location, so
it can be run from anywhere.

`build.sh` compiles with `-std=c++17` because Emscripten requires it. Eigen itself
is C++14 and needs no newer standard here.

It invokes `em++`, not `emcc`. `emcc` links no C++ runtime: the 3x3 product happens
to touch no libstdc++ symbol, but any Eigen decomposition needs
`__cxa_allocate_exception` and `std::bad_alloc` and fails to link with
`undefined symbol`.

## Test

```bash
node wasm/test_matmul.js
node wasm/test_determinant.js
node wasm/test_lu.js
node wasm/test_cholesky.js
node wasm/test_qr.js
node wasm/test_svd.js
node wasm/test_eigen.js
node wasm/test_ldlt.js
node wasm/test_colpiv_qr.js
node wasm/test_bdc_svd.js
node wasm/test_general_eigen.js
```

Or run all test suites in one go:

```bash
for f in wasm/test_*.js; do node "$f"; done
```


Each exits 0 when every case passes and non-zero if any case fails, so each is usable
as a CI gate. A failing case does not stop the run: the suite reports every mismatch,
then exits non-zero at the end. Expected results are hand-computed literals rather
than values recomputed by the code under test.

Two of the cases in `test_matmul.js` pass `out` as an alias of `a` or `b`, which
`eigen_wasm.cpp` documents as allowed. That guarantee rests on Eigen evaluating the
product into a temporary before storing into `out`, so it is pinned by a test rather
than left as a comment.

`.github/workflows/wasm.yml` runs both on GitHub Actions against the
`emscripten/emsdk` image, on any change under `wasm/` or `Eigen/`. Eigen's own
`.gitlab-ci.yml` is untouched.

## API

The module exports 19 C routines declared with `EMSCRIPTEN_KEEPALIVE` and `extern "C"`:

```c
// System & Configuration
int  maxDimension();

// Matrix Multiplication
void matMul3x3(const double* a, const double* b, double* out);
int  matMul(const double* a, const double* b, int rowsA, int colsA, int colsB, double* out);

// Determinant, Inversion & Linear Systems
int  determinant(const double* a, int rows, int cols, double* out);
int  solveLU(const double* a, const double* b, int n, double* out);
int  inv(const double* a, int n, double* out);
int  solveLeastSquares(const double* a, const double* b, int rows, int cols, double* x_out);

// Factorizations & Decompositions
int  cholesky(const double* a, int n, double* out);
int  ldlt(const double* a, int n, double* l_out, double* d_out, int* trans_out);
int  bunchKaufman(const double* a, int n, double* recon_out);
int  qr(const double* a, int rows, int cols, double* q_out, double* r_out);
int  colPivQr(const double* a, int rows, int cols, double* q_out, double* r_out, int* perm_out, int* rank_out);
int  rank(const double* a, int rows, int cols, int* rank_out);

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
   - `3`: `InvalidInput` - precondition violation (null pointer, dimension <= 0, dimension > 255, non-square where required, asymmetric where required, or non-finite input).
4. **Output Buffer Invariant**: **Output buffers are untouched unless the routine reports `Success`.** Every precondition is validated before results are written, so rejected calls leave memory completely unmodified. Callers can safely pass pre-filled sentinel buffers to verify contract compliance.
5. **Aliasing**: `matMul3x3` allows `out` to alias `a` or `b`. For all other routines, input and output buffers must not overlap.

### Exported Routines Reference

#### System & Configuration

- `maxDimension()`: Returns the dimension ceiling (`255`).

#### Matrix Multiplication

- `matMul3x3(a, b, out)`: Computes fixed 3x3 matrix product `out = a * b`. `a`, `b`, and `out` each point to 9 doubles in row-major order. `out` may alias `a` or `b`.
- `matMul(a, b, rowsA, colsA, colsB, out)`: Dynamic matrix multiplication `out = a * b`. `a` points to `rowsA * colsA` doubles, `b` to `colsA * colsB` doubles, and `out` to `rowsA * colsB` doubles (row-major). Returns `Success` (0) or `InvalidInput` (3).

#### Determinant, Inversion & Linear Systems

- `determinant(a, rows, cols, out)`: Determinant of square matrix `a` (`rows == cols`), written to `out` (1 double). A singular matrix returns `Success` with `0.0`. Returns `Success` or `InvalidInput`.
- `solveLU(a, b, n, out)`: Solves linear system `A * x = b` via FullPivLU for `n x n` matrix `a` and `n`-vector `b`. Solution written to `out` (`n` doubles). Returns `Success`, `NumericalIssue` (singular or non-finite solution), or `InvalidInput`.
- `inv(a, n, out)`: Matrix inverse of `n x n` matrix `a` via FullPivLU, written to `out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue` (singular or non-finite inverse), or `InvalidInput`.
- `solveLeastSquares(a, b, rows, cols, x_out)`: Solves least-squares problem minimizing `||A * x - b||` via HouseholderQR for `rows x cols` matrix `a` and `rows`-vector `b`. Solution written to `x_out` (`cols` doubles). Returns `Success`, `NumericalIssue` (non-finite solution), or `InvalidInput`.

#### Factorizations & Decompositions

- `cholesky(a, n, out)`: LLT Cholesky factorization of symmetric positive-definite `n x n` matrix `a`. Writes lower-triangular factor `L` to `out` (`n * n` doubles row-major). Input must satisfy symmetry tolerance (`|A[i,j] - A[j,i]| <= max(1e-12, min(|A[i,j]|, |A[j,i]|) * 1e-6)`). Returns `Success`, `NumericalIssue` (non-positive-definite), or `InvalidInput`.
- `ldlt(a, n, l_out, d_out, trans_out)`: Robust LDLT decomposition for symmetric positive semi-definite `n x n` matrix `a` (`P^T * A * P = L * D * L^T`). `l_out` receives `n * n` doubles (unit lower triangular), `d_out` receives `n` doubles (diagonal vector D), and `trans_out` receives `n` integers (transposition indices). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `bunchKaufman(a, n, recon_out)`: Bunch-Kaufman decomposition for symmetric indefinite `n x n` matrix `a`. Reconstructed matrix written to `recon_out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `qr(a, rows, cols, q_out, r_out)`: Householder QR factorization (`A = Q * R`). Full orthogonal `Q` written to `q_out` (`rows * rows` doubles row-major); upper-triangular `R` written to `r_out` (`rows * cols` doubles row-major, lower triangle explicitly zeroed). Returns `Success` or `InvalidInput`.
- `colPivQr(a, rows, cols, q_out, r_out, perm_out, rank_out)`: Column-pivoting Householder QR (`A * P = Q * R`) with rank detection. Full `Q` written to `q_out` (`rows * rows` doubles), upper-triangular `R` written to `r_out` (`rows * cols` doubles, lower triangle zeroed), column permutation indices written to `perm_out` (`cols` ints), numerical rank written to `rank_out` (1 int). Returns `Success` or `InvalidInput`.
- `rank(a, rows, cols, rank_out)`: Standalone matrix rank computation via ColPivHouseholderQR. Numerical rank written to `rank_out` (1 int). Returns `Success` or `InvalidInput`.

#### Singular Value Decomposition & Generation

- `svd(a, rows, cols, s_out, u_out, vt_out)`: Thin singular value decomposition via JacobiSVD. Let `k = min(rows, cols)`. Singular values written to `s_out` (`k` doubles in descending order), thin `U` written to `u_out` (`rows * k` doubles), and thin `V^T` written to `vt_out` (`k * cols` doubles). Returns `Success` or `InvalidInput`.
- `svdSingularValues(a, rows, cols, s_out)`: Computes only singular values via JacobiSVD without computing unitary matrices `U` and `V`. Written to `s_out` (`min(rows, cols)` doubles). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `bdcSvd(a, rows, cols, s_out, u_out, vt_out)`: Thin SVD via bidiagonal divide and conquer (`BDCSVD`), optimized for large matrices (`k = min(rows, cols)`). Layout identical to `svd`. Returns `Success` or `InvalidInput`.
- `generatePrescribedSingularValues(out, rows, cols, s, s_len, seed)`: Deterministic matrix generator constructing a `rows x cols` matrix with prescribed singular values `s` (`s_len >= min(rows, cols)`) using an explicit platform-independent linear congruential generator and Gram-Schmidt orthogonalization. Written to `out` (`rows * cols` doubles row-major). Returns `Success` or `InvalidInput`.

#### Eigensolvers

- `symmetricEigen(a, n, eigenvalues_out, eigenvectors_out)`: Eigendecomposition of symmetric `n x n` matrix `a` via SelfAdjointEigenSolver. Eigenvalues in ascending order written to `eigenvalues_out` (`n` doubles), column eigenvectors written to `eigenvectors_out` (`n * n` doubles row-major). Returns `Success`, `NumericalIssue`, or `InvalidInput`.
- `generalEigen(a, n, real_eivals, imag_eivals, real_eivecs, imag_eivecs)`: General eigensolver for real non-symmetric `n x n` matrices via RealSchur (`EigenSolver`). Real and imaginary parts of eigenvalues written to `real_eivals` and `imag_eivals` (`n` doubles each); real and imaginary parts of eigenvectors written to `real_eivecs` and `imag_eivecs` (`n * n` doubles each in row-major). Returns `Success`, `NoConvergence`, `NumericalIssue`, or `InvalidInput`.

### Dimension ceiling: 255, not 320

The Eigen test suite's `EIGEN_TEST_MAX_SIZE` is 320, and this module does not reach it.
At dimension 256 and above, the blocked LU behind `MatrixBase::determinant()` raises its
block size from 16 to 32 and its nested panel update reads out of bounds, which traps
the WASM instance: the module dies with `memory access out of bounds` and no return
value, rather than returning anything a caller could inspect.

The boundary is sharp and reproducible. `blocked_lu` sizes its blocks as
`clamp(((size / 8) / 16) * 16, 8, 256)`, which is 16 for every size below 256 and 32 at
256, and the trap begins exactly there. Measured on this build: 255 succeeds and 256
traps, for every matrix shape tried (zeros, ones, diagonal, bidiagonal, random,
large-magnitude), for `MatrixBase::determinant()`, `PartialPivLU`, and `FullPivLU`, and
for row-major and column-major input, at `-O0`, `-O1`, `-O2`, `-O3`, `-Os`, and `-Oz`.
It is not fixed by `-fsanitize=address`, nor by raising `INITIAL_MEMORY` or
`STACK_SIZE`, nor by setting `EIGEN_GEMM_TO_COEFFBASED_THRESHOLD`.

`Eigen/` is frozen upstream, so the fix is not in this module. Guarding the dimension
is what keeps the failure a returned `InvalidInput` instead of a dead module, and
`test_determinant.js` asserts both sides of the boundary: 255 computes, and 256 and 320
are rejected. Every later dense routine inherits this ceiling and the trap behind it;
see `.scratch/eigen-wasm/spec-dense.md`.

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
| `eigen_wasm.cpp` | `matMul3x3`, `matMul`, `determinant`, `solveLU`, `inv`, `cholesky`, `qr`, `solveLeastSquares`, `svd`, `svdSingularValues`, `symmetricEigen`, `ldlt`, `bunchKaufman`, `colPivQr`, `rank`, `generatePrescribedSingularValues`, `bdcSvd`, `generalEigen`, `maxDimension` |
| `example.js` | Worked example; imported and run by the tests |
| `test_helpers.js` | Shared test assertions, error constants, buffer helpers, and sentinels |
| `test_matmul.js` | Table-driven tests over `matMul3x3` |
| `test_determinant.js` | Value, contract and ceiling tests over `determinant` |
| `test_lu.js` | Residual, singularity, and contract tests over `solveLU` and `inv` |
| `test_cholesky.js` | Residual, symmetry, and positive-definiteness tests over `cholesky` |
| `test_qr.js` | Factorization, residual, least squares, and orthogonality tests over `qr` and `solveLeastSquares` |
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

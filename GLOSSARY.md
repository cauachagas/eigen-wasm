# Glossary

Terms for this repository. The Eigen code under `Eigen/`, `contrib/Eigen/`, `unsupported/Eigen/`
and `test/` is frozen upstream and keeps its own vocabulary; the terms below describe the WebAssembly
build under `wasm/`, which is this fork's only addition. Where a term exists in both, the term here
wins for work under `wasm/`.

## Toolchain

**Eigen WASM**: The WebAssembly build of Eigen's C++ headers, compiled with Emscripten. Built as a
single translation unit under `wasm/`, not as part of the Eigen CMake project.

**Emscripten**: The toolchain that compiles the C++ translation unit to WebAssembly plus a JavaScript
loader. Invoked as `em++`, never as `emcc`.

**Upstream**: `gitlab.com/libeigen/eigen`, tracked as the `upstream` remote. Its programming code is
read and never written. Its accessory files, such as `AGENTS.md`, are overlaid by this fork where they
disagree. `origin` is this fork, `cauachagas/eigen-wasm`, and it is where changes are made.

**Frozen code**: The programming code under `Eigen/`, `contrib/Eigen/`, `unsupported/Eigen/` and
`test/`. Never edited. Everything else, including the guides and this glossary, belongs to the fork.

## Module surface

**Dense routine**: One exported function computing one mathematical object, taking a matrix or vector
in WASM memory and writing its result into caller-provided buffers. Named for the object it produces,
not for the Eigen class it uses.

**Factorization**: A decomposition that may fail to exist. Cholesky of a matrix that is not positive
definite produces no result, and the contract must say so.

**Solution**: The vector or matrix x satisfying `A x = b`. Distinct from a factorization because it has
its own failure condition: a singular A has no unique solution.

**Spectral decomposition**: A factorization producing both values and vectors. Singular values with U
and V for SVD; eigenvalues with eigenvectors for the eigensolvers.

**Complete Orthogonal Decomposition**: A rank-revealing factorization `A * P = Q * [T 0] * Z` where Q
and Z are orthogonal and T is upper triangular/trapezoidal, used for rank-deficient least-squares and
robust Moore-Penrose pseudoinversion.

**PartialPivLU**: A high-performance LU factorization with partial row pivoting (equivalent to LAPACK DGETRF),
computing `P * A = L * U` in O(n^3) with cache locality, distinct from the slower FullPivLU.

**Pseudoinverse**: The Moore-Penrose pseudoinverse `A^+` satisfying the four Penrose equations, computed
in WASM via Complete Orthogonal Decomposition.

**Reduction**: A computation whose output is a scalar or a short vector, such as determinant, trace, or norm.
Cannot fail the way a factorization can.

## Contract

**ComputationInfo**: Eigen's enum reporting whether a decomposition succeeded. Four values: `Success`,
`NumericalIssue`, `NoConvergence`, `InvalidInput`. The WASM surface exposes this enum rather than
inventing its own, so a failure a caller can see is the failure the Eigen test suite already asserts on.

**matMul3x3**: Exported function computing `out = a * b` for row-major 3x3 matrices passed as three
`double` pointers.

**determinant**: Exported function computing the determinant of a row-major `rows`-by-`cols` matrix
into a caller-allocated `double`, taking the dimensions as parameters and returning `int` carrying
`ComputationInfo` verbatim. Rejects a null pointer, a zero or negative dimension, a non-square
matrix, and a dimension above 2048. A singular matrix is a determinant of zero, not a failure, so it
reports `Success`.

**Success**: The `ComputationInfo` value meaning the computation ran and its output buffer holds the
result. Value `0`, and the value the WASM surface returns unchanged as a routine's `int` return.

**NumericalIssue**: The `ComputationInfo` value meaning the computation ran but the result is not
trustworthy. Value `1`. Reported by Cholesky for a matrix that is not positive definite.

**NoConvergence**: The `ComputationInfo` value meaning an iterative computation exhausted its budget.
Value `2`.

**InvalidInput**: The `ComputationInfo` value meaning the input was rejected before any attempt was
made, as distinct from an attempt that failed. Value `3`. Reported by the SVD routines for non-finite
input, and by every WASM dense routine whose own precondition checks reject a call. A routine that
returns it wrote to no output buffer.

**Row-major**: Memory layout where element (i, j) lives at index `rows * i + j`.

**Dimension ceiling**: The largest matrix dimension a WASM dense routine accepts, currently 2048.
Supported by 16 MB stack allocation and dynamic memory growth up to 4 GB in Emscripten. Dimensions
above 2048 return `InvalidInput` before any allocation or computation begins.

**Contract bug**: A defect in an exported routine where observable behavior breaks the published
`ABI_CONTRACT.md`, including uninitialized buffer memory, returning `Success` for non-converged or
failed factorizations, overwriting buffers on failure, or deviating from canonical function signatures.

**Untouched invariant**: The contract guarantee that caller-supplied output buffers are completely
unmodified unless the routine returns `Success`. Any failure—including `InvalidInput`, `NumericalIssue`,
or `NoConvergence`—must leave pre-existing buffer contents (e.g. sentinels) intact.

## Verification

**Residual**: For a claimed solution or factorization, the norm of the difference between the claimed
result and the result re-derived from it, such as `||L Lᵀ - A||` or `||A x - b||`. The verification
available when no independent expected value exists.

**Round-trip check**: Verifying a factorization by re-deriving the input from its factors, such as
checking `L Lᵀ == A`. How the Eigen suite verifies LU and Cholesky, since neither has a table of
expected values.

**Independent expected value**: A result constructed in advance, so that a test compares against a
number no part of the code under test produced. Exists upstream for the spectral routines and not for
LU or Cholesky.

## Emscripten flags

**EXPORT_ES6**: Emscripten flag for ES module output.

**MODULARIZE**: Emscripten flag making the module a factory function rather than a global.

**ALLOW_MEMORY_GROWTH**: Emscripten flag permitting the heap to grow at runtime. It detaches typed-array
views of the heap when it does, which is why memory is read and written with `setValue` and `getValue`
rather than through a retained `HEAPF64` view.

## Sparse module

**Sparse routine**: One exported function computing an operation on or between sparse matrices, accepting
compressed storage buffers or coordinate triplets and writing results into caller-provided buffers.

**Compressed Sparse Column (CSC)**: Standard 3-buffer sparse representation (`values`, `innerIndices`,
`outerStarts`) where values and row indices are contiguous per column. Default storage format in Eigen.

**Compressed Sparse Row (CSR)**: 3-buffer sparse representation (`values`, `innerIndices`, `outerStarts`)
where values and column indices are contiguous per row.

**Triplet (COO)**: Coordinate list format represented as three parallel arrays (`rowIndices`, `colIndices`,
`values`) used as the standard entry point for matrix assembly before compression.

**SpMV**: Sparse Matrix-Vector multiplication (`y = A * x`), evaluating a sparse matrix multiplied by a dense
vector into a dense output vector.

**SpMM**: Sparse Matrix-Matrix multiplication, covering both sparse-dense product (`C = A * B` with B and C dense)
and sparse-sparse product (`C = A * B`).

**Two-pass sparse allocation**: Pattern where a query function first computes the exact non-zero count
(`outNnz`) of a variable-sized sparse result, enabling the caller to allocate buffers of exact size via
`Module._malloc` before executing the computation.

**SimplicialLDLT**: Direct sparse Cholesky solver computing `A = L * D * L^T` with Approximate Minimum Degree (AMD)
ordering, supporting symmetric positive-definite and quasi-definite sparse systems without requiring square roots of
diagonal elements.

**SimplicialLLT**: Direct sparse Cholesky solver computing `A = L * L^T` with AMD ordering, strictly requiring
symmetric positive-definite sparse matrices.

**Opaque Handle**: A safe positive integer identifier (`int32_t`) managed by an internal C++ instance registry in
WebAssembly memory, encapsulating a factorized direct solver instance across separate calls without exposing raw
internal pointers.

**ConjugateGradient**: Iterative Krylov subspace solver computing solutions to large symmetric positive-definite
sparse systems `A * x = b` using diagonal (Jacobi) preconditioning, configurable with maximum iterations and tolerance.

**BiCGSTAB**: Biconjugate gradient stabilized iterative solver computing solutions to general square non-symmetric
sparse systems `A * x = b` using diagonal (Jacobi) preconditioning, configurable with maximum iterations and tolerance.
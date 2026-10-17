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

**Reduction**: A computation whose output is a scalar or a short vector, such as determinant or rank.
Cannot fail the way a factorization can.

## Contract

**ComputationInfo**: Eigen's enum reporting whether a decomposition succeeded. Four values: `Success`,
`NumericalIssue`, `NoConvergence`, `InvalidInput`. The WASM surface exposes this enum rather than
inventing its own, so a failure a caller can see is the failure the Eigen test suite already asserts on.

**InvalidInput**: The `ComputationInfo` value meaning the input was rejected before any attempt was
made, as distinct from an attempt that failed. Reported by the SVD routines for non-finite input.

**matMul3x3**: Exported function computing `out = a * b` for row-major 3x3 matrices passed as three
`double` pointers.

**Row-major**: Memory layout where element (i, j) lives at index `rows * i + j`.

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
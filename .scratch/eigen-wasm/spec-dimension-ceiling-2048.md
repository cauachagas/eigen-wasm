# Spec: WebAssembly Dimension Ceiling Elevation to 2048

Status: ready-for-agent

## Problem Statement

Users of the WebAssembly build of Eigen are currently restricted by an artificial dimension ceiling of 255 (`kMaxDimension = 255`). Any dense matrix operation with rows or columns exceeding 255 is rejected with `InvalidInput`. This limitation was historically established based on the assumption that Eigen's blocked LU factorization panel updates caused unrecoverable WebAssembly memory access traps at dimension 256.

In practice, a 255x255 matrix is insufficient for modern scientific computing, graphics, physics simulations, and machine learning workloads on the web. Empirical investigation revealed that the 256 trap was not an inherent limitation of Eigen, but a silent stack overflow caused by Emscripten's default 64 KB stack size when blocked algorithms scale up panel buffers. With proper stack and heap configuration, WebAssembly executes dimensions well beyond 255 cleanly, stably, and with high throughput.

## Solution

Elevate the canonical WebAssembly dimension ceiling from 255 to 2048 (`kMaxDimension = 2048`), allowing dense matrix operations on matrices up to 2048x2048 (32 MB per matrix of 64-bit doubles).

To support this expanded dimension safely across all exported routines:
1. Reconfigure Emscripten build settings to allocate a 16 MB stack (`-s STACK_SIZE=16MB`), an initial memory pool of 128 MB (`-s INITIAL_MEMORY=128MB`), with dynamic growth permitted up to the maximum 32-bit WebAssembly boundary of 4 GB (`-s ALLOW_MEMORY_GROWTH=1 -s MAXIMUM_MEMORY=4GB`).
2. Update the canonical dimension validation helper to enforce `1 <= dimension <= 2048`, returning `InvalidInput` without mutating output buffers when any dimension exceeds 2048 or is non-positive.
3. Update exported `maxDimension()` to return `2048`.
4. Update the project domain model, ABI contract documentation, module documentation, and test suites to align with the new 2048 ceiling.

## User Stories

1. As a WebAssembly consumer, I want to perform matrix multiplications on matrices up to 2048x2048, so that I can compute large linear algebra workloads directly in client environments.
2. As a WebAssembly consumer, I want to calculate determinants of matrices up to 2048x2048, so that I can analyze large dimensional systems without receiving spurious InvalidInput errors.
3. As a WebAssembly consumer, I want to solve linear systems A * x = b with dimension up to 2048x2048 via LU decomposition, so that large engineering problems can be solved in the browser.
4. As a WebAssembly consumer, I want to invert invertible matrices up to 2048x2048, so that large matrix inverses are computed accurately.
5. As a WebAssembly consumer, I want to perform Cholesky LLT decomposition on symmetric positive-definite matrices up to 2048x2048, so that covariance and kernel matrices in data science can be decomposed.
6. As a WebAssembly consumer, I want to perform robust LDLT decomposition on symmetric semi-definite matrices up to 2048x2048, so that large optimization problems can be factored reliably.
7. As a WebAssembly consumer, I want to compute Bunch-Kaufman decompositions on symmetric indefinite matrices up to 2048x2048, so that indefinite saddle-point systems can be analyzed.
8. As a WebAssembly consumer, I want to compute QR factorizations on matrices with dimensions up to 2048, so that orthogonalizations and least-squares fits scale to large datasets.
9. As a WebAssembly consumer, I want to compute column-pivoted QR and matrix rank on matrices up to 2048x2048, so that large rank-deficient systems can be detected without memory traps.
10. As a WebAssembly consumer, I want to compute singular values and SVD decompositions up to 2048x2048, so that large-scale dimensionality reduction and principal component analyses can run in WebAssembly.
11. As a WebAssembly consumer, I want to compute symmetric and general eigendecompositions up to 2048x2048, so that spectral graph analysis and dynamic system stability can be evaluated for large networks.
12. As a WebAssembly consumer, I want calls with any dimension equal to or exceeding 2049 to return InvalidInput immediately with output buffers untouched, so that out-of-contract allocations are safely rejected without crashing the WebAssembly instance.
13. As a WebAssembly consumer, I want the maxDimension() export to return 2048 dynamically, so that client libraries can query the runtime boundary rather than hard-coding stale constants.
14. As a frontend developer, I want clear documentation advising that operations near 2048 dimensions take multiple seconds and should be dispatched to Web Workers, so that my application UI thread does not freeze.
15. As a maintainer, I want CI test suites to remain fast by maintaining algebraic precision tests on small/medium sizes while verifying the 2048 boundary via targeted boundary tests.

## Implementation Decisions

- **New Dimension Ceiling**:
  Set the dimension ceiling constant to 2048:
  ```cpp
  constexpr int kMaxDimension = 2048;
  ```
  All dimension validation functions (`validDim(int)` and `validDim(int, int)`) enforce `d >= 1 && d <= kMaxDimension`.

- **WebAssembly Memory Configuration**:
  The Emscripten build flags are configured as:
  - `-s STACK_SIZE=16MB`: Provides abundant stack headroom for Eigen recursive panel decompositions and GEMM blocking buffers.
  - `-s INITIAL_MEMORY=128MB`: Ensures the WebAssembly instance starts with enough linear memory to hold multiple 32 MB matrices without immediate memory growth overhead.
  - `-s ALLOW_MEMORY_GROWTH=1`: Retains dynamic heap expansion.
  - `-s MAXIMUM_MEMORY=4GB`: Sets the ceiling of linear memory growth to the 32-bit WebAssembly architecture limit.

- **Contract Preservation (Untouched Buffers on Failure)**:
  Any input with dimension <= 0, dimension > 2048, null pointer, non-square shape (where required), asymmetry (where required), or non-finite elements immediately aborts before writing to caller memory, returning `Eigen::InvalidInput` (value 3).

- **Performance Guidance for Consumers**:
  Document that while N=2048 operations execute cleanly and deterministically, operations above N=500 involve substantial computation (1.3s for GEMM, multiple seconds for iterative decompositions) and should be hosted in Web Workers to prevent main thread blocking in browser runtimes.

## Testing Decisions

- **Testing Seams**:
  Testing executes through the existing Node.js test seam (`wasm/test_*.js` via `node`), calling exported C functions across the WebAssembly boundary through `Module.cwrap` and inspecting returned error codes and buffers via `getValue`/`setValue`.
- **Targeted Ceiling Verification**:
  - Test that N = 2048 is accepted and executes successfully for representative routines (e.g., identity determinant, 1x1 scaling, or sparse-initialized matMul).
  - Test that N = 2049 (`MAX_DIMENSION + 1`) is rejected with `InvalidInput` (3) across all routines, verifying that output sentinels remain unmodified.
- **Prior Art**:
  Follows the exact pattern established in `wasm/test_determinant.js`, `wasm/test_lu.js`, `wasm/test_cholesky.js`, and `wasm/test_qr.js`, where `MAX_DIMENSION + 1` was previously tested against 256.

## Out of Scope

- Multi-threaded WebAssembly (`-pthread` / SharedArrayBuffer), which requires specific browser cross-origin isolation headers (COOP/COEP).
- SIMD-128 optimization flags beyond standard Wasm32 baseline.
- Matrix dimensions strictly greater than 2048 (which would exceed 128 MB for factorizations returning multiple matrices and approach browser tab memory limits on mobile platforms).

## Further Notes

- At N = 2048, a matrix of double-precision floating-point numbers contains 4,194,304 elements, taking exactly 32 MB of memory.
- Matrix multiplication at N = 2048 requires approximately 17.18 billion floating point operations (17.18 GFLOPs), executing in approximately 1.3 seconds on modern hardware.

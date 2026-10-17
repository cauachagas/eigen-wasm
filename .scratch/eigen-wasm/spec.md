# Eigen WASM MVP Spec

Objective: Reproduce an Eigen build in WebAssembly with Core+Dense.

## Build

`wasm/build.sh` invoking em++:

| Flag | Value | Why |
|---|---|---|
| `-O3` | | optimization |
| `-I<repo root>` | | `Eigen/` lives at the repo root, source lives in `wasm/` |
| `-std=c++17` | | required by Emscripten, not by Eigen (Eigen is C++14) |
| `-s ALLOW_MEMORY_GROWTH=1` | | |
| `-s EXPORT_ES6=1` | | ES module output |
| `-s MODULARIZE=1` | | factory function instead of a global |
| `-s EXPORT_NAME=EigenWasmModule` | | importable name |
| `-s EXPORTED_FUNCTIONS` | `_matMul3x3`, `_malloc`, `_free` | callers allocate their own buffers |
| `-s EXPORTED_RUNTIME_METHODS` | `ccall`, `cwrap`, `setValue`, `getValue` | JS-side memory access |

## Build script contract

`build.sh` honours `SRC` and `OUT` from the environment. Unset, it compiles
`eigen_wasm.cpp` to `eigen_wasm.js` beside itself. The compiler is not configurable:
it is always `em++`, never `emcc`. `emcc` links no C++ runtime, so the 3x3 product
compiles but any Eigen decomposition fails to link on `__cxa_allocate_exception`.

## Deliverables

- `wasm/eigen_wasm.cpp` exposing `matMul3x3(const double* a, const double* b, double* out)`, computing `out = a * b` for row-major 3x3 matrices.
- `wasm/build.sh` producing `wasm/eigen_wasm.js` and `wasm/eigen_wasm.wasm`, both gitignored.
- `wasm/test_matmul.js`, a Node test validating `matMul3x3` and exiting non-zero if any case fails.
- `wasm/README.md` documenting the build, the test, and the calling contract.
- `.github/workflows/wasm.yml` running the build and the test on GitHub Actions, on any change under `wasm/` or `Eigen/`.

## Test coverage

`test_matmul.js` covers the product against hand-computed literals, and the
documented aliasing contract (`out` may be `a` or `b`) with two further cases. The
aliasing guarantee depends on Eigen evaluating the product into a temporary before
storing into `out`, which is an evaluator implementation detail, so it is pinned by
a test rather than left as a comment.

Not covered: browser execution, null or out-of-range pointers, and any scalar other
than `double`.

## Decisions taken during implementation

These depart from the original MVP wording. Each is deliberate; the original
plan is recorded in `.scratch/eigen-wasm/issues/` for history.

1. **No `--bind`, no embind.** The wrapper is plain C marked `EMSCRIPTEN_KEEPALIVE`,
   and JS drives it through `ccall`/`cwrap`. embind would add a code-generation step
   and a runtime library to buy nothing for two raw-pointer functions.
2. **`matMul3x3`, not `matMul(MatrixXd, MatrixXd) -> MatrixXd`.** A fixed 3x3
   row-major API matches the MVP's actual goal of proving the toolchain end to end.
   Crossing the C++ boundary with `MatrixXd` would require either embind or manual
   size marshalling, and neither is wanted before there is a second operation.
   Growing to other sizes means adding functions, or switching to embind.
3. **Node only, no browser test.** The module is exported as an ES module and was
   validated under Node. Nothing exercises a real browser: import resolution, the
   `.wasm` fetch, and page-embedding behaviour are unverified.
4. **`Eigen/Dense`, matching the stated objective, though only `Eigen/Core` is used.**
   `Eigen/Dense` also pulls in SVD and Cholesky. Switching to the narrower
   `Eigen/Core` would honour the non-goals literally at no cost, since 3x3 products
   need only core coefficient arithmetic.

## Non-goals

Sparse, SVD, threading. `Eigen/Dense` is included per decision 4, so SVD is
compiled in but never called.

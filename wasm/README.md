# Eigen WASM

WebAssembly build of Eigen's Core and Dense modules, compiled with Emscripten.

## Requirements

An activated emsdk. It bundles its own Python and Node, so no separate install is
needed.

```bash
source /path/to/emsdk/emsdk_env.sh
```

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

Two exported functions.

```c
void matMul3x3(const double* a, const double* b, double* out);   // out = a * b
int  determinant(const double* a, int rows, int cols, double* out);   // det = det(a)
```

`a`, `b`, and `out` of `matMul3x3` must each point to 9 doubles in row-major order,
where `a[3 * i + j]` is row `i`, column `j`. `out` may alias `a` or `b`.

## `determinant`

```c
int determinant(const double* a, int rows, int cols, double* out);
```

`a` points to `rows * cols` doubles in row-major order, `a[cols * i + j]` being row
`i`, column `j`. `out` points to one double. On success `out` receives the determinant.

Preconditions. All of them are checked inside the routine, and the routine returns
`InvalidInput` rather than misbehaving when one fails:

| Precondition | Why it is checked |
|---|---|
| `a` and `out` are non-null | a null pointer is a wiring mistake, not a result |
| `rows >= 1` and `cols >= 1` | a zero or negative dimension describes no matrix |
| `rows == cols` | the determinant is defined only for a square matrix |
| `rows <= 255` | see the dimension ceiling below |

Return value. `int` carrying `Eigen::ComputationInfo` verbatim, with the enum's own
numbering and no mapping: `Success` is `0`, `NumericalIssue` is `1`, `NoConvergence`
is `2`, `InvalidInput` is `3`. A determinant cannot fail the way a factorization can,
so this routine returns only the first and the last:

| Value | Meaning here |
|---|---|
| `Success` (0) | the determinant was computed and written to `out` |
| `InvalidInput` (3) | a precondition above failed; nothing was attempted |
| `NumericalIssue` (1) | never returned by this routine |
| `NoConvergence` (2) | never returned by this routine |

A singular matrix is a determinant of zero, not a failure: it reports `Success` and
writes `0`.

**Output buffers are untouched unless the routine reports `Success`.** Every
precondition is checked before `out` is written, so a caller holding a stale buffer can
never mistake it for a result. `test_determinant.js` pins this with an output buffer
pre-filled with a sentinel and asserts the sentinel survives each rejected call.

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
| `eigen_wasm.cpp` | `matMul3x3` and `determinant` wrappers over `Eigen::Map` |
| `example.js` | Worked example; imported and run by the tests |
| `test_matmul.js` | Table-driven tests over `matMul3x3` |
| `test_determinant.js` | Value, contract and ceiling tests over `determinant` |

`wasm/` is the only local addition to this fork. `Eigen/`, `test/`, `ci/` and `.gitlab-ci.yml` are frozen upstream code, so the Eigen build system does not know this directory exists and the tests here run through GitHub Actions instead of `ctest`.

`AGENTS.md` and the guides under `.agents/` govern this directory as they do the rest of the repository. This README adds the WebAssembly detail: where the two disagree, `AGENTS.md` wins.

`build.sh` honours `SRC` and `OUT` from the environment; unset, it compiles
`eigen_wasm.cpp` to `eigen_wasm.js` beside itself. The compiler is not
configurable: it is always `em++`.

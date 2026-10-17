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

## Test

```bash
node wasm/test_matmul.js
```

Exits 0 when every case passes and non-zero on the first mismatch, so it is usable
as a CI gate. Expected results are hand-computed literals rather than values
recomputed by the code under test.

## API

One exported function:

```c
void matMul3x3(const double* a, const double* b, double* out);   // out = a * b
```

`a`, `b`, and `out` must each point to 9 doubles in row-major order, where
`a[3 * i + j]` is row `i`, column `j`. `out` may alias `a` or `b`.

The module is `MODULARIZE`d and exported as `EigenWasmModule`, with
`_malloc`, `_free`, and the `ccall`, `cwrap`, `setValue`, and `getValue` runtime
methods available:

```js
import EigenWasmModule from './wasm/eigen_wasm.js';

const Module = await EigenWasmModule();
const matMul3x3 = Module.cwrap('matMul3x3', null, ['number', 'number', 'number']);

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
```

Use `setValue` and `getValue` rather than a `Module.HEAPF64` view. The build sets
`ALLOW_MEMORY_GROWTH`, which detaches typed-array views when the heap grows, so a
retained view silently reads stale memory.

## Files

| File | Purpose |
|---|---|
| `build.sh` | emcc invocation and output paths |
| `eigen_wasm.cpp` | `matMul3x3` wrapper over `Eigen::Map` |
| `test_matmul.js` | Table-driven tests over the exported function |
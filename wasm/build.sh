#!/usr/bin/env bash
set -euo pipefail

# Eigen WASM build script.
# Flags: -O3, ALLOW_MEMORY_GROWTH, EXPORT_ES6, MODULARIZE. No --bind: the wrapper is
# EMSCRIPTEN_KEEPALIVE C, not embind.
# Memory is read/written with setValue/getValue, not HEAPF64 views: ALLOW_MEMORY_GROWTH
# detaches typed-array views on growth.
# C++17 is required by Emscripten, not by Eigen (Eigen itself is C++14, CMakeLists.txt:220).

# Requires an activated emsdk; it bundles its own Python and Node.
#   source /tmp/emsdk/emsdk_env.sh

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)   # Eigen/ lives at the repository root

EMCC=${EMCC:-emcc}
SRC=${SRC:-$HERE/eigen_wasm.cpp}
OUT=${OUT:-$HERE/eigen_wasm.js}

$EMCC "$SRC" -o "$OUT" \
  -I"$ROOT" \
  -O3 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="EigenWasmModule" \
  -s EXPORTED_FUNCTIONS='["_matMul3x3","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","setValue","getValue"]' \
  -std=c++17

echo "Build complete: $OUT"

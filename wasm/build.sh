#!/usr/bin/env bash
# SPDX-FileCopyrightText: The Eigen Authors
# SPDX-License-Identifier: MPL-2.0

set -euo pipefail

# Eigen WASM build script.
# Flags: -O3, ALLOW_MEMORY_GROWTH, EXPORT_ES6, MODULARIZE. No --bind: the wrapper is
# EMSCRIPTEN_KEEPALIVE C, not embind.
# Memory is read/written with setValue/getValue, not HEAPF64 views: ALLOW_MEMORY_GROWTH
# detaches typed-array views on growth.
# C++17 is required by Emscripten, not by Eigen (Eigen itself is C++14, CMakeLists.txt:220).

# Requires an activated emsdk; it bundles its own Python and Node.
#   source /path/to/emsdk/emsdk_env.sh
# CI does not use that path: .github/workflows/wasm.yml runs emscripten/emsdk
# from the emsdk Docker image, where em++ is already on PATH.
#
# The compiler is not configurable. em++ links libstdc++; emcc does not, so the
# 3x3 product compiles under emcc but any Eigen decomposition (LU, QR, SVD, ...)
# fails to link on __cxa_allocate_exception. Only SRC and OUT are overridable.

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)   # Eigen/ lives at the repository root

# Auto-activate emsdk if em++ is not on PATH and /tmp/emsdk exists
if ! command -v em++ >/dev/null 2>&1; then
  if [ -f "/tmp/emsdk/emsdk_env.sh" ]; then
    echo "em++ not found in PATH; activating /tmp/emsdk/emsdk_env.sh..."
    # shellcheck source=/dev/null
    source /tmp/emsdk/emsdk_env.sh >/dev/null
  else
    echo "Error: em++ not found in PATH." >&2
    echo "Please activate emsdk first:" >&2
    echo "  source /path/to/emsdk/emsdk_env.sh (e.g. source /tmp/emsdk/emsdk_env.sh)" >&2
    exit 1
  fi
fi

SRC=${SRC:-$HERE/eigen_wasm.cpp}
OUT=${OUT:-$HERE/eigen_wasm.js}


em++ "$SRC" -o "$OUT" \
  -I"$ROOT" \
  -O3 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s STACK_SIZE=16MB \
  -s INITIAL_MEMORY=128MB \
  -s MAXIMUM_MEMORY=4GB \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="EigenWasmModule" \
  -s EXPORTED_FUNCTIONS='["_matMul3x3","_determinant","_solveLU","_inv","_solvePartialLU","_invPartialLU","_cholesky","_qr","_solveLeastSquares","_matMul","_svd","_svdSingularValues","_symmetricEigen","_ldlt","_bunchKaufman","_colPivQr","_rank","_cod","_pseudoInverse","_generatePrescribedSingularValues","_bdcSvd","_generalEigen","_maxDimension","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","setValue","getValue"]' \
  -std=c++17

echo "Build complete: $OUT"

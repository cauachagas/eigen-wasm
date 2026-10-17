#!/usr/bin/env bash
# SPDX-FileCopyrightText: The Eigen Authors
# SPDX-License-Identifier: MPL-2.0

set -euo pipefail

# Eigen WASM build script.
# Flags: -O3, ALLOW_MEMORY_GROWTH, EXPORT_ES6, MODULARIZE.
# C++17 is required by Emscripten.

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)

# Determine Eigen headers directory:
# 1. Respect explicit EIGEN_DIR or EIGEN_INCLUDE_DIR if set
# 2. Check submodule at deps/eigen
# 3. Check local repo root (in-tree fallback)
EIGEN_DIR="${EIGEN_DIR:-${EIGEN_INCLUDE_DIR:-}}"

if [ -n "$EIGEN_DIR" ]; then
  if [ -f "$EIGEN_DIR/Eigen/Core" ]; then
    EIGEN_INCLUDE_PATH="$EIGEN_DIR"
  elif [ -f "$EIGEN_DIR/include/eigen3/Eigen/Core" ]; then
    EIGEN_INCLUDE_PATH="$EIGEN_DIR/include/eigen3"
  else
    echo "Warning: EIGEN_DIR is set to '$EIGEN_DIR', but Eigen/Core was not found." >&2
    EIGEN_INCLUDE_PATH="$EIGEN_DIR"
  fi
elif [ -f "$ROOT/deps/eigen/Eigen/Core" ]; then
  EIGEN_INCLUDE_PATH="$ROOT/deps/eigen"
elif [ -f "$ROOT/Eigen/Core" ]; then
  EIGEN_INCLUDE_PATH="$ROOT"
else
  echo "Error: Eigen headers not found in deps/eigen. Did you initialize submodules?" >&2
  echo "Run: git submodule update --init --recursive" >&2
  exit 1
fi

# Auto-activate emsdk if em++ is not on PATH and /tmp/emsdk exists
if ! command -v em++ >/dev/null 2>&1; then
  if [ -f "/tmp/emsdk/emsdk_env.sh" ]; then
    echo "em++ not found in PATH; activating /tmp/emsdk/emsdk_env.sh..."
    # shellcheck source=/dev/null
    source /tmp/emsdk/emsdk_env.sh >/dev/null
  else
    echo "Error: em++ not found in PATH." >&2
    echo "Please activate emsdk first:" >&2
    echo "  source /path/to/emsdk/emsdk_env.sh" >&2
    exit 1
  fi
fi

SRC=${SRC:-$ROOT/src/eigen_wasm.cpp}
BUILD_DIR=${BUILD_DIR:-$ROOT/build}
mkdir -p "$BUILD_DIR"
OUT=${OUT:-$BUILD_DIR/eigen_wasm.js}

em++ "$SRC" -o "$OUT" \
  -I"$EIGEN_INCLUDE_PATH" \
  -O3 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s STACK_SIZE=16MB \
  -s INITIAL_MEMORY=128MB \
  -s MAXIMUM_MEMORY=4GB \
  -s EXPORT_ES6=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="EigenWasmModule" \
  -s EXPORTED_FUNCTIONS='["_matMul3x3","_determinant","_transpose","_trace","_matrixNorm","_solveLU","_solveLUMatrix","_inv","_solvePartialLU","_invPartialLU","_cholesky","_solveCholesky","_solveTriangularLower","_solveTriangularUpper","_qr","_solveLeastSquares","_solveLeastSquaresMatrix","_matMul","_svd","_svdSingularValues","_symmetricEigen","_ldlt","_bunchKaufman","_colPivQr","_rank","_cod","_pseudoInverse","_generatePrescribedSingularValues","_bdcSvd","_generalEigen","_maxDimension","_malloc","_free","_sparseFromTriplets","_sparseMatMulVec","_sparseMatMulDense","_sparseAddGetNnz","_sparseAdd","_sparseScale","_sparseTranspose"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","setValue","getValue"]' \
  -std=c++17

echo "Build complete: $OUT"

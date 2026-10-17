// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

#ifndef EIGEN_WASM_SPARSE_HPP
#define EIGEN_WASM_SPARSE_HPP

#include <emscripten.h>
#include <vector>
#include <algorithm>
#include <cmath>
#include "Eigen/Sparse"

// Dimension ceiling for sparse routines: 1,000,000 rows/cols and 10,000,000 non-zeros.
// Up to 4GB linear memory permits scaling far beyond dense limits while protecting against overflow.
constexpr int kMaxSparseDimension = 1000000;
constexpr int kMaxSparseNnz = 10000000;

static inline bool validSparseDim(int r, int c) {
  return r >= 1 && r <= kMaxSparseDimension && c >= 1 && c <= kMaxSparseDimension;
}

static inline bool validSparseNnz(int nnz, int rows, int cols) {
  if (nnz < 0 || nnz > kMaxSparseNnz) {
    return false;
  }
  // Safe comparison preventing int32 overflow when rows * cols > INT_MAX
  double maxPossible = static_cast<double>(rows) * static_cast<double>(cols);
  return static_cast<double>(nnz) <= maxPossible;
}

static inline bool validOuterStarts(const int* outerStarts, int outerSize, int nnz) {
  if (outerStarts == nullptr || outerStarts[0] != 0 || outerStarts[outerSize] != nnz) {
    return false;
  }
  for (int i = 0; i < outerSize; ++i) {
    if (outerStarts[i] > outerStarts[i + 1]) {
      return false; // Non-monotonic
    }
  }
  return true;
}

static inline bool validCompressedStructure(
    const int* outerStarts, const int* innerIndices,
    int outerSize, int innerBound, int nnz
) {
  if (outerStarts == nullptr || innerIndices == nullptr) {
    return false;
  }
  if (!validOuterStarts(outerStarts, outerSize, nnz)) {
    return false;
  }
  for (int o = 0; o < outerSize; ++o) {
    int start = outerStarts[o];
    int end = outerStarts[o + 1];
    int prev = -1;
    for (int k = start; k < end; ++k) {
      int idx = innerIndices[k];
      if (idx < 0 || idx >= innerBound || idx <= prev) {
        return false; // strictly ascending and in bounds
      }
      prev = idx;
    }
  }
  return true;
}

static inline bool allFinite(const double* vals, int count) {
  if (vals == nullptr && count > 0) return false;
  for (int i = 0; i < count; ++i) {
    if (!std::isfinite(vals[i])) return false;
  }
  return true;
}

enum SparseStorageOrder {
  StorageOrderCSC = 0,
  StorageOrderCSR = 1
};

template <typename SparseMatType>
static inline void copyCompressedSparse(
    const SparseMatType& mat,
    int outerSize,
    double* outValues, int* outInnerIndices, int* outOuterStarts
) {
  int nnz = static_cast<int>(mat.nonZeros());
  const double* valPtr = mat.valuePtr();
  const int* innerPtr = mat.innerIndexPtr();
  const int* outerPtr = mat.outerIndexPtr();

  for (int i = 0; i < nnz; ++i) {
    outValues[i] = valPtr[i];
    outInnerIndices[i] = innerPtr[i];
  }
  for (int i = 0; i < outerSize; ++i) {
    outOuterStarts[i] = outerPtr[i];
  }
}

extern "C" {

// Convert coordinate triplets to compressed sparse matrix (CSC: 0, CSR: 1).
// Automatically sums duplicate coordinate entries and sorts inner indices.
EMSCRIPTEN_KEEPALIVE
int sparseFromTriplets(
    int rows, int cols, int tripletCount,
    const int* tripletRows, const int* tripletCols, const double* tripletValues,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts, int* outNnz
) {
  if (tripletRows == nullptr || tripletCols == nullptr || tripletValues == nullptr ||
      outValues == nullptr || outInnerIndices == nullptr ||
      outOuterStarts == nullptr || outNnz == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (tripletCount < 0 || tripletCount > kMaxSparseNnz) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }

  // Validate all coordinates are within [0, rows) and [0, cols) and values are finite
  for (int i = 0; i < tripletCount; ++i) {
    int r = tripletRows[i];
    int c = tripletCols[i];
    if (r < 0 || r >= rows || c < 0 || c >= cols) {
      return Eigen::InvalidInput;
    }
    if (!std::isfinite(tripletValues[i])) {
      return Eigen::InvalidInput;
    }
  }

  try {
    std::vector<Eigen::Triplet<double, int>> triplets;
    triplets.reserve(tripletCount);
    for (int i = 0; i < tripletCount; ++i) {
      triplets.emplace_back(tripletRows[i], tripletCols[i], tripletValues[i]);
    }

    if (storageOrder == StorageOrderCSC) {
      Eigen::SparseMatrix<double, Eigen::ColMajor, int> mat(rows, cols);
      mat.setFromTriplets(triplets.begin(), triplets.end());
      mat.makeCompressed();

      copyCompressedSparse(mat, cols + 1, outValues, outInnerIndices, outOuterStarts);
      *outNnz = static_cast<int>(mat.nonZeros());
    } else {
      Eigen::SparseMatrix<double, Eigen::RowMajor, int> mat(rows, cols);
      mat.setFromTriplets(triplets.begin(), triplets.end());
      mat.makeCompressed();

      copyCompressedSparse(mat, rows + 1, outValues, outInnerIndices, outOuterStarts);
      *outNnz = static_cast<int>(mat.nonZeros());
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse-Dense Matrix-Vector Product: y = A * x
EMSCRIPTEN_KEEPALIVE
int sparseMatMulVec(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    const double* x, double* outY
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      x == nullptr || outY == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnz, rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnz)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(aValues, nnz) || !allFinite(x, cols)) {
    return Eigen::InvalidInput;
  }

  try {
    Eigen::Map<const Eigen::VectorXd> xVec(x, cols);
    Eigen::VectorXd yRes(rows);
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          rows, cols, nnz, aOuterStarts, aInnerIndices, aValues);
      yRes = mat * xVec;
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> mat(
          rows, cols, nnz, aOuterStarts, aInnerIndices, aValues);
      yRes = mat * xVec;
    }
    for (int i = 0; i < rows; ++i) {
      outY[i] = yRes[i];
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse-Dense Matrix-Matrix Product: C = A * B (B and C dense, row-major)
EMSCRIPTEN_KEEPALIVE
int sparseMatMulDense(
    int rowsA, int colsA, int colsB, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    const double* b, double* outC
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      b == nullptr || outC == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rowsA, colsA) || colsB < 1 || colsB > kMaxSparseDimension) {
    return Eigen::InvalidInput;
  }
  if (!validSparseNnz(nnz, rowsA, colsA)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  // Prevent int32 overflow and memory exhaustion on dense matrices
  double bElements = static_cast<double>(colsA) * static_cast<double>(colsB);
  double cElements = static_cast<double>(rowsA) * static_cast<double>(colsB);
  if (bElements > 20000000.0 || cElements > 20000000.0) {
    return Eigen::InvalidInput;
  }

  int outerSize = (storageOrder == StorageOrderCSC) ? colsA : rowsA;
  int innerBound = (storageOrder == StorageOrderCSC) ? rowsA : colsA;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnz)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(aValues, nnz) || !allFinite(b, static_cast<int>(bElements))) {
    return Eigen::InvalidInput;
  }

  try {
    Eigen::Map<const Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> bMat(
        b, colsA, colsB);
    Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> cRes(rowsA, colsB);

    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          rowsA, colsA, nnz, aOuterStarts, aInnerIndices, aValues);
      cRes = mat * bMat;
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> mat(
          rowsA, colsA, nnz, aOuterStarts, aInnerIndices, aValues);
      cRes = mat * bMat;
    }

    int cCount = static_cast<int>(cElements);
    const double* cData = cRes.data();
    for (int i = 0; i < cCount; ++i) {
      outC[i] = cData[i];
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse Addition: C = A + B (Two-Pass Query: outNnz)
EMSCRIPTEN_KEEPALIVE
int sparseAddGetNnz(
    int rows, int cols,
    int nnzA, const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int nnzB, const double* bValues, const int* bInnerIndices, const int* bOuterStarts,
    int storageOrder,
    int* outNnz
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      bValues == nullptr || bInnerIndices == nullptr || bOuterStarts == nullptr ||
      outNnz == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnzA, rows, cols) || !validSparseNnz(nnzB, rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnzA) ||
      !validCompressedStructure(bOuterStarts, bInnerIndices, outerSize, innerBound, nnzB)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(aValues, nnzA) || !allFinite(bValues, nnzB)) {
    return Eigen::InvalidInput;
  }

  try {
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> matA(
          rows, cols, nnzA, aOuterStarts, aInnerIndices, aValues);
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> matB(
          rows, cols, nnzB, bOuterStarts, bInnerIndices, bValues);
      Eigen::SparseMatrix<double, Eigen::ColMajor, int> matC = matA + matB;
      matC.prune([](Eigen::Index, Eigen::Index, const double& val) {
        return val != 0.0;
      });
      matC.makeCompressed();
      *outNnz = static_cast<int>(matC.nonZeros());
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> matA(
          rows, cols, nnzA, aOuterStarts, aInnerIndices, aValues);
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> matB(
          rows, cols, nnzB, bOuterStarts, bInnerIndices, bValues);
      Eigen::SparseMatrix<double, Eigen::RowMajor, int> matC = matA + matB;
      matC.prune([](Eigen::Index, Eigen::Index, const double& val) {
        return val != 0.0;
      });
      matC.makeCompressed();
      *outNnz = static_cast<int>(matC.nonZeros());
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse Addition: C = A + B (Two-Pass Execution: write buffers)
EMSCRIPTEN_KEEPALIVE
int sparseAdd(
    int rows, int cols,
    int nnzA, const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int nnzB, const double* bValues, const int* bInnerIndices, const int* bOuterStarts,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      bValues == nullptr || bInnerIndices == nullptr || bOuterStarts == nullptr ||
      outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnzA, rows, cols) || !validSparseNnz(nnzB, rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnzA) ||
      !validCompressedStructure(bOuterStarts, bInnerIndices, outerSize, innerBound, nnzB)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(aValues, nnzA) || !allFinite(bValues, nnzB)) {
    return Eigen::InvalidInput;
  }

  try {
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> matA(
          rows, cols, nnzA, aOuterStarts, aInnerIndices, aValues);
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> matB(
          rows, cols, nnzB, bOuterStarts, bInnerIndices, bValues);
      Eigen::SparseMatrix<double, Eigen::ColMajor, int> matC = matA + matB;
      matC.prune([](Eigen::Index, Eigen::Index, const double& val) {
        return val != 0.0;
      });
      matC.makeCompressed();
      copyCompressedSparse(matC, cols + 1, outValues, outInnerIndices, outOuterStarts);
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> matA(
          rows, cols, nnzA, aOuterStarts, aInnerIndices, aValues);
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> matB(
          rows, cols, nnzB, bOuterStarts, bInnerIndices, bValues);
      Eigen::SparseMatrix<double, Eigen::RowMajor, int> matC = matA + matB;
      matC.prune([](Eigen::Index, Eigen::Index, const double& val) {
        return val != 0.0;
      });
      matC.makeCompressed();
      copyCompressedSparse(matC, rows + 1, outValues, outInnerIndices, outOuterStarts);
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse Scalar Multiplication: B = alpha * A
EMSCRIPTEN_KEEPALIVE
int sparseScale(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    double alpha,
    double* outValues, int* outInnerIndices, int* outOuterStarts
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnz, rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnz)) {
    return Eigen::InvalidInput;
  }
  if (!std::isfinite(alpha) || !allFinite(aValues, nnz)) {
    return Eigen::InvalidInput;
  }

  try {
    for (int i = 0; i < nnz; ++i) {
      outValues[i] = aValues[i] * alpha;
    }
    if (outInnerIndices != aInnerIndices) {
      for (int i = 0; i < nnz; ++i) {
        outInnerIndices[i] = aInnerIndices[i];
      }
    }
    if (outOuterStarts != aOuterStarts) {
      for (int i = 0; i <= outerSize; ++i) {
        outOuterStarts[i] = aOuterStarts[i];
      }
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

// Sparse Transposition: B = A^T
EMSCRIPTEN_KEEPALIVE
int sparseTranspose(
    int rows, int cols, int nnz,
    const double* aValues, const int* aInnerIndices, const int* aOuterStarts,
    int storageOrder,
    double* outValues, int* outInnerIndices, int* outOuterStarts
) {
  if (aValues == nullptr || aInnerIndices == nullptr || aOuterStarts == nullptr ||
      outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnz, rows, cols)) {
    return Eigen::InvalidInput;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return Eigen::InvalidInput;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(aOuterStarts, aInnerIndices, outerSize, innerBound, nnz)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(aValues, nnz)) {
    return Eigen::InvalidInput;
  }

  try {
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          rows, cols, nnz, aOuterStarts, aInnerIndices, aValues);
      Eigen::SparseMatrix<double, Eigen::ColMajor, int> matT = mat.transpose();
      matT.makeCompressed();
      copyCompressedSparse(matT, rows + 1, outValues, outInnerIndices, outOuterStarts);
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> mat(
          rows, cols, nnz, aOuterStarts, aInnerIndices, aValues);
      Eigen::SparseMatrix<double, Eigen::RowMajor, int> matT = mat.transpose();
      matT.makeCompressed();
      copyCompressedSparse(matT, cols + 1, outValues, outInnerIndices, outOuterStarts);
    }
  } catch (...) {
    return Eigen::NumericalIssue;
  }

  return Eigen::Success;
}

} // extern "C"

#endif // EIGEN_WASM_SPARSE_HPP

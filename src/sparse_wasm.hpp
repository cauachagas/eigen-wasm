// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

#ifndef EIGEN_WASM_SPARSE_HPP
#define EIGEN_WASM_SPARSE_HPP

#include <emscripten.h>
#include <vector>
#include <algorithm>
#include <cmath>
#include <memory>
#include <unordered_map>
#include "Eigen/Sparse"
#include "Eigen/SparseCholesky"
#include "Eigen/IterativeLinearSolvers"

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

static inline bool validateSparseMatrix(
    int rows, int cols, int nnz,
    const double* values, const int* innerIndices, const int* outerStarts,
    int storageOrder = StorageOrderCSC
) {
  if (values == nullptr || innerIndices == nullptr || outerStarts == nullptr) {
    return false;
  }
  if (!validSparseDim(rows, cols) || !validSparseNnz(nnz, rows, cols)) {
    return false;
  }
  if (storageOrder != StorageOrderCSC && storageOrder != StorageOrderCSR) {
    return false;
  }
  int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
  int innerBound = (storageOrder == StorageOrderCSC) ? rows : cols;
  if (!validCompressedStructure(outerStarts, innerIndices, outerSize, innerBound, nnz)) {
    return false;
  }
  if (!allFinite(values, nnz)) {
    return false;
  }
  return true;
}

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

// --- Sparse Solver Instance Registry ---

enum CholeskySolverType {
  SolverSimplicialLDLT = 0,
  SolverSimplicialLLT = 1
};

class SparseSolverInstance {
public:
  virtual ~SparseSolverInstance() = default;
  virtual int solve(const double* b, int nrhs, double* outX) = 0;
  virtual int dimension() const = 0;
};

template <typename ConcreteSolver>
class SimplicialCholeskySolverInstance : public SparseSolverInstance {
  int n_;
  ConcreteSolver solver_;
public:
  template <typename MatrixType>
  SimplicialCholeskySolverInstance(int n, const MatrixType& mat) : n_(n), solver_(mat) {}
  bool isOk() const { return solver_.info() == Eigen::Success; }
  int dimension() const override { return n_; }
  int solve(const double* b, int nrhs, double* outX) override {
    if (solver_.info() != Eigen::Success) return Eigen::NumericalIssue;
    Eigen::Map<const Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> B(b, n_, nrhs);
    Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> X = solver_.solve(B);
    if (solver_.info() != Eigen::Success || !X.allFinite()) return Eigen::NumericalIssue;
    std::copy(X.data(), X.data() + (n_ * nrhs), outX);
    return Eigen::Success;
  }
};

using SimplicialLDLTSolverInstance = SimplicialCholeskySolverInstance<
    Eigen::SimplicialLDLT<Eigen::SparseMatrix<double, Eigen::ColMajor, int>>>;
using SimplicialLLTSolverInstance = SimplicialCholeskySolverInstance<
    Eigen::SimplicialLLT<Eigen::SparseMatrix<double, Eigen::ColMajor, int>>>;

static std::unordered_map<int32_t, std::unique_ptr<SparseSolverInstance>> g_sparseSolverRegistry;
static int32_t g_nextSolverHandleId = 1;

static inline int32_t registerSolver(std::unique_ptr<SparseSolverInstance> solver) {
  int32_t id = g_nextSolverHandleId++;
  if (id <= 0) {
    id = 1;
    g_nextSolverHandleId = 2;
  }
  while (g_sparseSolverRegistry.find(id) != g_sparseSolverRegistry.end()) {
    id = g_nextSolverHandleId++;
    if (id <= 0) {
      id = 1;
      g_nextSolverHandleId = 2;
    }
  }
  g_sparseSolverRegistry[id] = std::move(solver);
  return id;
}

static inline SparseSolverInstance* getSolver(int32_t handle) {
  if (handle <= 0) return nullptr;
  auto it = g_sparseSolverRegistry.find(handle);
  if (it == g_sparseSolverRegistry.end()) return nullptr;
  return it->second.get();
}

static inline bool unregisterSolver(int32_t handle) {
  if (handle <= 0) return false;
  auto it = g_sparseSolverRegistry.find(handle);
  if (it == g_sparseSolverRegistry.end()) return false;
  g_sparseSolverRegistry.erase(it);
  return true;
}

template <typename MatrixType>
static inline int factorizeAndRegister(
    int n, const MatrixType& mat, int solverType, int32_t* outHandle
) {
  std::unique_ptr<SparseSolverInstance> instance;
  if (solverType == SolverSimplicialLDLT) {
    auto ldltInst = std::make_unique<SimplicialLDLTSolverInstance>(n, mat);
    if (!ldltInst->isOk()) {
      return Eigen::NumericalIssue;
    }
    instance = std::move(ldltInst);
  } else {
    auto lltInst = std::make_unique<SimplicialLLTSolverInstance>(n, mat);
    if (!lltInst->isOk()) {
      return Eigen::NumericalIssue;
    }
    instance = std::move(lltInst);
  }
  *outHandle = registerSolver(std::move(instance));
  return Eigen::Success;
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
  if (x == nullptr || outY == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(x, cols)) {
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
  if (b == nullptr || outC == nullptr) {
    return Eigen::InvalidInput;
  }
  if (colsB < 1 || colsB > kMaxSparseDimension) {
    return Eigen::InvalidInput;
  }
  // Prevent int32 overflow and memory exhaustion on dense matrices
  double bElements = static_cast<double>(colsA) * static_cast<double>(colsB);
  double cElements = static_cast<double>(rowsA) * static_cast<double>(colsB);
  if (bElements > 20000000.0 || cElements > 20000000.0) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rowsA, colsA, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(b, static_cast<int>(bElements))) {
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
  if (outNnz == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rows, cols, nnzA, aValues, aInnerIndices, aOuterStarts, storageOrder) ||
      !validateSparseMatrix(rows, cols, nnzB, bValues, bInnerIndices, bOuterStarts, storageOrder)) {
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
  if (outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rows, cols, nnzA, aValues, aInnerIndices, aOuterStarts, storageOrder) ||
      !validateSparseMatrix(rows, cols, nnzB, bValues, bInnerIndices, bOuterStarts, storageOrder)) {
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
  if (outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!std::isfinite(alpha)) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder)) {
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
      int outerSize = (storageOrder == StorageOrderCSC) ? cols : rows;
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
  if (outValues == nullptr || outInnerIndices == nullptr || outOuterStarts == nullptr) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder)) {
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

// Sparse Cholesky Factorization: SimplicialLDLT (solverType: 0) or SimplicialLLT (solverType: 1)
// Preconditions:
//   A is a square n x n symmetric matrix in CSC or CSR format with valid ascending structure.
//   solverType is 0 (SimplicialLDLT) or 1 (SimplicialLLT).
// Returns:
//   Success (0) and writes allocated positive handle ID to outHandle.
//   NumericalIssue (1) if matrix is non-positive-definite (LLT) or has zero pivot, leaving outHandle untouched.
//   InvalidInput (3) on null pointers, bounds violation, non-finite values or malformed structure, leaving outHandle untouched.
EMSCRIPTEN_KEEPALIVE
int sparseCholeskyFactorize(
    const double* values,
    const int32_t* innerIndices,
    const int32_t* outerStarts,
    int32_t n,
    int32_t nnz,
    int32_t storageOrder,
    int32_t solverType,
    int32_t* outHandle
) {
  if (outHandle == nullptr) {
    return Eigen::InvalidInput;
  }
  if (solverType != SolverSimplicialLDLT && solverType != SolverSimplicialLLT) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(n, n, nnz, values, innerIndices, outerStarts, storageOrder)) {
    return Eigen::InvalidInput;
  }

  try {
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          n, n, nnz, outerStarts, innerIndices, values);
      return factorizeAndRegister(n, mat, solverType, outHandle);
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> csrMat(
          n, n, nnz, outerStarts, innerIndices, values);
      Eigen::SparseMatrix<double, Eigen::ColMajor, int> mat = csrMat;
      mat.makeCompressed();
      return factorizeAndRegister(n, mat, solverType, outHandle);
    }
  } catch (const std::bad_alloc&) {
    return Eigen::InvalidInput;
  } catch (...) {
    return Eigen::NumericalIssue;
  }
}

// Destroy a previously allocated sparse solver instance by handle ID.
// Returns:
//   Success (0) if handle was valid and deallocated.
//   InvalidInput (3) if handle is non-positive or does not exist in registry.
EMSCRIPTEN_KEEPALIVE
int sparseCholeskyDestroy(int32_t handle) {
  if (handle <= 0 || !unregisterSolver(handle)) {
    return Eigen::InvalidInput;
  }
  return Eigen::Success;
}

// Direct Sparse Cholesky Solve: solves A * X = B via a pre-factorized handle.
// Preconditions:
//   handle references an active factorized direct solver instance.
//   b points to n * nrhs finite doubles in row-major layout.
//   nrhs >= 1.
//   outX points to n * nrhs doubles.
// Returns:
//   Success (0) and writes solution to outX in row-major layout.
//   NumericalIssue (1) if forward/back substitution encounters singularity, leaving outX untouched.
//   InvalidInput (3) on null pointers, invalid handle, nrhs < 1, or non-finite values, leaving outX untouched.
EMSCRIPTEN_KEEPALIVE
int sparseCholeskySolve(
    int32_t handle,
    const double* b,
    int32_t nrhs,
    double* outX
) {
  if (handle <= 0 || b == nullptr || outX == nullptr || nrhs < 1) {
    return Eigen::InvalidInput;
  }
  SparseSolverInstance* solver = getSolver(handle);
  if (solver == nullptr) {
    return Eigen::InvalidInput;
  }
  int32_t n = solver->dimension();
  double totalElements = static_cast<double>(n) * static_cast<double>(nrhs);
  if (totalElements > 20000000.0) {
    return Eigen::InvalidInput;
  }
  int32_t total = n * nrhs;
  if (!allFinite(b, total)) {
    return Eigen::InvalidInput;
  }

  try {
    return solver->solve(b, nrhs, outX);
  } catch (const std::bad_alloc&) {
    return Eigen::InvalidInput;
  } catch (...) {
    return Eigen::NumericalIssue;
  }
}

// Iterative Sparse Solver: Conjugate Gradient (CG) with diagonal Jacobi preconditioning.
// Solves A * X = B for symmetric positive-definite system.
// Preconditions:
//   A is a square n x n SPD matrix in CSC or CSR format with strictly ascending inner indices.
//   b points to n * nrhs finite doubles in row-major layout.
//   nrhs >= 1.
//   outX points to n * nrhs doubles.
//   maxIterations <= 0 defaults to 2 * n.
//   tolerance <= 0.0 defaults to machine epsilon.
//   outIterations and outEstimatedError are optional diagnostic output pointers (can be null).
// Returns:
//   Success (0): Converged within tolerance; writes outX and diagnostics.
//   NoConvergence (2): Iteration budget exhausted; writes best-effort outX and diagnostics.
//   NumericalIssue (1): Division by zero or breakdown (non-finite values), leaving outX and diagnostics untouched.
//   InvalidInput (3): Null pointers, invalid bounds, non-finite inputs, leaving outX and diagnostics untouched.
EMSCRIPTEN_KEEPALIVE
int sparseConjugateGradient(
    const double* values,
    const int32_t* innerIndices,
    const int32_t* outerStarts,
    int32_t n,
    int32_t nnz,
    int32_t storageOrder,
    const double* b,
    int32_t nrhs,
    double* outX,
    int32_t maxIterations,
    double tolerance,
    int32_t* outIterations,
    double* outEstimatedError
) {
  if (b == nullptr || outX == nullptr || nrhs < 1) {
    return Eigen::InvalidInput;
  }
  double totalElements = static_cast<double>(n) * static_cast<double>(nrhs);
  if (totalElements > 20000000.0) {
    return Eigen::InvalidInput;
  }
  if (!std::isfinite(tolerance)) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(n, n, nnz, values, innerIndices, outerStarts, storageOrder)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(b, n * nrhs)) {
    return Eigen::InvalidInput;
  }

  try {
    int maxIters = (maxIterations <= 0) ? (2 * n) : maxIterations;
    double tol = (tolerance <= 0.0) ? Eigen::NumTraits<double>::epsilon() : tolerance;

    Eigen::ConjugateGradient<Eigen::SparseMatrix<double, Eigen::ColMajor, int>,
                             Eigen::Lower | Eigen::Upper,
                             Eigen::DiagonalPreconditioner<double>> solver;
    solver.setMaxIterations(maxIters);
    solver.setTolerance(tol);

    Eigen::SparseMatrix<double, Eigen::ColMajor, int> cscStorage;
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          n, n, nnz, outerStarts, innerIndices, values);
      solver.compute(mat);
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> csrMat(
          n, n, nnz, outerStarts, innerIndices, values);
      cscStorage = csrMat;
      cscStorage.makeCompressed();
      solver.compute(cscStorage);
    }

    if (solver.info() != Eigen::Success) {
      return Eigen::NumericalIssue;
    }

    Eigen::Map<const Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> B(b, n, nrhs);
    Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> X(n, nrhs);

    int totalIterations = 0;
    double maxError = 0.0;
    Eigen::ComputationInfo finalInfo = Eigen::Success;

    for (int col = 0; col < nrhs; ++col) {
      Eigen::VectorXd bCol = B.col(col);
      Eigen::VectorXd xCol = solver.solve(bCol);

      if (!xCol.allFinite()) {
        return Eigen::NumericalIssue;
      }

      if (solver.info() == Eigen::NoConvergence) {
        finalInfo = Eigen::NoConvergence;
      } else if (solver.info() != Eigen::Success) {
        return Eigen::NumericalIssue;
      }

      totalIterations = std::max(totalIterations, static_cast<int>(solver.iterations()));
      maxError = std::max(maxError, solver.error());
      X.col(col) = xCol;
    }

    std::copy(X.data(), X.data() + (n * nrhs), outX);
    if (outIterations != nullptr) {
      *outIterations = totalIterations;
    }
    if (outEstimatedError != nullptr) {
      *outEstimatedError = maxError;
    }

    if (finalInfo == Eigen::NoConvergence) {
      return Eigen::NoConvergence;
    }
    return Eigen::Success;

  } catch (const std::bad_alloc&) {
    return Eigen::InvalidInput;
  } catch (...) {
    return Eigen::NumericalIssue;
  }
}

// Iterative Sparse Solver: BiCGSTAB with diagonal Jacobi preconditioning.
// Solves A * X = B for general square non-symmetric and indefinite systems.
// Preconditions:
//   A is a square n x n matrix in CSC or CSR format with strictly ascending inner indices.
//   b points to n * nrhs finite doubles in row-major layout.
//   nrhs >= 1.
//   outX points to n * nrhs doubles.
//   maxIterations <= 0 defaults to 2 * n.
//   tolerance <= 0.0 defaults to machine epsilon.
//   outIterations and outEstimatedError are optional diagnostic output pointers (can be null).
// Returns:
//   Success (0): Converged within tolerance; writes outX and diagnostics.
//   NoConvergence (2): Iteration budget exhausted; writes best-effort outX and diagnostics.
//   NumericalIssue (1): Division by zero or breakdown (non-finite values), leaving outX and diagnostics untouched.
//   InvalidInput (3): Null pointers, invalid bounds, non-finite inputs, leaving outX and diagnostics untouched.
EMSCRIPTEN_KEEPALIVE
int sparseBiCGSTAB(
    const double* values,
    const int32_t* innerIndices,
    const int32_t* outerStarts,
    int32_t n,
    int32_t nnz,
    int32_t storageOrder,
    const double* b,
    int32_t nrhs,
    double* outX,
    int32_t maxIterations,
    double tolerance,
    int32_t* outIterations,
    double* outEstimatedError
) {
  if (b == nullptr || outX == nullptr || nrhs < 1) {
    return Eigen::InvalidInput;
  }
  double totalElements = static_cast<double>(n) * static_cast<double>(nrhs);
  if (totalElements > 20000000.0) {
    return Eigen::InvalidInput;
  }
  if (!std::isfinite(tolerance)) {
    return Eigen::InvalidInput;
  }
  if (!validateSparseMatrix(n, n, nnz, values, innerIndices, outerStarts, storageOrder)) {
    return Eigen::InvalidInput;
  }
  if (!allFinite(b, n * nrhs)) {
    return Eigen::InvalidInput;
  }

  try {
    int maxIters = (maxIterations <= 0) ? (2 * n) : maxIterations;
    double tol = (tolerance <= 0.0) ? Eigen::NumTraits<double>::epsilon() : tolerance;

    Eigen::BiCGSTAB<Eigen::SparseMatrix<double, Eigen::ColMajor, int>,
                    Eigen::DiagonalPreconditioner<double>> solver;
    solver.setMaxIterations(maxIters);
    solver.setTolerance(tol);

    Eigen::SparseMatrix<double, Eigen::ColMajor, int> cscStorage;
    if (storageOrder == StorageOrderCSC) {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::ColMajor, int>> mat(
          n, n, nnz, outerStarts, innerIndices, values);
      solver.compute(mat);
    } else {
      Eigen::Map<const Eigen::SparseMatrix<double, Eigen::RowMajor, int>> csrMat(
          n, n, nnz, outerStarts, innerIndices, values);
      cscStorage = csrMat;
      cscStorage.makeCompressed();
      solver.compute(cscStorage);
    }

    if (solver.info() != Eigen::Success) {
      return Eigen::NumericalIssue;
    }

    Eigen::Map<const Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>> B(b, n, nrhs);
    Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor> X(n, nrhs);

    int totalIterations = 0;
    double maxError = 0.0;
    Eigen::ComputationInfo finalInfo = Eigen::Success;

    for (int col = 0; col < nrhs; ++col) {
      Eigen::VectorXd bCol = B.col(col);
      Eigen::VectorXd xCol = solver.solve(bCol);

      if (!xCol.allFinite()) {
        return Eigen::NumericalIssue;
      }

      if (solver.info() == Eigen::NoConvergence) {
        finalInfo = Eigen::NoConvergence;
      } else if (solver.info() != Eigen::Success) {
        return Eigen::NumericalIssue;
      }

      totalIterations = std::max(totalIterations, static_cast<int>(solver.iterations()));
      maxError = std::max(maxError, solver.error());
      X.col(col) = xCol;
    }

    std::copy(X.data(), X.data() + (n * nrhs), outX);
    if (outIterations != nullptr) {
      *outIterations = totalIterations;
    }
    if (outEstimatedError != nullptr) {
      *outEstimatedError = maxError;
    }

    if (finalInfo == Eigen::NoConvergence) {
      return Eigen::NoConvergence;
    }
    return Eigen::Success;

  } catch (const std::bad_alloc&) {
    return Eigen::InvalidInput;
  } catch (...) {
    return Eigen::NumericalIssue;
  }
}

} // extern "C"

#endif // EIGEN_WASM_SPARSE_HPP

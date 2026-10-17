// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

#include <emscripten.h>
#include "Eigen/Dense"

// The dimension ceiling. The Eigen test suite's EIGEN_TEST_MAX_SIZE is 320, but 256 is the
// real boundary on this target: at 256 and above, the blocked LU behind MatrixBase::determinant()
// raises its block size from 16 to 32 and its nested panel update reads out of bounds, which
// traps the WASM instance instead of returning. 255 is the largest size below that boundary.
// Guarding it is what turns an oversized request into InvalidInput rather than a dead module;
// wasm/README.md records the measurement.
constexpr int kMaxDimension = 255;

using RowMajorMatrix = Eigen::Matrix<double, Eigen::Dynamic, Eigen::Dynamic, Eigen::RowMajor>;

extern "C" {

// Expose the target dimension ceiling so tests and callers can read it rather than duplicating it.
EMSCRIPTEN_KEEPALIVE
int maxDimension() {
  return kMaxDimension;
}

// Preconditions: a, b and out are non-null pointers to 9 doubles each, laid out
// row-major (a[3*i + j] is row i, column j). out may alias a or b.
// JS callers reach memory through Module.setValue/getValue.
EMSCRIPTEN_KEEPALIVE
void matMul3x3(const double* a, const double* b, double* out) {
    Eigen::Map<const Eigen::Matrix<double,3,3,Eigen::RowMajor>> A(a);
    Eigen::Map<const Eigen::Matrix<double,3,3,Eigen::RowMajor>> B(b);
    Eigen::Map<Eigen::Matrix<double,3,3,Eigen::RowMajor>> C(out);
    C = A * B;
}

// Determinant of a row-major rows-by-cols matrix a (a[cols*i + j] is row i, column j),
// written as one double into out. Returns Eigen::ComputationInfo verbatim, so the value
// reaching JS is exactly the enum's own numbering. A singular matrix is a determinant of
// zero, not a failure, so this routine reports only Success or InvalidInput.
//
// Every precondition is checked before out is written, so a caller that gets any value
// other than Success still holds whatever its output buffer held before the call.
EMSCRIPTEN_KEEPALIVE
int determinant(const double* a, int rows, int cols, double* out) {
  // Explicit guards, not eigen_assert: -O3 defines NDEBUG and compiles assertions out.
  if (a == nullptr || out == nullptr || rows < 1 || cols < 1 || rows != cols || rows > kMaxDimension) {
    return Eigen::InvalidInput;
  }
  *out = Eigen::Map<const RowMajorMatrix>(a, rows, cols).determinant();
  return Eigen::Success;
}

// Solve linear system A x = b via FullPivLU.
// Preconditions: A is n-by-n row-major, b is n-vector, out is caller-allocated n-vector.
// Returns Success, NumericalIssue (if singular), or InvalidInput.
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int solveLU(const double* a, const double* b, int n, double* out) {
  if (a == nullptr || b == nullptr || out == nullptr || n < 1 || n > kMaxDimension) {
    return Eigen::InvalidInput;
  }
  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  Eigen::FullPivLU<RowMajorMatrix> lu(A);
  if (!lu.isInvertible()) {
    return Eigen::NumericalIssue;
  }
  Eigen::Map<const Eigen::VectorXd> rhs(b, n);
  Eigen::VectorXd x = lu.solve(rhs);
  for (int i = 0; i < n; ++i) {
    out[i] = x[i];
  }
  return Eigen::Success;
}

// Inverse of an n-by-n row-major matrix A, written to caller-allocated out buffer.
// Returns Success, NumericalIssue (if singular), or InvalidInput (non-square, null, out of range).
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int inv(const double* a, int rows, int cols, double* out) {
  if (a == nullptr || out == nullptr || rows < 1 || cols < 1 || rows != cols || rows > kMaxDimension) {
    return Eigen::InvalidInput;
  }
  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  Eigen::FullPivLU<RowMajorMatrix> lu(A);
  if (!lu.isInvertible()) {
    return Eigen::NumericalIssue;
  }
  RowMajorMatrix inverseMat = lu.inverse();
  int totalEntries = rows * cols;
  for (int i = 0; i < totalEntries; ++i) {
    out[i] = inverseMat.data()[i];
  }
  return Eigen::Success;
}
}

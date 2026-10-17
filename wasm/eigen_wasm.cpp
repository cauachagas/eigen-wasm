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

// Internal helpers for validating dimension bounds and symmetry.
// Centralizing bounds logic prevents duplicated guards and keeps ceiling invariants consistent.
static inline bool validDim(int d) {
  return d >= 1 && d <= kMaxDimension;
}

static inline bool validDim(int r, int c) {
  return validDim(r) && validDim(c);
}

static inline bool isSymmetric(const double* a, int n) {
  for (int i = 0; i < n; ++i) {
    for (int j = i + 1; j < n; ++j) {
      double diff = Eigen::numext::abs(a[i * n + j] - a[j * n + i]);
      double mag = Eigen::numext::mini(Eigen::numext::abs(a[i * n + j]), Eigen::numext::abs(a[j * n + i]));
      double tol = Eigen::numext::maxi(1e-12, mag * 1e-6);
      if (diff > tol) {
        return false;
      }
    }
  }
  return true;
}

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
  if (a == nullptr || out == nullptr || !validDim(rows, cols) || rows != cols) {
    return Eigen::InvalidInput;
  }
  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  *out = A.determinant();
  return Eigen::Success;
}

// Solve linear system A x = b via FullPivLU.
// Preconditions: A is n-by-n row-major, b is n-vector, out is caller-allocated n-vector.
// Returns Success, NumericalIssue (if singular or non-finite solution), or InvalidInput.
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int solveLU(const double* a, const double* b, int n, double* out) {
  if (a == nullptr || b == nullptr || out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  Eigen::Map<const Eigen::VectorXd> rhs(b, n);
  if (!A.allFinite() || !rhs.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::FullPivLU<RowMajorMatrix> lu(A);
  if (!lu.isInvertible()) {
    return Eigen::NumericalIssue;
  }
  Eigen::VectorXd x = lu.solve(rhs);
  if (!x.allFinite()) {
    return Eigen::NumericalIssue;
  }
  for (int i = 0; i < n; ++i) {
    out[i] = x[i];
  }
  return Eigen::Success;
}

// Inverse of an n-by-n row-major matrix A, written to caller-allocated out buffer.
// Returns Success, NumericalIssue (if singular or non-finite), or InvalidInput (null, out of range).
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int inv(const double* a, int n, double* out) {
  if (a == nullptr || out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::FullPivLU<RowMajorMatrix> lu(A);
  if (!lu.isInvertible()) {
    return Eigen::NumericalIssue;
  }
  RowMajorMatrix inverseMat = lu.inverse();
  if (!inverseMat.allFinite()) {
    return Eigen::NumericalIssue;
  }
  int totalEntries = n * n;
  for (int i = 0; i < totalEntries; ++i) {
    out[i] = inverseMat.data()[i];
  }
  return Eigen::Success;
}

// Cholesky decomposition (LLT).
// Preconditions: A is n-by-n symmetric positive-definite, out is n-by-n row-major.
// If A is asymmetric, non-finite, or invalid dimensions/pointers, returns InvalidInput.
// If A is not positive-definite, returns NumericalIssue.
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int cholesky(const double* a, int n, double* out) {
  if (a == nullptr || out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  if (!isSymmetric(a, n)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::LLT<RowMajorMatrix> llt(A);
  if (llt.info() != Eigen::Success) {
    return llt.info(); // Returns NumericalIssue if not positive-definite
  }

  RowMajorMatrix L = llt.matrixL();
  int totalEntries = n * n;
  for (int i = 0; i < totalEntries; ++i) {
    out[i] = L.data()[i];
  }
  return Eigen::Success;
}


// QR factorization via HouseholderQR.
// Produces full Q (rows x rows) and strictly upper triangular R (rows x cols).
// Returns Success or InvalidInput.
EMSCRIPTEN_KEEPALIVE
int qr(const double* a, int rows, int cols, double* q_out, double* r_out) {
  if (a == nullptr || q_out == nullptr || r_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::HouseholderQR<RowMajorMatrix> householderQr(A);
  if (householderQr.info() != Eigen::Success) {
    return householderQr.info();
  }

  RowMajorMatrix Q = householderQr.householderQ();
  RowMajorMatrix R = RowMajorMatrix::Zero(rows, cols);
  R.template triangularView<Eigen::Upper>() = householderQr.matrixQR().template triangularView<Eigen::Upper>();

  int qEntries = rows * rows;
  for (int i = 0; i < qEntries; ++i) {
    q_out[i] = Q.data()[i];
  }

  int rEntries = rows * cols;
  for (int i = 0; i < rEntries; ++i) {
    r_out[i] = R.data()[i];
  }

  return Eigen::Success;
}

// Least squares solver via HouseholderQR.
// Solves min ||A x - b|| for rectangular A (rows x cols) and b (rows-vector).
// Returns Success, NumericalIssue (if solution non-finite), or InvalidInput.
// Leaves out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int solveLeastSquares(const double* a, const double* b, int rows, int cols, double* x_out) {
  if (a == nullptr || b == nullptr || x_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  Eigen::Map<const Eigen::VectorXd> rhs(b, rows);
  if (!A.allFinite() || !rhs.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::HouseholderQR<RowMajorMatrix> householderQr(A);
  if (householderQr.info() != Eigen::Success) {
    return householderQr.info();
  }

  Eigen::VectorXd x = householderQr.solve(rhs);
  if (!x.allFinite()) {
    return Eigen::NumericalIssue;
  }

  for (int i = 0; i < cols; ++i) {
    x_out[i] = x[i];
  }

  return Eigen::Success;
}

// Dynamic matrix multiplication C = A * B.
// A is rowsA x colsA, B is colsA x colsB, out is rowsA x colsB.
EMSCRIPTEN_KEEPALIVE
int matMul(const double* a, const double* b, int rowsA, int colsA, int colsB, double* out) {
  if (a == nullptr || b == nullptr || out == nullptr ||
      !validDim(rowsA) || !validDim(colsA) || !validDim(colsB)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rowsA, colsA);
  Eigen::Map<const RowMajorMatrix> B(b, colsA, colsB);
  RowMajorMatrix C = A * B;

  int total = rowsA * colsB;
  for (int i = 0; i < total; ++i) {
    out[i] = C.data()[i];
  }

  return Eigen::Success;
}

// SVD decomposition via JacobiSVD with thin unitaries U and V.
// Preconditions:
//   s_out points to min(rows, cols) doubles.
//   u_out points to rows * min(rows, cols) doubles.
//   vt_out points to min(rows, cols) * cols doubles (representing V^T).
// Returns Success or InvalidInput.
EMSCRIPTEN_KEEPALIVE
int svd(const double* a, int rows, int cols, double* s_out, double* u_out, double* vt_out) {
  if (a == nullptr || s_out == nullptr || u_out == nullptr || vt_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::JacobiSVD<RowMajorMatrix, Eigen::ComputeThinU | Eigen::ComputeThinV> jacobiSvd(A);
  if (jacobiSvd.info() != Eigen::Success) {
    return jacobiSvd.info();
  }

  int k = Eigen::numext::mini(rows, cols);
  const auto& s = jacobiSvd.singularValues();
  for (int i = 0; i < k; ++i) {
    s_out[i] = s[i];
  }

  RowMajorMatrix U = jacobiSvd.matrixU();
  int u_size = rows * k;
  for (int i = 0; i < u_size; ++i) {
    u_out[i] = U.data()[i];
  }

  RowMajorMatrix Vt = jacobiSvd.matrixV().transpose();
  int vt_size = k * cols;
  for (int i = 0; i < vt_size; ++i) {
    vt_out[i] = Vt.data()[i];
  }

  return Eigen::Success;
}

// SVD singular values only (without U and V matrices).
// Preconditions:
//   s_out points to min(rows, cols) doubles.
// Returns Success, InvalidInput (null, invalid dim, non-finite), or NumericalIssue.
// Leaves s_out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int svdSingularValues(const double* a, int rows, int cols, double* s_out) {
  if (a == nullptr || s_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::JacobiSVD<RowMajorMatrix> jacobiSvd(A);
  if (jacobiSvd.info() != Eigen::Success) {
    return jacobiSvd.info();
  }

  int k = Eigen::numext::mini(rows, cols);
  const auto& s = jacobiSvd.singularValues();
  for (int i = 0; i < k; ++i) {
    s_out[i] = s[i];
  }

  return Eigen::Success;
}

// Symmetric eigensolver via SelfAdjointEigenSolver.
// Preconditions: A is n-by-n symmetric matrix.
// Returns Success, InvalidInput (asymmetric, null, invalid n), or NumericalIssue.
EMSCRIPTEN_KEEPALIVE
int symmetricEigen(const double* a, int n, double* eigenvalues_out, double* eigenvectors_out) {
  if (a == nullptr || eigenvalues_out == nullptr || eigenvectors_out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  if (!isSymmetric(a, n)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::SelfAdjointEigenSolver<RowMajorMatrix> solver(A);
  if (solver.info() != Eigen::Success) {
    return solver.info();
  }

  const auto& eigenvalues = solver.eigenvalues();
  for (int i = 0; i < n; ++i) {
    eigenvalues_out[i] = eigenvalues[i];
  }

  RowMajorMatrix V = solver.eigenvectors();
  int total = n * n;
  for (int i = 0; i < total; ++i) {
    eigenvectors_out[i] = V.data()[i];
  }

  return Eigen::Success;
}

// LDLT decomposition for positive semi-definite matrices.
// Preconditions: A is n-by-n symmetric, l_out is n-by-n row-major, d_out is n-vector,
//                trans_out is n integers representing the transpositions sequence P.
EMSCRIPTEN_KEEPALIVE
int ldlt(const double* a, int n, double* l_out, double* d_out, int* trans_out) {
  if (a == nullptr || l_out == nullptr || d_out == nullptr || trans_out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  if (!isSymmetric(a, n)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::LDLT<RowMajorMatrix> ldltDecomp(A);
  if (ldltDecomp.info() != Eigen::Success) {
    return ldltDecomp.info();
  }

  RowMajorMatrix L = ldltDecomp.matrixL();
  int total = n * n;
  for (int i = 0; i < total; ++i) {
    l_out[i] = L.data()[i];
  }

  Eigen::VectorXd D = ldltDecomp.vectorD();
  for (int i = 0; i < n; ++i) {
    d_out[i] = D[i];
  }

  const auto& trans = ldltDecomp.transpositionsP();
  for (int i = 0; i < n; ++i) {
    trans_out[i] = static_cast<int>(trans.indices()[i]);
  }

  return Eigen::Success;
}

// Bunch-Kaufman decomposition for symmetric indefinite matrices.
// Preconditions: A is n-by-n symmetric, recon_out is n-by-n row-major for reconstructed matrix.
EMSCRIPTEN_KEEPALIVE
int bunchKaufman(const double* a, int n, double* recon_out) {
  if (a == nullptr || recon_out == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }
  if (!isSymmetric(a, n)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }
  Eigen::BunchKaufman<RowMajorMatrix> bk(A);
  if (bk.info() != Eigen::Success) {
    return bk.info();
  }

  RowMajorMatrix recon = bk.reconstructedMatrix();
  int total = n * n;
  for (int i = 0; i < total; ++i) {
    recon_out[i] = recon.data()[i];
  }

  return Eigen::Success;
}

// ColPivHouseholderQR: column-pivoted QR with rank and column permutation.
// Preconditions: A is rows x cols row-major.
// q_out: rows x rows, r_out: rows x cols, perm_out: cols integers, rank_out: 1 integer.
EMSCRIPTEN_KEEPALIVE
int colPivQr(const double* a, int rows, int cols, double* q_out, double* r_out, int* perm_out, int* rank_out) {
  if (a == nullptr || q_out == nullptr || r_out == nullptr || perm_out == nullptr || rank_out == nullptr ||
      !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::ColPivHouseholderQR<RowMajorMatrix> cpqr(A);
  if (cpqr.info() != Eigen::Success) {
    return cpqr.info();
  }

  RowMajorMatrix Q = cpqr.householderQ();
  RowMajorMatrix R = RowMajorMatrix::Zero(rows, cols);
  R.template triangularView<Eigen::Upper>() = cpqr.matrixQR().template triangularView<Eigen::Upper>();

  int qEntries = rows * rows;
  for (int i = 0; i < qEntries; ++i) q_out[i] = Q.data()[i];

  int rEntries = rows * cols;
  for (int i = 0; i < rEntries; ++i) r_out[i] = R.data()[i];

  const auto& p = cpqr.colsPermutation();
  for (int i = 0; i < cols; ++i) perm_out[i] = static_cast<int>(p.indices()[i]);

  *rank_out = static_cast<int>(cpqr.rank());

  return Eigen::Success;
}

// Standalone matrix rank via ColPivHouseholderQR.
// Preconditions:
//   rank_out points to 1 integer.
// Returns Success or InvalidInput.
// Leaves rank_out untouched on failure.
EMSCRIPTEN_KEEPALIVE
int rank(const double* a, int rows, int cols, int* rank_out) {
  if (a == nullptr || rank_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::ColPivHouseholderQR<RowMajorMatrix> cpqr(A);
  if (cpqr.info() != Eigen::Success) {
    return cpqr.info();
  }

  *rank_out = static_cast<int>(cpqr.rank());
  return Eigen::Success;
}

// Deterministic matrix generator with prescribed singular values.
// Ported to use explicit linear congruential PRNG so results are platform-independent.
EMSCRIPTEN_KEEPALIVE
int generatePrescribedSingularValues(double* out, int rows, int cols, const double* s, int s_len, unsigned int seed) {
  int k = Eigen::numext::mini(rows, cols);
  if (out == nullptr || s == nullptr || !validDim(rows, cols) || s_len < k) {

    return Eigen::InvalidInput;
  }

  // Simple, deterministic LCG for test matrix generation (same across all libc/wasm targets)
  auto lcg = [&seed]() -> double {
    seed = seed * 1664525u + 1013904223u;
    return static_cast<double>(seed % 10000u) / 10000.0 - 0.5;
  };

  RowMajorMatrix U = RowMajorMatrix::Zero(rows, k);
  for (int j = 0; j < k; ++j) {
    for (int i = 0; i < rows; ++i) U(i, j) = lcg();
    // Gram-Schmidt orthogonalization
    for (int p = 0; p < j; ++p) {
      double dot = U.col(j).dot(U.col(p));
      U.col(j) -= dot * U.col(p);
    }
    double n = U.col(j).norm();
    if (n > 1e-12) U.col(j) /= n;
  }

  RowMajorMatrix V = RowMajorMatrix::Zero(cols, k);
  for (int j = 0; j < k; ++j) {
    for (int i = 0; i < cols; ++i) V(i, j) = lcg();
    for (int p = 0; p < j; ++p) {
      double dot = V.col(j).dot(V.col(p));
      V.col(j) -= dot * V.col(p);
    }
    double n = V.col(j).norm();
    if (n > 1e-12) V.col(j) /= n;
  }

  Eigen::VectorXd S(k);
  for (int i = 0; i < k; ++i) S[i] = s[i];

  RowMajorMatrix A = U * S.asDiagonal() * V.transpose();
  int total = rows * cols;
  for (int i = 0; i < total; ++i) {
    out[i] = A.data()[i];
  }

  return Eigen::Success;
}

// BDCSVD for large matrices.
EMSCRIPTEN_KEEPALIVE
int bdcSvd(const double* a, int rows, int cols, double* s_out, double* u_out, double* vt_out) {
  if (a == nullptr || s_out == nullptr || u_out == nullptr || vt_out == nullptr || !validDim(rows, cols)) {
    return Eigen::InvalidInput;
  }

  Eigen::Map<const RowMajorMatrix> A(a, rows, cols);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::BDCSVD<RowMajorMatrix, Eigen::ComputeThinU | Eigen::ComputeThinV> bdc(A);
  if (bdc.info() != Eigen::Success) {
    return bdc.info();
  }

  int k = Eigen::numext::mini(rows, cols);
  const auto& s = bdc.singularValues();
  for (int i = 0; i < k; ++i) s_out[i] = s[i];

  RowMajorMatrix U = bdc.matrixU();
  int u_size = rows * k;
  for (int i = 0; i < u_size; ++i) u_out[i] = U.data()[i];

  RowMajorMatrix Vt = bdc.matrixV().transpose();
  int vt_size = k * cols;
  for (int i = 0; i < vt_size; ++i) vt_out[i] = Vt.data()[i];

  return Eigen::Success;
}

// General Eigensolver over RealSchur for non-symmetric matrices.
// real_eivals / imag_eivals: n doubles each.
// real_eivecs / imag_eivecs: n x n doubles each.
EMSCRIPTEN_KEEPALIVE
int generalEigen(const double* a, int n, double* real_eivals, double* imag_eivals, double* real_eivecs, double* imag_eivecs) {
  if (a == nullptr || real_eivals == nullptr || imag_eivals == nullptr ||
      real_eivecs == nullptr || imag_eivecs == nullptr || !validDim(n)) {
    return Eigen::InvalidInput;
  }


  Eigen::Map<const RowMajorMatrix> A(a, n, n);
  if (!A.allFinite()) {
    return Eigen::InvalidInput;
  }

  Eigen::EigenSolver<RowMajorMatrix> solver(A);
  if (solver.info() != Eigen::Success) {
    return solver.info();
  }

  const auto& eivals = solver.eigenvalues();
  for (int i = 0; i < n; ++i) {
    real_eivals[i] = eivals[i].real();
    imag_eivals[i] = eivals[i].imag();
  }

  const auto& eivecs = solver.eigenvectors();
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) {
      real_eivecs[i * n + j] = eivecs(i, j).real();
      imag_eivecs[i * n + j] = eivecs(i, j).imag();
    }
  }

  return Eigen::Success;
}
}

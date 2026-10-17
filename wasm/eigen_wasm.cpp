// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

#include <emscripten.h>
#include "Eigen/Dense"

extern "C" {

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

}

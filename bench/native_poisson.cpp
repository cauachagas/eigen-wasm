// SPDX-FileCopyrightText: The Eigen Authors
// SPDX-License-Identifier: MPL-2.0

// native_poisson.cpp: Native C++ baseline benchmark for 2D/3D Poisson sparse systems.
// Compiles directly with upstream Eigen headers using -O3 optimization.
// Can output structured JSON or human-readable tables for comparison with WebAssembly.

#include <iostream>
#include <vector>
#include <string>
#include <chrono>
#include <cmath>
#include <iomanip>
#include "Eigen/Sparse"
#include "Eigen/SparseCholesky"
#include "Eigen/IterativeLinearSolvers"

using Clock = std::chrono::high_resolution_clock;

static inline double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

struct BenchmarkRecord {
  std::string problem;
  std::string op;
  int n;
  int nnz;
  double timeMs;
  double opsSec;
  double mflops;
  int iters;
  double residual;
};

// Assemble 2D Poisson Laplacian (5-point stencil on N x N grid)
Eigen::SparseMatrix<double> generatePoisson2D(int N) {
  int n = N * N;
  Eigen::SparseMatrix<double> mat(n, n);
  mat.reserve(Eigen::VectorXi::Constant(n, 5));

  for (int j = 0; j < N; ++j) {
    for (int i = 0; i < N; ++i) {
      int col = j * N + i;

      // Bottom neighbor
      if (j > 0) mat.insert(col - N, col) = -1.0;
      // Left neighbor
      if (i > 0) mat.insert(col - 1, col) = -1.0;
      // Diagonal
      mat.insert(col, col) = 4.0;
      // Right neighbor
      if (i < N - 1) mat.insert(col + 1, col) = -1.0;
      // Top neighbor
      if (j < N - 1) mat.insert(col + N, col) = -1.0;
    }
  }

  mat.makeCompressed();
  return mat;
}

// Assemble 3D Poisson Laplacian (7-point stencil on N x N x N grid)
Eigen::SparseMatrix<double> generatePoisson3D(int N) {
  int n = N * N * N;
  int N2 = N * N;
  Eigen::SparseMatrix<double> mat(n, n);
  mat.reserve(Eigen::VectorXi::Constant(n, 7));

  for (int k = 0; k < N; ++k) {
    for (int j = 0; j < N; ++j) {
      for (int i = 0; i < N; ++i) {
        int col = k * N2 + j * N + i;

        // Front neighbor
        if (k > 0) mat.insert(col - N2, col) = -1.0;
        // Bottom neighbor
        if (j > 0) mat.insert(col - N, col) = -1.0;
        // Left neighbor
        if (i > 0) mat.insert(col - 1, col) = -1.0;
        // Diagonal
        mat.insert(col, col) = 6.0;
        // Right neighbor
        if (i < N - 1) mat.insert(col + 1, col) = -1.0;
        // Top neighbor
        if (j < N - 1) mat.insert(col + N, col) = -1.0;
        // Back neighbor
        if (k < N - 1) mat.insert(col + N2, col) = -1.0;
      }
    }
  }

  mat.makeCompressed();
  return mat;
}

void benchmarkProblem(
    const std::string& probName,
    const Eigen::SparseMatrix<double>& A,
    double tol,
    int maxItersArg,
    bool isQuick,
    std::vector<BenchmarkRecord>& records
) {
  int n = static_cast<int>(A.rows());
  int nnz = static_cast<int>(A.nonZeros());

  Eigen::VectorXd b = Eigen::VectorXd::Constant(n, 1.0);
  double bNorm = b.norm();
  if (bNorm <= 0.0) bNorm = 1.0;

  // 1. SpMV Benchmark
  {
    Eigen::VectorXd x = Eigen::VectorXd::Constant(n, 1.0);
    Eigen::VectorXd y(n);

    // Warm-up
    y = A * x;
    y = A * x;

    int runs = isQuick ? 20 : 50;
    auto t0 = Clock::now();
    for (int r = 0; r < runs; ++r) {
      y.noalias() = A * x;
    }
    auto t1 = Clock::now();
    double totalMs = elapsedMs(t0, t1);
    double avgMs = totalMs / runs;
    double opsSec = runs / (totalMs / 1000.0);
    double mflops = (2.0 * nnz) / (avgMs * 1000.0);

    records.push_back({probName, "SpMV (A * x)", n, nnz, avgMs, opsSec, mflops, -1, -1.0});
  }

  // 2. Direct Cholesky: SimplicialLDLT
  {
    Eigen::SimplicialLDLT<Eigen::SparseMatrix<double>> solver;

    // Factorization
    auto t0 = Clock::now();
    solver.compute(A);
    auto t1 = Clock::now();
    double factMs = elapsedMs(t0, t1);

    if (solver.info() == Eigen::Success) {
      // Solve
      auto t2 = Clock::now();
      Eigen::VectorXd x = solver.solve(b);
      auto t3 = Clock::now();
      double solveMs = elapsedMs(t2, t3);

      double resNorm = (A * x - b).norm() / bNorm;

      records.push_back({probName, "SimplicialLDLT (Fact)", n, nnz, factMs, 1000.0 / factMs, -1.0, -1, -1.0});
      records.push_back({probName, "SimplicialLDLT (Solve)", n, nnz, solveMs, 1000.0 / solveMs, -1.0, 1, resNorm});
    }
  }

  // 3. Direct Cholesky: SimplicialLLT
  {
    Eigen::SimplicialLLT<Eigen::SparseMatrix<double>> solver;

    // Factorization
    auto t0 = Clock::now();
    solver.compute(A);
    auto t1 = Clock::now();
    double factMs = elapsedMs(t0, t1);

    if (solver.info() == Eigen::Success) {
      // Solve
      auto t2 = Clock::now();
      Eigen::VectorXd x = solver.solve(b);
      auto t3 = Clock::now();
      double solveMs = elapsedMs(t2, t3);

      double resNorm = (A * x - b).norm() / bNorm;

      records.push_back({probName, "SimplicialLLT (Fact)", n, nnz, factMs, 1000.0 / factMs, -1.0, -1, -1.0});
      records.push_back({probName, "SimplicialLLT (Solve)", n, nnz, solveMs, 1000.0 / solveMs, -1.0, 1, resNorm});
    }
  }

  // 4. Iterative Solver: Conjugate Gradient (CG)
  {
    int maxIters = (maxItersArg > 0) ? maxItersArg : 2 * n;
    Eigen::ConjugateGradient<Eigen::SparseMatrix<double>,
                             Eigen::Lower | Eigen::Upper,
                             Eigen::DiagonalPreconditioner<double>> cg;
    cg.setMaxIterations(maxIters);
    cg.setTolerance(tol);

    auto t0 = Clock::now();
    cg.compute(A);
    Eigen::VectorXd x = cg.solve(b);
    auto t1 = Clock::now();
    double timeMs = elapsedMs(t0, t1);
    int iters = static_cast<int>(cg.iterations());

    double resNorm = (A * x - b).norm() / bNorm;
    double mflops = (2.0 * nnz * iters) / (timeMs * 1000.0);

    records.push_back({probName, "ConjugateGradient", n, nnz, timeMs, 1000.0 / timeMs, mflops, iters, resNorm});
  }

  // 5. Iterative Solver: BiCGSTAB
  {
    int maxIters = (maxItersArg > 0) ? maxItersArg : 2 * n;
    Eigen::BiCGSTAB<Eigen::SparseMatrix<double>,
                    Eigen::DiagonalPreconditioner<double>> bicg;
    bicg.setMaxIterations(maxIters);
    bicg.setTolerance(tol);

    auto t0 = Clock::now();
    bicg.compute(A);
    Eigen::VectorXd x = bicg.solve(b);
    auto t1 = Clock::now();
    double timeMs = elapsedMs(t0, t1);
    int iters = static_cast<int>(bicg.iterations());

    double resNorm = (A * x - b).norm() / bNorm;
    double mflops = (4.0 * nnz * iters) / (timeMs * 1000.0);

    records.push_back({probName, "BiCGSTAB", n, nnz, timeMs, 1000.0 / timeMs, mflops, iters, resNorm});
  }
}

int main(int argc, char** argv) {
  bool isQuick = false;
  bool jsonOutput = false;
  int dim2D = -1;
  int dim3D = -1;
  double tol = 1e-6;
  int maxIters = -1;

  for (int i = 1; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg == "--quick") isQuick = true;
    else if (arg == "--full") isQuick = false;
    else if (arg == "--json") jsonOutput = true;
    else if (arg.rfind("--dim2d=", 0) == 0) dim2D = std::stoi(arg.substr(8));
    else if (arg.rfind("--dim3d=", 0) == 0) dim3D = std::stoi(arg.substr(8));
    else if (arg.rfind("--tol=", 0) == 0) tol = std::stod(arg.substr(6));
    else if (arg.rfind("--max_iters=", 0) == 0) maxIters = std::stoi(arg.substr(12));
  }

  if (dim2D <= 0 && dim3D <= 0) {
    dim2D = isQuick ? 50 : 100;
    dim3D = isQuick ? 15 : 25;
  }

  std::vector<BenchmarkRecord> records;

  if (dim2D > 0) {
    std::string name = "Poisson 2D (N=" + std::to_string(dim2D) + ")";
    Eigen::SparseMatrix<double> A = generatePoisson2D(dim2D);
    benchmarkProblem(name, A, tol, maxIters, isQuick, records);
  }

  if (dim3D > 0) {
    std::string name = "Poisson 3D (N=" + std::to_string(dim3D) + ")";
    Eigen::SparseMatrix<double> A = generatePoisson3D(dim3D);
    benchmarkProblem(name, A, tol, maxIters, isQuick, records);
  }

  if (jsonOutput) {
    std::cout << "[\n";
    for (size_t i = 0; i < records.size(); ++i) {
      const auto& r = records[i];
      std::cout << "  {\n"
                << "    \"problem\": \"" << r.problem << "\",\n"
                << "    \"op\": \"" << r.op << "\",\n"
                << "    \"n\": " << r.n << ",\n"
                << "    \"nnz\": " << r.nnz << ",\n"
                << "    \"timeMs\": " << std::fixed << std::setprecision(4) << r.timeMs << ",\n"
                << "    \"opsSec\": " << std::fixed << std::setprecision(1) << r.opsSec << ",\n"
                << "    \"mflops\": " << (r.mflops > 0 ? std::to_string(r.mflops) : "\"-\"") << ",\n"
                << "    \"iters\": " << (r.iters > 0 ? std::to_string(r.iters) : "\"-\"") << ",\n"
                << "    \"residual\": " << (r.residual >= 0 ? std::to_string(r.residual) : "\"-\"") << "\n"
                << "  }" << (i + 1 < records.size() ? "," : "") << "\n";
    }
    std::cout << "]\n";
  } else {
    std::cout << "Native C++ Benchmark Completed with " << records.size() << " records.\n";
  }

  return 0;
}

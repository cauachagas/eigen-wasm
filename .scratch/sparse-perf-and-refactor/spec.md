# Specification: Sparse Matrix Validation Refactor and Poisson Benchmarks

**Status:** ready-for-agent  
**Initiative ID:** `kp-d7bc10719bea4f5e8b4ecf20c2a2291e`  
**Area:** `eigen-wasm` (Sparse Modules, Optimization and Verification)

---

## Problem Statement

Durante o ciclo de desenvolvimento das fases de matrizes esparsas (`sparse` e `sparse-solvers`), foram introduzidas rotinas para transposição, escalonamento, soma, SpMV, SpMM, fatoração de Cholesky (`SimplicialLDLT`, `SimplicialLLT`) e solvers iterativos (`ConjugateGradient`, `BiCGSTAB`).

Embora a cobertura e a integridade de testes estejam em 100%, identificou-se um acúmulo de duplicação de código (debt técnico) no cabeçalho `src/sparse_wasm.hpp`: cada uma das funções de exportação Wasm repete blocos idênticos de validação estrutural (`validSparseDim`, `validSparseNnz`, `validCompressedStructure`, `allFinite`), aumentando a probabilidade de divergência em manutenções futuras.

Adicionalmente, o repositório não dispõe atualmente de uma suíte formal de benchmarks para quantificar a eficiência de tempo de execução, taxa de transferência (throughput em ops/s), MFLOPS e taxa de convergência para problemas canônicos de equações diferenciais parciais (como a equação de Poisson discretizada em 2D e 3D) executados em WebAssembly no Node.js, nem para avaliar seu overhead relativo frente a binários nativos C++ compilados com otimização total (`-O3`).

---

## Solution

1. **Refatoração Unificada de Validação Esparsa (Debt Técnico):**
   - Extrair e consolidar a checagem repetitiva em uma rotina utilitária booleana inline `validateSparseMatrix(...)` em `src/sparse_wasm.hpp`.
   - Garantir compatibilidade estrita com os formatos comprimidos CSC e CSR.
   - Preservar sem exceção o **Invariante do Buffer de Saída Intocado**: qualquer falha estrutural, dimensional ou numérica retorna imediatamente `3` (`InvalidInput`), sem mutação dos dados do chamador.
   - Assegurar zero regressão através da execução contínua de todas as 29 suítes de teste existentes.

2. **Suíte Dedicada de Benchmarks Poisson (Performance e Métricas):**
   - Criar `bench/bench_poisson.js` acessível pelo comando `npm run bench`.
   - Implementar geradores eficientes de matrizes esparsas laplacianas de Poisson em formato CSC/CSR para grades 2D (5 pontos) e 3D (7 pontos).
   - Avaliar todo o pipeline esparso: SpMV (A * x), Fatoração e Solução com Cholesky Direto (`SimplicialLDLT`, `SimplicialLLT`) e Solvers Iterativos (`ConjugateGradient`, `BiCGSTAB`).
   - Apresentar relatórios claros em tabela ASCII com métricas de tempo (ms), throughput, MFLOPS estimados, iterações e resíduo relativo (`||A * x - b|| / ||b||`).
   - Fornecer presets `--quick` (CI) e `--full` (produção), além de parâmetros livres via CLI (`--dim2d=N`, `--dim3d=N`, `--tol=1e-6`, `--max_iters=1000`).
   - Disponibilizar harness C++ nativo opcional em `bench/native_poisson.cpp` para comparação lado a lado (Wasm vs Nativo) quando um compilador local estiver disponível.

---

## User Stories

1. As a WebAssembly consumer, I want consistent validation logic across all sparse routines, so that invalid sparse dimensions, corrupted pointers, or non-finite numbers always fail safely with code 3 without corrupting output memory.
2. As a core library maintainer, I want a single utility function `validateSparseMatrix` in `src/sparse_wasm.hpp`, so that any new sparse feature or bug fix shares the same validated invariants without code duplication.
3. As a developer evaluating WebAssembly performance, I want a dedicated `npm run bench` command, so that I can benchmark real-world sparse workloads (2D and 3D Poisson problems) without polluting fast unit test runs.
4. As a performance engineer, I want to measure execution time, throughput (ops/s), and estimated MFLOPS for Sparse Matrix-Vector multiplication (SpMV), so that memory-bound throughput can be profiled across different grid resolutions.
5. As a numerical analyst, I want to evaluate direct factorization and solve timings for `SimplicialLDLT` and `SimplicialLLT`, so that Cholesky performance on symmetric positive-definite systems is quantified in Wasm.
6. As a numerical analyst, I want to profile iterative solvers (`ConjugateGradient` and `BiCGSTAB`), so that convergence rates, iteration counts, and relative residuals are systematically monitored.
7. As a CI/CD automation engineer, I want a `--quick` flag for benchmarks, so that fast sanity checks of performance can run in automated pipelines within seconds.
8. As a researcher, I want custom grid parameter flags (`--dim2d=N`, `--dim3d=N`, `--tol=1e-6`, `--max_iters=1000`), so that large custom discretizations can be stress-tested on demand.
9. As a systems developer, I want an optional native C++ benchmark baseline (`bench/native_poisson.cpp`), so that WebAssembly execution overhead can be compared directly against native -O3 native machine code.

---

## EARS Requirements

### Ubiquitous Requirements
1. The `eigen-wasm` sparse module shall provide a single unified function `validateSparseMatrix(...)` in `src/sparse_wasm.hpp` that validates row count, column count, non-zero entry count, structural monotonicity of compressed indices, and numerical finitude of all double values.
2. The benchmark runner shall output execution results in a human-readable ASCII table detailing problem dimension (N), non-zero count (NNZ), execution time in milliseconds, throughput, estimated MFLOPS, iterations to convergence, and relative residual norm.

### Event-driven Requirements
3. When `validateSparseMatrix(...)` detects an invalid dimension (`< 1` or `> 1000000`), invalid non-zero count (`< 0` or `> 10000000` or `> rows * cols`), non-finite floating-point entry (`NaN` or `Infinity`), null pointer, or non-monotonic compressed inner index, the function shall return `false`.
4. When any sparse C++ exported function receives `false` from `validateSparseMatrix(...)`, the function shall immediately return status code `3` (`InvalidInput`).
5. When `npm run bench` is executed without arguments, the benchmark runner shall execute the default benchmark suite using the `--full` preset grid sizes.
6. When `npm run bench` is executed with `--quick`, the benchmark runner shall execute reduced grid sizes suitable for fast verification (2.5k to 10k degrees of freedom).
7. When CLI flags `--dim2d=N`, `--dim3d=N`, `--tol=T`, or `--max_iters=M` are specified, the benchmark runner shall construct and solve systems matching those explicit dimensions and solver parameters.

### State-driven Requirements
8. While executing direct Cholesky benchmarks (`SimplicialLDLT` and `SimplicialLLT`), the benchmark harness shall record separate metrics for symbolic/numeric factorization and subsequent back-substitution solve phases.
9. While executing iterative solver benchmarks (`ConjugateGradient` and `BiCGSTAB`), the benchmark harness shall record total elapsed time, iterations performed, and final convergence status.

### Unwanted-behavior Requirements
10. If an input to any sparse operation fails structural or numerical validation, then the function shall leave caller output buffers completely unmodified.
11. If a native C++ compiler (`clang++` or `g++`) is not present in the local execution environment, then the benchmark runner shall gracefully skip the native comparison pass and report WebAssembly results without error.

### Optional-feature Requirements
12. Where a compatible native C++ compiler is available in the environment, the benchmark system shall compile and execute `bench/native_poisson.cpp` and present side-by-side comparative speedup ratios (Wasm versus Native).

---

## Implementation Decisions

1. **Modular Validation Helper Signature:**
   - Define in `src/sparse_wasm.hpp`:
     ```cpp
     static inline bool validateSparseMatrix(
         int rows, int cols, int nnz,
         const double* values, const int* innerIndices, const int* outerStarts,
         int storageOrder = StorageOrderCSC
     );
     ```
   - Encapsulate `validSparseDim`, `validSparseNnz`, `validCompressedStructure`, and `allFinite`.
   - Update `eigen_wasm_sparse_transpose`, `eigen_wasm_sparse_scale`, `eigen_wasm_sparse_add`, `eigen_wasm_sparse_spmm`, `eigen_wasm_sparse_spmv`, `eigen_wasm_sparse_cholesky_factorize`, `eigen_wasm_sparse_cg_solve`, and `eigen_wasm_sparse_bicgstab_solve` to call this unified helper.

2. **Poisson Matrix Generator in Node.js / Wasm:**
   - Implement Laplacian finite difference stencils:
     - 2D Poisson: 5-point stencil on N x N grid, dimension n = N^2, diagonal 4.0, neighbors -1.0.
     - 3D Poisson: 7-point stencil on N x N x N grid, dimension n = N^3, diagonal 6.0, neighbors -1.0.
   - Assemble directly into valid CSC compressed arrays (`values`, `innerIndices`, `outerStarts`) in JavaScript before passing to WebAssembly memory.

3. **Metrics Calculation:**
   - Elapsed Time: measured via `performance.now()`.
   - SpMV FLOPS: 2 * NNZ operations per multiplication.
   - Residual Norm: calculated as `||A * x - b|| / ||b||` where `||v|| = sqrt(sum(v_i^2))`.
   - Throughput: operations per second (`1000.0 / time_ms`).

4. **Dedicated Directory and NPM Command:**
   - Place harness in `bench/bench_poisson.js`.
   - Add `"bench": "node bench/bench_poisson.js"` to `package.json`.
   - Provide `bench/native_poisson.cpp` using identical problem parameters and Eigen types (`Eigen::SparseMatrix<double>`, `SimplicialLDLT`, `ConjugateGradient`).

---

## Testing Decisions

1. **Testing Seam for Validation Refactor:**
   - The seam remains the public WebAssembly ABI entrypoints in `test/eigen_wasm.js`.
   - Verification relies on existing suites (`test/test_sparse_validation.js`, `test/test_sparse_ops.js`, `test/test_sparse_spmv.js`, `test/test_sparse_spmm.js`, `test/test_sparse_add.js`, `test/test_sparse_cholesky_*.js`, `test/test_sparse_cg.js`, `test/test_sparse_bicgstab.js`, `test/test_sparse_solvers_integration.js`).
   - Acceptance criteria: 100% of the 29 test suites must pass without a single regression.

2. **Testing Seam for Benchmarking Suite:**
   - Test harness self-verification: `node bench/bench_poisson.js --quick` must complete with exit code 0 and output valid numeric results (positive times, valid non-zero counts, residual norms `<= 1e-5` for convergent solvers).

---

## Out of Scope

- Modifying the underlying upstream Eigen library files in `deps/eigen/`.
- Adding new matrix factorization types (e.g. SuperLU, PARDISO, or SparseLU) outside of Cholesky and iterative CG/BiCGSTAB.
- Preconditioners beyond Diagonal/Identity already covered in iterative solvers.
- GUI or browser charting (benchmarking outputs directly to terminal console and markdown).

---

## Further Notes

- All code and documentation must maintain strict compliance with REUSE/SPDX licensing (`MPL-2.0`).
- No LaTeX formatting shall be used in markdown, comments, or output tables.

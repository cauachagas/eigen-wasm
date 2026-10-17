# Especificação: Solvers Esparsos para WebAssembly (Fase 2)

Especificação técnica e requisitos funcionais para a implementação de Solvers Esparsos Diretos e Iterativos no `eigen-wasm`.

---

## 1. Visão Geral e Arquitetura

Esta especificação define a API C exportada para WebAssembly permitindo a resolução de sistemas lineares esparsos `A * x = b`:
1. **Solvers Diretos (Cholesky Esparsa):**
   - `sparseCholeskyFactorize`: Fatoração de Cholesky direta de matrizes simétricas positivas-definidas ou semidefinidas (SimplicialLDLT e SimplicialLLT) com reordenação Approximate Minimum Degree (AMD). Retorna um identificador opaco seguro (`int32_t handle`).
   - `sparseCholeskySolve`: Resolução do sistema `A * x = b` para um ou múltiplos vetores independentes (`nrhs >= 1`) utilizando a fatoração armazenada no handle.
   - `sparseCholeskyDestroy`: Liberação de recursos e invalidação do handle no registro C++.
2. **Solvers Iterativos (Métodos de Subespaço de Krylov):**
   - `sparseConjugateGradient`: Método do Gradiente Conjugado para sistemas simétricos positivos-definidos com pré-condicionamento diagonal Jacobi e diagnósticos de iterações/erro residual.
   - `sparseBiCGSTAB`: Método do Gradiente Biconjugado Estabilizado para sistemas quadrados gerais não-simétricos com pré-condicionamento diagonal Jacobi e diagnósticos de iterações/erro residual.

Todos os métodos operam com ponteiros alocados pelo chamador no heap do WebAssembly, preservando estritamente o invariante de buffers de saída intocados em caso de erro.

---

## 2. Requisitos EARS

### Grupo 1: Gerenciamento de Ciclo de Vida e Fatoração Cholesky Direta (SimplicialLDLT / SimplicialLLT)

- **REQ-SOLV-001 (Ubiquitous):**
  The eigen-wasm system shall maintain an internal instance registry mapping positive integer handles (1 .. N) to factorized direct sparse solver instances in WebAssembly memory.

- **REQ-SOLV-002 (Event-driven):**
  When `sparseCholeskyFactorize` is called with valid compressed sparse matrix buffers representing a square matrix of dimension `n` (where `1 <= n <= 1000000`), valid `nnz`, `solverType == 0` (SimplicialLDLT), and non-null `outHandle`, the system shall compute the `L * D * L^T` factorization with AMD ordering, store the solver instance in the internal registry, write the assigned handle to `outHandle`, and return 0 (Success).

- **REQ-SOLV-003 (Event-driven):**
  When `sparseCholeskyFactorize` is called with valid compressed sparse matrix buffers representing a symmetric positive-definite matrix of dimension `n` (where `1 <= n <= 1000000`), valid `nnz`, `solverType == 1` (SimplicialLLT), and non-null `outHandle`, the system shall compute the `L * L^T` factorization with AMD ordering, store the solver instance in the internal registry, write the assigned handle to `outHandle`, and return 0 (Success).

- **REQ-SOLV-004 (Unwanted-behavior):**
  If `sparseCholeskyFactorize` receives null pointers for any matrix buffer, non-null `outHandle` with invalid dimensions (`n < 1` or `n > 1000000`), `nnz < 0`, invalid `storageOrder`, or invalid `solverType` (not 0 or 1), then the system shall return 3 (InvalidInput) and leave `outHandle` unmodified.

- **REQ-SOLV-005 (Unwanted-behavior):**
  If `sparseCholeskyFactorize` encounters non-finite matrix values (`NaN` or `Infinity`), or strictly non-monotonic inner indices within any slice, then the system shall return 3 (InvalidInput) and leave `outHandle` unmodified.

- **REQ-SOLV-006 (Unwanted-behavior):**
  If `sparseCholeskyFactorize` is called with `solverType == 1` (SimplicialLLT) on a matrix that fails positive-definiteness during numerical factorization, then the system shall return 1 (NumericalIssue), allocate no handle in the registry, and leave `outHandle` unmodified.

- **REQ-SOLV-007 (Event-driven):**
  When `sparseCholeskyDestroy` is called with a handle corresponding to an active factorized solver instance, the system shall deallocate the solver instance, remove the handle from the internal registry, and return 0 (Success).

- **REQ-SOLV-008 (Unwanted-behavior):**
  If `sparseCholeskyDestroy` is called with a handle that is non-positive or does not exist in the active registry, then the system shall return 3 (InvalidInput).

---

### Grupo 2: Resolução Direta via Handle (sparseCholeskySolve)

- **REQ-SOLV-009 (Event-driven):**
  When `sparseCholeskySolve` is called with an active handle, a non-null right-hand side buffer `b`, `nrhs >= 1`, and a non-null destination buffer `outX`, the system shall solve `A * X = B` using the cached factorization, write the solution in row-major order (`n * nrhs` doubles) to `outX`, and return 0 (Success).

- **REQ-SOLV-010 (Unwanted-behavior):**
  If `sparseCholeskySolve` is called with an inactive or non-existent handle, a null `b` pointer, a null `outX` pointer, or `nrhs < 1`, then the system shall return 3 (InvalidInput) and leave `outX` completely unmodified.

- **REQ-SOLV-011 (Unwanted-behavior):**
  If `sparseCholeskySolve` receives right-hand side values containing `NaN` or `Infinity`, then the system shall return 3 (InvalidInput) and leave `outX` completely unmodified.

- **REQ-SOLV-012 (Unwanted-behavior):**
  If the factorized system cannot be solved due to severe numerical singularity in forward/back substitution, then the system shall return 1 (NumericalIssue) and leave `outX` completely unmodified.

---

### Grupo 3: Solver Iterativo Conjugate Gradient (sparseConjugateGradient)

- **REQ-SOLV-013 (Event-driven):**
  When `sparseConjugateGradient` is called with valid compressed sparse matrix buffers representing a symmetric positive-definite matrix of dimension `n` (`1 <= n <= 1000000`), non-null `b`, `nrhs >= 1`, non-null `outX`, `maxIterations >= 0`, `tolerance >= 0.0`, and optional non-null diagnostic pointers `outIterations` and `outEstimatedError`, the system shall iteratively compute the solution `x` starting from `x0 = 0` using diagonal Jacobi preconditioning, write the solution to `outX`, write the executed iteration count to `outIterations` (if non-null), write the achieved relative residual error to `outEstimatedError` (if non-null), and return 0 (Success).

- **REQ-SOLV-014 (State-driven):**
  While executing `sparseConjugateGradient`, if `maxIterations <= 0`, the system shall default the iteration limit to `2 * n`.

- **REQ-SOLV-015 (State-driven):**
  While executing `sparseConjugateGradient`, if `tolerance <= 0.0`, the system shall default the convergence tolerance to machine epsilon (`Eigen::NumTraits<double>::epsilon()`).

- **REQ-SOLV-016 (Unwanted-behavior):**
  If `sparseConjugateGradient` exhausts the maximum iteration budget without achieving the specified tolerance, then the system shall write the best-effort solution to `outX`, write the final iterations and error to the diagnostic pointers (if provided), and return 2 (NoConvergence).

- **REQ-SOLV-017 (Unwanted-behavior):**
  If `sparseConjugateGradient` receives null pointers for matrix buffers, null `b`, null `outX`, invalid dimension `n < 1` or `n > 1000000`, `nnz < 0`, invalid `storageOrder`, non-monotonic inner indices, non-finite values in matrix or `b`, or `nrhs < 1`, then the system shall return 3 (InvalidInput) and leave `outX`, `outIterations` and `outEstimatedError` completely unmodified.

---

### Grupo 4: Solver Iterativo BiCGSTAB (sparseBiCGSTAB)

- **REQ-SOLV-018 (Event-driven):**
  When `sparseBiCGSTAB` is called with valid compressed sparse matrix buffers representing a square matrix of dimension `n` (`1 <= n <= 1000000`), non-null `b`, `nrhs >= 1`, non-null `outX`, `maxIterations >= 0`, `tolerance >= 0.0`, and optional non-null diagnostic pointers `outIterations` and `outEstimatedError`, the system shall iteratively compute the solution `x` starting from `x0 = 0` using diagonal Jacobi preconditioning, write the solution to `outX`, write the executed iteration count to `outIterations` (if non-null), write the achieved relative residual error to `outEstimatedError` (if non-null), and return 0 (Success).

- **REQ-SOLV-019 (State-driven):**
  While executing `sparseBiCGSTAB`, if `maxIterations <= 0`, the system shall default the iteration limit to `2 * n`.

- **REQ-SOLV-020 (State-driven):**
  While executing `sparseBiCGSTAB`, if `tolerance <= 0.0`, the system shall default the convergence tolerance to machine epsilon (`Eigen::NumTraits<double>::epsilon()`).

- **REQ-SOLV-021 (Unwanted-behavior):**
  If `sparseBiCGSTAB` exhausts the maximum iteration budget without achieving the specified tolerance, then the system shall write the best-effort solution to `outX`, write the final iterations and error to the diagnostic pointers (if provided), and return 2 (NoConvergence).

- **REQ-SOLV-022 (Unwanted-behavior):**
  If `sparseBiCGSTAB` receives null pointers for matrix buffers, null `b`, null `outX`, invalid dimension `n < 1` or `n > 1000000`, `nnz < 0`, invalid `storageOrder`, non-monotonic inner indices, non-finite values in matrix or `b`, or `nrhs < 1`, then the system shall return 3 (InvalidInput) and leave `outX`, `outIterations` and `outEstimatedError` completely unmodified.

- **REQ-SOLV-023 (Unwanted-behavior):**
  If `sparseBiCGSTAB` encounters numerical breakdown (such as division by zero or NaN during orthogonalization updates), then the system shall return 1 (NumericalIssue) and leave `outX`, `outIterations` and `outEstimatedError` completely unmodified.

---

### Grupo 5: Validação, Limites e Invariantes Numéricos

- **REQ-SOLV-024 (Ubiquitous):**
  The eigen-wasm system shall preserve caller-supplied output buffers (`outHandle`, `outX`, `outIterations`, `outEstimatedError`) unmodified on every error path returning non-zero status (`1` - NumericalIssue or `3` - InvalidInput).

- **REQ-SOLV-025 (Ubiquitous):**
  The eigen-wasm system shall support matrices with dimension up to 1,000,000 and non-zero counts up to 10,000,000 without crashing, returning 3 (InvalidInput) if dimensions or NNZ exceed capacity or if memory allocation fails.

- **REQ-SOLV-026 (Ubiquitous):**
  The eigen-wasm system shall support both CSC (`storageOrder == 0`) and CSR (`storageOrder == 1`) formats for all direct and iterative sparse solvers.

---

## 3. Declarações C ABI

```cpp
// Direct Sparse Cholesky Solvers (Handle-based lifecycle)
EMSCRIPTEN_KEEPALIVE
int sparseCholeskyFactorize(
    const double* values,
    const int32_t* innerIndices,
    const int32_t* outerStarts,
    int32_t n,
    int32_t nnz,
    int32_t storageOrder,
    int32_t solverType, // 0 = SimplicialLDLT, 1 = SimplicialLLT
    int32_t* outHandle
);

EMSCRIPTEN_KEEPALIVE
int sparseCholeskySolve(
    int32_t handle,
    const double* b,
    int32_t nrhs,
    double* outX
);

EMSCRIPTEN_KEEPALIVE
int sparseCholeskyDestroy(
    int32_t handle
);

// Iterative Sparse Solvers (Stateless One-Shot)
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
);

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
);
```

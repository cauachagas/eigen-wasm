# 03: Iterative Sparse Solver: Conjugate Gradient (CG)

**What to build:** Implementação da rotina iterativa stateless `sparseConjugateGradient` utilizando o algoritmo do Gradiente Conjugado de Krylov com pré-condicionamento diagonal Jacobi para matrizes esparsas simétricas positivas-definidas. A função deve resolver `A * x = b` partindo da estimativa inicial nula (`x0 = 0`), aceitar limites de iteração (`maxIterations`) e tolerância (`tolerance`), suportar múltiplos lados direitos (`nrhs >= 1` em layout row-major), e preencher os diagnósticos opcionais de saída `outIterations` e `outEstimatedError`. Deve aderir aos requisitos REQ-SOLV-013 até REQ-SOLV-017, retornando `0` (Success), `2` (NoConvergence) ou `3` (InvalidInput), mantendo o invariante de buffers intocados em caso de erro.

**Blocked by:** none

**Status:** resolved

- [x] Implementar a rotina C exportada `sparseConjugateGradient(values, innerIndices, outerStarts, n, nnz, storageOrder, b, nrhs, outX, maxIterations, tolerance, outIterations, outEstimatedError)` em `src/sparse_wasm.hpp`.
- [x] Configurar `Eigen::ConjugateGradient<Eigen::SparseMatrix<double>, Eigen::Lower|Eigen::Upper, Eigen::DiagonalPreconditioner<double>>`.
- [x] Aplicar valores padrão (`2 * n` para `maxIterations <= 0`, machine epsilon para `tolerance <= 0.0`).
- [x] Adaptar testes unitários a partir de `deps/eigen/test/conjugate_gradient.cpp` criando `test/test_sparse_cg.js`.
- [x] Validar convergência para sistema esparso SPD com verificação de resíduo `||A * x - b|| / ||b|| <= tol`.
- [x] Validar comportamento com múltiplos lados direitos (`nrhs > 1`).
- [x] Validar retorno de `NoConvergence` (2) quando `maxIterations` for insuficiente para atingir a tolerância.
- [x] Validar retorno de `InvalidInput` (3) com buffers intocados para ponteiros nulos ou dados inválidos.

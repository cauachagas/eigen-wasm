# 04: Iterative Sparse Solver: BiCGSTAB

**What to build:** Implementação da rotina iterativa stateless `sparseBiCGSTAB` utilizando o algoritmo do Gradiente Biconjugado Estabilizado com pré-condicionamento diagonal Jacobi para sistemas esparsos quadrados gerais (não-simétricos e indefinidos). A função deve resolver `A * x = b` partindo da estimativa inicial nula (`x0 = 0`), aceitar limites de iteração (`maxIterations`) e tolerância (`tolerance`), suportar múltiplos lados direitos (`nrhs >= 1` em layout row-major), e preencher os diagnósticos de saída `outIterations` e `outEstimatedError`. Deve satisfazer REQ-SOLV-018 até REQ-SOLV-023, retornando `0` (Success), `1` (NumericalIssue em caso de colapso numérico), `2` (NoConvergence) ou `3` (InvalidInput), mantendo o invariante de buffers intocados em falha.

**Blocked by:** none

**Status:** resolved

- [x] Implementar a rotina C exportada `sparseBiCGSTAB(values, innerIndices, outerStarts, n, nnz, storageOrder, b, nrhs, outX, maxIterations, tolerance, outIterations, outEstimatedError)` em `src/sparse_wasm.hpp`.
- [x] Configurar `Eigen::BiCGSTAB<Eigen::SparseMatrix<double>, Eigen::DiagonalPreconditioner<double>>`.
- [x] Aplicar valores padrão (`2 * n` para `maxIterations <= 0`, machine epsilon para `tolerance <= 0.0`).
- [x] Adaptar testes unitários a partir de `deps/eigen/test/bicgstab.cpp` criando `test/test_sparse_bicgstab.js`.
- [x] Validar convergência para sistema esparso quadrado não-simétrico com checagem de resíduo.
- [x] Validar comportamento com múltiplos lados direitos (`nrhs > 1`).
- [x] Validar retorno de `NoConvergence` (2) sob orçamento insuficiente de iterações.
- [x] Validar detecção de colapso numérico ou quebra de divisão por zero retornando `NumericalIssue` (1).
- [x] Validar retorno de `InvalidInput` (3) com buffers intocados para ponteiros nulos ou dados inválidos.

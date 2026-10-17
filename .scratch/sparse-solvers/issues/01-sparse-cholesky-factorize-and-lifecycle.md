# 01: Sparse Cholesky Factorization and Instance Registry

**What to build:** Implementação da infraestrutura de gerenciamento de instâncias (`Opaque Handle`) e das funções de ciclo de vida para fatoração direta de Cholesky esparsa: `sparseCholeskyFactorize` e `sparseCholeskyDestroy`. A rotina `sparseCholeskyFactorize` deve suportar `solverType == 0` (SimplicialLDLT) e `solverType == 1` (SimplicialLLT) com reordenação AMD, alocando a instância em um registro interno e retornando um identificador inteiro positivo seguro (`outHandle`). Deve validar estritamente ponteiros, dimensões, monotonicidade de índices e positiva-definidade (para LLT), satisfazendo REQ-SOLV-001 até REQ-SOLV-008 e o invariante de buffer intocado em falha.

**Blocked by:** none

**Status:** resolved

- [x] Implementar a tabela/registro de instâncias para mapear identificadores `int32_t` a `Eigen::SimplicialLDLT` / `Eigen::SimplicialLLT` em `src/sparse_wasm.hpp`.
- [x] Implementar a rotina C exportada `sparseCholeskyFactorize(values, innerIndices, outerStarts, n, nnz, storageOrder, solverType, outHandle)`.
- [x] Implementar a rotina C exportada `sparseCholeskyDestroy(handle)`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/simplicial_cholesky.cpp` criando `test/test_sparse_cholesky_lifecycle.js`.
- [x] Validar fatoração com sucesso para SimplicialLDLT e SimplicialLLT em CSC e CSR.
- [x] Validar rejeição de matriz não positiva-definida no LLT com código 1 (`NumericalIssue`) e preservação de `outHandle`.
- [x] Validar ciclo completo de criação e destruição do handle, e rejeição de double destroy ou handle inválido com código 3 (`InvalidInput`).

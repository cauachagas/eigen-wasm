# 04: Sparse Scalar Scaling and Transposition

**What to build:** Implementação da multiplicação por escalar `sparseScale` (`B = alpha * A`) e da transposição esparsa `sparseTranspose` (`B = A^T`). `sparseScale` preserva a estrutura de índices e suporta aliasing *in-place*. `sparseTranspose` inverte dimensões `rows` e `cols` mantendo o número de não-zeros `nnz`. Cumprir `REQ-SP-040` até `REQ-SP-052`.

**Blocked by:** 01

**Status:** resolved

- [x] Implementar a rotina C `sparseScale(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder, alpha, outValues, outInnerIndices, outOuterStarts)`.
- [x] Implementar a rotina C `sparseTranspose(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder, outValues, outInnerIndices, outOuterStarts)`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/sparse_basic.cpp` gerando `test/test_sparse_ops.js`.
- [x] Validar scaling com valores positivos, negativos e zero.
- [x] Validar suporte a in-place scaling (aliasing de buffers de entrada e saída).
- [x] Validar transposição para matrizes CSC e CSR e checagem de simetria (`A == (A^T)^T`).
- [x] Validar retorno de `InvalidInput` (3) e preservação de buffers intocados em caso de dados inválidos.

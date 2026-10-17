# 03: Sparse Matrix Addition with Two-Pass Allocation

**What to build:** Implementação da soma de matrizes esparsas `C = A + B` utilizando o padrão de alocação em dois passos (*two-pass sparse allocation*): `sparseAddGetNnz` para obter o número exato de não-zeros da matriz resultante `C`, seguido de `sparseAdd` para escrever os buffers `outValues`, `outInnerIndices` e `outOuterStarts`. Cumprir `REQ-SP-030` até `REQ-SP-033`.

**Blocked by:** 01

**Status:** resolved

- [x] Implementar a rotina de consulta C `sparseAddGetNnz(rows, cols, nnzA, aValues, aInnerIndices, aOuterStarts, nnzB, bValues, bInnerIndices, bOuterStarts, storageOrder, outNnz)`.
- [x] Implementar a rotina de execução C `sparseAdd(rows, cols, nnzA, aValues, aInnerIndices, aOuterStarts, nnzB, bValues, bInnerIndices, bOuterStarts, storageOrder, outValues, outInnerIndices, outOuterStarts)`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/sparse_basic.cpp` gerando `test/test_sparse_add.js`.
- [x] Validar a adição com padrões de esparsidade idênticos, disjuntos e parcialmente sobrepostos.
- [x] Validar cancelamento de termos que resultem em zero.
- [x] Validar retorno de `InvalidInput` (3) e preservação de buffers intocados em caso de dimensões divergentes ou parâmetros nulos.

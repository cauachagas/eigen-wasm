# 02: Sparse Matrix-Vector (SpMV) and Sparse-Dense (SpMM) Products

**What to build:** Implementação das rotinas de multiplicação `sparseMatMulVec` (`y = A * x`) e `sparseMatMulDense` (`C = A * B`, onde B e C são densas em row-major). A execução deve suportar storageOrder CSC e CSR, validar dimensões e ponteiros, preservar o buffer de saída intacto em falhas e cumprir `REQ-SP-010` até `REQ-SP-022`.

**Blocked by:** 01

**Status:** resolved

- [x] Implementar a rotina C exportada `sparseMatMulVec(rows, cols, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder, x, outY)`.
- [x] Implementar a rotina C exportada `sparseMatMulDense(rowsA, colsA, colsB, nnz, aValues, aInnerIndices, aOuterStarts, storageOrder, b, outC)`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/sparse_product.cpp` gerando `test/test_sparse_spmv.js` e `test/test_sparse_spmm.js`.
- [x] Validar SpMV contra vetores conhecidos com matrizes CSC e CSR.
- [x] Validar SpMM contra matrizes densas arbitrárias.
- [x] Validar retorno de `InvalidInput` (3) e preservação de `outY` e `outC` intocados em caso de dados inválidos ou incompatibilidade de dimensões.

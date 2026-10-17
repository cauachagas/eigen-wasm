# 01: Sparse Data Types, Utilities and Triplet Assembly

**What to build:** Implementação da infraestrutura base para matrizes esparsas em `src/sparse_wasm.hpp` (ou `src/sparse_wasm.cpp`), tipos de armazenamento CSC (`storageOrder == 0`) e CSR (`storageOrder == 1`), validação de ponteiros/bounds e rotina `sparseFromTriplets()`. A montagem deve converter vetores de coordenadas `(row, col, value)` em buffers comprimidos contíguos (`outValues`, `outInnerIndices`, `outOuterStarts`, `outNnz`), somando automaticamente duplicatas e respeitando `REQ-SP-001` até `REQ-SP-007`.

**Blocked by:** none

**Status:** resolved

- [x] Criar `src/sparse_wasm.hpp` contendo os wrappers e adaptadores de `Eigen::SparseMatrix` e validações de integridade.
- [x] Implementar a rotina C exportada `sparseFromTriplets(rows, cols, tripletCount, tripletRows, tripletCols, tripletValues, storageOrder, outValues, outInnerIndices, outOuterStarts, outNnz)`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/sparse_basic.cpp` gerando `test/test_sparse_triplets.js`.
- [x] Validar conversão para CSC (`storageOrder == 0`) e CSR (`storageOrder == 1`).
- [x] Validar soma automática de duplicatas em coordenadas idênticas.
- [x] Validar retorno de `InvalidInput` (3) para ponteiros nulos, bounds inválidos e preservação de buffers intocados.

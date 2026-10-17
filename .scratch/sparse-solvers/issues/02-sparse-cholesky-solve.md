# 02: Direct Sparse Cholesky Solve via Opaque Handle

**What to build:** Implementação da rotina de resolução direta `sparseCholeskySolve` consumindo uma fatoração pré-computada referenciada por um `handle` opaco. A função deve resolver `A * X = B` para vetores ou matrizes densas no lado direito (`nrhs >= 1` em layout row-major), escrevendo os resultados diretamente no buffer `outX` (`n * nrhs` doubles). Deve validar se o handle existe no registro ativo, checar ponteiros, bounds e dados finitos, e respeitar rigorosamente REQ-SOLV-009 até REQ-SOLV-012, preservando o buffer `outX` intocado em caso de falha.

**Blocked by:** 01-sparse-cholesky-factorize-and-lifecycle.md

**Status:** resolved

- [x] Implementar a rotina C exportada `sparseCholeskySolve(handle, b, nrhs, outX)` em `src/sparse_wasm.hpp`.
- [x] Suportar forward e back-substitution eficiente sobre `Eigen::SimplicialLDLT` e `Eigen::SimplicialLLT` mapeando matrizes/vetores row-major para `b` e `outX`.
- [x] Adaptar testes unitários a partir de `deps/eigen/test/simplicial_cholesky.cpp` criando `test/test_sparse_cholesky_solve.js`.
- [x] Validar resolução exata de `A * x = b` com vetor único (`nrhs = 1`) para LDLT e LLT.
- [x] Validar resolução com múltiplos lados direitos (`nrhs > 1`) em row-major.
- [x] Validar reuso do mesmo handle em múltiplas chamadas consecutivas de `sparseCholeskySolve` com diferentes vetores `b`.
- [x] Validar retorno de `InvalidInput` (3) com buffer `outX` intocado para handle inexistente, ponteiros nulos ou dados contendo `NaN`/`Infinity`.

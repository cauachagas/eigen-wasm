# 021: Transformações e Reduções Matriciais (transpose, trace, matrixNorm)

**What to build:** Exportar rotinas `transpose`, `trace` e `matrixNorm` em `wasm/eigen_wasm.cpp`. Permitir transposição direta de matrizes retangulares (`rows x cols` para `cols x rows`), cálculo de traço (soma da diagonal de matriz quadrada) e cálculo de normas induzidas/elementares (norma de Frobenius, norma 1 e norma infinito). Validar com a suíte `wasm/test_matrix_ops.js` adaptada dos testes C++ upstream (`test/matrix.cpp`, `test/array.cpp`), cobrindo casos analíticos, matrizes retangulares, teto de 2048 e preservação de sentinelas em falha.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Implementar `transpose(const double* a, int rows, int cols, double* out)` com guardas `validDim(rows, cols)`
- [x] Implementar `trace(const double* a, int n, double* out)` com guardas `validDim(n)`
- [x] Implementar `matrixNorm(const double* a, int rows, int cols, int norm_type, double* out)` onde norm_type suporta Frobenius (0), 1-norm (1) e inf-norm (2)
- [x] Criar a suíte `wasm/test_matrix_ops.js` adaptando matrizes de teste de `test/matrix.cpp`
- [x] Validar preservação de sentinelas em falhas e rejeição de entradas inválidas
- [x] Teste passando 100% via Node.js

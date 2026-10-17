# 019: Solvers Especializados (solveCholesky e Triangulares)

**What to build:** Exportar rotinas `solveCholesky`, `solveTriangularLower` e `solveTriangularUpper` em `wasm/eigen_wasm.cpp`. Permitir resolver sistemas lineares simétricos positivos-definidos via LLT (`Eigen::LLT`) e sistemas triangulares por substituição direta (forward/backward substitution) em O(n^2). Validar com a suíte `wasm/test_dense_solvers.js` adaptada dos testes C++ upstream (`test/cholesky.cpp`, `test/triangular.cpp`), cobrindo tolerância de simetria, detecção de não-positiva-definida (`NumericalIssue`), zeros na diagonal para triangulares, teto de 2048 e invariante de buffers intocados em falha.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Implementar `solveCholesky(const double* a, const double* b, int n, double* out)` com checagens de simetria e positiva-definida
- [x] Implementar `solveTriangularLower(const double* l, const double* b, int n, bool unit_diag, double* out)`
- [x] Implementar `solveTriangularUpper(const double* u, const double* b, int n, bool unit_diag, double* out)`
- [x] Criar a suíte `wasm/test_dense_solvers.js` adaptando casos de teste de `test/cholesky.cpp` e `test/triangular.cpp`
- [x] Validar preservação de sentinelas em falhas e rejeição de entradas inválidas
- [x] Teste passando 100% via Node.js

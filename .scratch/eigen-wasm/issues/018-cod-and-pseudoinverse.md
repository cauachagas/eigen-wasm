# 018: Complete Orthogonal Decomposition & Pseudoinverse (COD)

**What to build:** Exportar rotinas `cod` e `pseudoInverse` em `wasm/eigen_wasm.cpp` usando `Eigen::CompleteOrthogonalDecomposition`. Permitir fatorização ortogonal completa de posto revelado para matrizes retangulares e cálculo robusto da inversa de Moore-Penrose. Validar com testes em `wasm/test_cod.js` adaptados dos testes C++ upstream (`test/qr_colpivoting.cpp`, `test/complete_orthogonal_decomposition.cpp`), cobrindo as 4 condições de Penrose (`A * A_pinv * A = A`, `A_pinv * A * A_pinv = A_pinv`, simetria de `A * A_pinv` e `A_pinv * A`), matrizes de posto deficiente, teto em 2048 e invariante de buffers intocados em falha.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Implementar `cod(const double* a, int rows, int cols, double* q_out, double* t_out, double* z_out, int* perm_out, int* rank_out)`
- [ ] Implementar `pseudoInverse(const double* a, int rows, int cols, double* pinv_out)`
- [ ] Criar a suíte `wasm/test_cod.js` adaptando matrizes de teste e tolerâncias de `test/qr_colpivoting.cpp`
- [ ] Validar preservação de sentinelas em falhas e rejeição de dimensões inválidas
- [ ] Teste passando 100% via Node.js

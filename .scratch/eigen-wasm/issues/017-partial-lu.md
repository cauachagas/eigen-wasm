# 017: Fast LU Solvers (PartialPivLU)

**What to build:** Exportar rotinas `solvePartialLU` e `invPartialLU` em `wasm/eigen_wasm.cpp` usando `Eigen::PartialPivLU`. Oferecer solução de sistemas e inversão de matrizes quadradas com complexidade O(n^3) e alta localidade de cache. Validar com testes em `wasm/test_partial_lu.js` adaptados dos testes C++ upstream (`test/lu.cpp`, `test/lu_decompose.cpp`), com checagens de resíduos, detecção de matrizes singulares (`NumericalIssue`), limites de dimensão (teto em 2048) e invariante de buffers intocados em falha.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Implementar `solvePartialLU(const double* a, const double* b, int n, double* out)` com guardas `validDim(n)` e verificação de invertibilidade/não-finitos
- [x] Implementar `invPartialLU(const double* a, int n, double* out)` com guardas `validDim(n)` e checagem de invertibilidade
- [x] Criar a suíte de testes `wasm/test_partial_lu.js` adaptando casos analíticos e casos singulares de `test/lu.cpp`
- [x] Validar preservação de sentinelas em falhas e rejeição para n <= 0 ou n > 2048
- [x] Teste passando 100% via Node.js

# 020: Múltiplos Lados Direitos (Matrix RHS)

**What to build:** Exportar rotinas `solveLUMatrix` e `solveLeastSquaresMatrix` em `wasm/eigen_wasm.cpp`. Permitir resolver sistemas lineares e mínimos quadrados da forma `A * X = B` onde `B` e `X` são matrizes retangulares row-major com parâmetro `nRHS`. Validar com a suíte `wasm/test_matrix_solvers.js` adaptada dos testes C++ upstream (`test/lu.cpp`, `test/qr.cpp`), cobrindo sistemas com múltiplos vetores de excitação/resposta, checagem de singularidade, teto de 2048 e invariante de buffers intocados em falha.

**Blocked by:** 017

**Status:** ready-for-agent

- [ ] Implementar `solveLUMatrix(const double* a, const double* b, int n, int nrhs, double* out)` via FullPivLU
- [ ] Implementar `solveLeastSquaresMatrix(const double* a, const double* b, int rows, int cols, int nrhs, double* x_out)` via HouseholderQR
- [ ] Criar a suíte `wasm/test_matrix_solvers.js` adaptando casos multivariados de `test/lu.cpp` e `test/qr.cpp`
- [ ] Validar preservação de sentinelas em falhas e rejeição para nrhs <= 0 ou dimensões fora de [1, 2048]
- [ ] Teste passando 100% via Node.js

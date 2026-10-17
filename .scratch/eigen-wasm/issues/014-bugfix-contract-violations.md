# 014: Correção de bugs de contrato

**What to build:** Correção dos 5 bugs de violação de contrato identificados no code-review com ciclo TDD rigoroso (red-green): inicialização do triângulo inferior de R em QR/ColPivQR, validação de finitude e buffer intocado em solveLeastSquares, verificação de status via info(), correção da fórmula de simetria com numext::mini, e harmonização de assinaturas (inv e cholesky com dimensão n).

**Blocked by:** 013

**Status:** resolved

- [x] Bug 1: Teste de regressão e correção da inicialização com zeros do triângulo inferior de R em `qr` e `colPivQr`
- [x] Bug 2: Teste de regressão e garantia de preservação de buffers intocados em solução não-finita no `solveLeastSquares`
- [x] Bug 3: Teste de regressão e verificação sistemática de `info()` em `qr` e `solveLeastSquares`
- [x] Bug 4: Teste de regressão e correção da fórmula de simetria com `numext::mini` em `isSymmetric`
- [x] Bug 5: Harmonização de assinaturas C++ com `ABI_CONTRACT.md` (`inv`, `cholesky` usando `int n`) e atualização das suítes

# 013: Solver de autovalores geral

**What to build:** Um chamador obtém os autovalores e autovetores de uma matriz real **não
simétrica**, por `EigenSolver` sobre `RealSchur`.

Este é o único ticket que exercita o caminho `NoConvergence`, e ele não tem predecessor:
todo o resto da spec vive em `Success` ou `NumericalIssue`.

**Blocked by:** 012

**Status:** ready-for-agent

- [ ] Autovalores e autovetores de matriz real não simétrica devolvidos em buffers do chamador
- [ ] `NoConvergence` é alcançável e devolvido, com a mesma condição que a suíte upstream
      afirma
- [ ] Cada autovetor confere contra o autovalor correspondente, por resíduo
- [ ] Complexos conjugados saem em pares

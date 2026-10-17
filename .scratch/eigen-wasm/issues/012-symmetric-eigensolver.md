# 012: Solver de autovalores simétrico

**What to build:** Um chamador obtém os autovalores e autovetores de uma matriz simétrica, por
`SelfAdjointEigenSolver`.

Verificado contra as matrizes companheira e as raízes de polinômio que a suíte upstream
constrói: literal exato, independente de qualquer solver.

**Blocked by:** 004

**Status:** ready-for-agent

- [ ] Autovalores e autovetores devolvidos em buffers do chamador
- [ ] Autovalores conferem contra as raízes conhecidas do polinômio de uma matriz companheira
- [ ] Matriz não quadrada devolve `InvalidInput`
- [ ] Cada autovetor confere contra o autovalor correspondente, por resíduo

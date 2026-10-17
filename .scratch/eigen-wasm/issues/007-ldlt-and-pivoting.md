# 007: LDLT e LDLT com pivoting

**What to build:** Um chamador fatora uma matriz simétrica que Cholesky recusa — semi-definida
ou simétrica indefinida — e obtém os fatores por `LLT` refusing a entrada e `LDLT` ou
pivoting não.

Verificado pelos mesmos resíduos do Cholesky.

**Blocked by:** 004

**Status:** resolved

- [x] `ldlt` fatora matriz simétrica semi-definida onde Cholesky devolve `NumericalIssue`
- [x] `bunchKaufman` fatora matriz simétrica indefinida
- [x] Resíduo da identidade de reconstrução exportado e abaixo do limiar relativo
- [x] Pivoting zero em `ldlt` devolve `NumericalIssue`

# 005: Solver de LU e inversa

**What to build:** Um chamador resolve um sistema linear por LU e obtém a inversa de uma
matriz, e sabe distinguir uma solução válida de um sistema sem solução única.

Verificado por **resíduo**: a norma de `A x menos b` é conferida contra um limiar. É a
verificação mais forte dos três tipos, porque `A` é independente do solver — o resíduo
não pode ser reduzido por um erro no próprio solver.

**Blocked by:** 004

**Status:** resolved

- [x] `solveLU` resolve `A x = b` num buffer do chamador
- [x] `inv` escreve a inversa num buffer do chamador
- [x] Resíduo `norma de A x menos b` exportado e abaixo do limiar relativo
- [x] Matriz singular devolve `NumericalIssue`, e o buffer de saída permanece intocado
- [x] Sistema retangular fornecido a `inv` devolve `InvalidInput`
- [x] A comparação relativa do Eigen levada para a verificação em JS: uma diferença
      passa quando é no máximo a menor das duas magnitudes vezes a precisão, e falha
      quando qualquer operando não é finito

**Notes:** Verified via residual norms (||A x - b|| and ||A * inv(A) - I||) using FullPivLU.
Tested across 1x1, 2x2, 3x3 hand-computed systems, singular systems reporting NumericalIssue
with untouched buffers, and boundary/precondition tests reporting InvalidInput.

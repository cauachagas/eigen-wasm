# 006: Cholesky

**What to build:** Um chamador obtém o fator `L` de uma matriz simétrica positiva-definida e
pode conferir que o fator reproduz a matriz, por `norma de L L transposta menos A`.

Este é o primeiro caso de `NumericalIssue` por matriz não positiva-definida, que é a
condição onde a suíte upstream afirma o mesmo valor.

**Blocked by:** 004

**Status:** resolved

- [x] O fator `L` de uma matriz simétrica positiva-definida é devolvido num buffer do
      chamador
- [x] Resíduo `norma de L L transposta menos A` exportado e abaixo do limiar relativo
- [x] Matriz não positiva-definita devolve `NumericalIssue`, e nenhum buffer é escrito
- [x] Matriz assimétrica devolvida a uma rotina que exige simetria devolve `InvalidInput`
- [x] O caso de falha é verificado com o mesmo valor que a suíte upstream afirma

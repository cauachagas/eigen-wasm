# 004: Determinant dinâmico, e a convenção que o resto segue

**What to build:** Um chamador JavaScript obtém o determinante de uma matriz quadrada de
dimensão dinâmica, e sabe se o resultado foi realmente calculado. Esta é a primeira
**rotina densa** e estabelece a convenção que todas as outras repetem: pré-condições
validadas no próprio C, retorno de `ComputationInfo` verbatim, buffer de saída intocado
quando a rotina falha, um teste de contrato por rotina, e CI verde.

O produto 3x3 existente continua disponível e sem qualquer mudança de assinatura ou de
garantia.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] O determinante de uma matriz n por n dinâmico é devolvido num buffer do chamador
- [x] Ponteiro nulo, dimensão zero e dimensão negativa devolvem `InvalidInput`
- [x] Matriz não-quadrada para uma rotina quadrada devolve `InvalidInput`
- [x] Uma rotina que não devolve `Success` não escreveu no buffer de saída, verificado por
      buffer pré-preenchido com valor sentinela
- [x] O código de retorno é `ComputationInfo` do Eigen verbatim, sem mapeamento, e os
      quatro valores estão nomeados no glossário
- [x] Casos de mão para 1x1, 2x2 e 3x3 com literais escritos à mão, não recalculados
- [x] A guarda é código explícito, não `eigen_assert`, porque `-O3` compila assertions fora
- [x] O produto 3x3 passa os testes atuais sem modificação
- [x] Uma implementação mutante da rotina faz o teste ir a vermelho

**Notes:** The dimension ceiling was specified as 320 and measured at 255. At 256 the blocked LU behind
`determinant()` reads out of bounds and kills the instance; verified by building without the guard and
observing a trap rather than a return. `spec-dense.md` records the measurement and the reason.

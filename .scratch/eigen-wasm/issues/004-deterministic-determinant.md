# 004: Determinant dinâmico, e a convenção que o resto segue

**What to build:** Um chamador JavaScript obtém o determinante de uma matriz quadrada de
dimensão dinâmica, e sabe se o resultado foi realmente calculado. Esta é a primeira
**rotina densa** e estabelece a convenção que todas as outras repetem: pré-condições
validadas no próprio C, retorno de `ComputationInfo` verbatim, buffer de saída intocado
quando a rotina falha, um teste de contrato por rotina, e CI verde.

O produto 3x3 existente continua disponível e sem qualquer mudança de assinatura ou de
garantia.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] O determinante de uma matriz n por n dinâmico é devolvido num buffer do chamador
- [ ] Ponteiro nulo, dimensão zero e dimensão negativa devolvem `InvalidInput`
- [ ] Matriz não-quadrada para uma rotina quadrada devolve `InvalidInput`
- [ ] Uma rotina que não devolve `Success` não escreveu no buffer de saída, verificado por
      buffer pré-preenchido com valor sentinela
- [ ] O código de retorno é `ComputationInfo` do Eigen verbatim, sem mapeamento, e os
      quatro valores estão nomeados no glossário
- [ ] Casos de mão para 1x1, 2x2 e 3x3 com literais escritos à mão, não recalculados
- [ ] A guarda é código explícito, não `eigen_assert`, porque `-O3` compila assertions fora
- [ ] O produto 3x3 passa os testes atuais sem modificação
- [ ] Uma implementação mutante da rotina faz o teste ir a vermelho

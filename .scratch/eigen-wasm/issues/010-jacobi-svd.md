# 010: JacobiSVD

**What to build:** Um chamador obtém os valores e vetores singulares de uma matriz, por
`JacobiSVD`, e a suíte os confere contra valores singulares prescritos — verificação por
literal, não por resíduo.

Este é o corte barato do SVD: quase nada de custo em relação ao SVD completo.

**Blocked by:** 004

**Status:** ready-for-agent

- [ ] Valores singulares e U e V devolvidos em buffers do chamador
- [ ] Valores singulares conferem contra os valores prescritos dentro do limiar relativo
- [ ] Matriz de posto deficiente, construida com valores singulares prescritos, produz posto `r`
- [ ] Entrada não-finita devolve `InvalidInput`, que é o valor que o Eigen devolve
- [ ] A ordem dos valores singulares é decrescente e está documentada

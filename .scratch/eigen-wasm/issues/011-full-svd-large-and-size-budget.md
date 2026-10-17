# 011: SVD completo para entrada grande, e orçamento de tamanho medido

**What to build:** Um chamador obtém o SVD completo de uma matriz maior do que a que
`JacobiSVD` trata bem, por `BDCSVD`. E a suíte registra o **orçamento de tamanho medido**,
em instância dinâmica e no teto de dimensão, porque os números atuais da spec são de 3x3 fixo.

`BDCSVD` é a maior alavanca de tamanho do Dense inteiro. Este ticket é onde se decide se
fica ou sai.

**Blocked by:** 010

**Status:** resolved

- [x] `BDCSVD` usado acima de um limiar de dimensão, com o limiar documentado
- [x] Tamanho do wasm medido em instância dinâmica e no teto de dimensão, cru e gzip, por rotina
- [x] A tabela de tamanhos da spec atualizada com números medidos, não inferidos
- [x] Uma decisão registrada sobre manter ou remover `BDCSVD`, com o custo em KB

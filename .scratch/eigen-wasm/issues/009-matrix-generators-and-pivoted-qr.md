# 009: Geradores de matriz da suíte Eigen, e QR com pivoting

**What to build:** Um chamador obtém uma fatoração QR com pivoting, o **rank** e a permutação
de colunas, e a suíte consegue construir as matrizes que Upstream usa para testar rank.

Os geradores de `test/random_matrix_helper.h` são portados para C++ dentro do módulo e
semeados explicitamente, porque o gerador upstream é construído sobre `std::rand` e o
biblioteca C do alvo Emscripten é musl, cujo `rand` difere da máquina hospedeira. Geração e
decomposição acontecem dentro do módulo; só a comparação acontece em JS.

Verificado com as matrizes de valor singular prescrito do upstream.

**Blocked by:** 008

**Status:** ready-for-agent

- [ ] Gerador de matriz com valores singulares prescritos produz a matriz esperada a partir de
      uma semente explícita
- [ ] `colPivQr` devolve `rank` e a permutação de colunas
- [ ] Rank de uma matriz construída com valores singulares prescritos coincide com o rank
      pretendido
- [ ] Uma execução com a mesma semente produz a mesma matriz, verificado duas vezes

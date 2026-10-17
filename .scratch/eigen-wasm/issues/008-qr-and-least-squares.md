# 008: QR e mínimos quadrados

**What to build:** Um chamador obtém uma fatoração QR e resolve um sistema de mínimos
quadrados por ela, sem formar equações normais.

Esta é a **primeira rotina retangular**. É aqui que nascem os testes de dimensão
retangular e de entrada retangular para uma rotina que aceita matriz não-quadrada, e a
primeira vez que o produto dinâmico é usado na verificação.

**Blocked by:** 004

**Status:** ready-for-agent

- [ ] Fatoração QR de matriz retangular devolvida num buffer do chamador
- [ ] Solução de mínimos quadrados com resíduo `norma de A x menos b` e normal `norma de A
      menos x` abaixo dos limiares
- [ ] Matriz quadrada funciona e retangular também, com as dimensões documentadas
- [ ] Produto dinâmico disponível para as verificações de resíduo

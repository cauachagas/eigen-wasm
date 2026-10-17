# 01: Refatoração Unificada do Boilerplate de Validação Esparsa

**What to build:** Uma função utilitária única de validação de matrizes esparsas que consolida a verificação de dimensões, contagem de não-zeros, finitude de todos os valores e monotonicidade estrita de índices comprimidos em um único ponto, eliminando duplicações em todas as rotinas exportadas do módulo esparso. O comportamento externo permanece estritamente preservado: qualquer inconsistência retorna código 3 e mantém os buffers de saída intocados.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Implementar a função utilitária `validateSparseMatrix` no cabeçalho esparso encapsulando checagens de dimensões, non-zeros, monotonicidade comprimida (CSC e CSR) e finitude numérica
- [x] Refatorar todas as operações esparsas existentes (transposição, escalonamento, soma, multiplicação matriz-matriz, multiplicação matriz-vetor, fatoração de Cholesky e solvers iterativos) para utilizar a função utilitária unificada
- [x] Preservar integralmente o invariante de buffers de saída intocados em todas as chamadas inválidas
- [x] Manter 100% de aprovação (29 suítes de teste passando) sem qualquer regressão funcional

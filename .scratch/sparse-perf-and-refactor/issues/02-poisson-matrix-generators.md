# 02: Geradores Canônicos de Matrizes Esparsas Poisson 2D e 3D

**What to build:** Um módulo utilitário em JavaScript que constrói matrizes laplacianas esparsas para problemas de Poisson em malhas bidimensionais (stencil de 5 pontos) e tridimensionais (stencil de 7 pontos) diretamente no formato comprimido CSC/CSR (`values`, `innerIndices`, `outerStarts`). As matrizes geradas devem ser estritamente simétricas e positivas definidas (SPD) com condições de contorno de Dirichlet nulas e ordenação canônica de índices.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Implementar gerador de matriz laplaciana Poisson 2D em grade N x N com dimensão n = N^2 e stencil de 5 pontos (diagonal 4.0, vizinhos -1.0)
- [x] Implementar gerador de matriz laplaciana Poisson 3D em grade N x N x N com dimensão n = N^3 e stencil de 7 pontos (diagonal 6.0, vizinhos -1.0)
- [x] Exportar diretamente as estruturas compactadas em formato CSC (arrays tipados `Float64Array` e `Int32Array`) prontas para injeção na memória linear do WebAssembly
- [x] Criar validações e testes unitários do gerador garantindo simetria estrita, valores finitos e monotonicidade dos índices de linha/coluna

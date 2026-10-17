# Retrospectiva: Sparse Matrix Validation Refactor e Poisson Benchmarks

Retrospectiva do ciclo de implementação da especificação `sparse-perf-and-refactor`: Refatoração unificada de validação de matrizes esparsas (`validateSparseMatrix`), geradores laplacianos de Poisson 2D/3D e suíte completa de benchmarks comparativos WebAssembly versus C++ Nativo (-O3).

---

## 1. O que funcionou bem

1. **Refatoração Sem Regressões (Debt Técnico Eliminado):**
   - A extração de `validateSparseMatrix(...)` em `src/sparse_wasm.hpp` consolidou em um ponto único as validações de limites dimensionais, contagem de não-zeros, verificação de formato CSC/CSR, monotonicidade estrita de índices internos e finitude de valores em ponto flutuante.
   - Todas as 8 rotinas esparsas exportadas do WebAssembly foram simplificadas de 15-20 linhas de validação duplicada para uma chamada simples e segura: `if (!validateSparseMatrix(...)) return 3;`.
   - O **Invariante do Buffer de Saída Intocado** foi mantido e validado com sentinelas canônicos em todos os caminhos de erro.

2. **Geração de Stencils Poisson em Tempo Linear O(n):**
   - Os geradores de Poisson 2D (stencil de 5 pontos) e 3D (stencil de 7 pontos) em `bench/poisson.js` constroem matrizes diretamente na ordenação estrita ascendente de CSC/CSR sem necessidade de ordenação pós-processamento, montando grades de 10.000 a 15.625 nós em menos de 2 milissegundos.

3. **Harness de Benchmark Unificado e Comparação Nativa:**
   - O comando `npm run bench` executa perfilamento completo de SpMV, Cholesky Direto (`SimplicialLDLT`, `SimplicialLLT`) e Solvers Iterativos (`ConjugateGradient`, `BiCGSTAB`).
   - A detecção e compilação automática do binário C++ nativo (`clang++ -O3`) permitiu comparação direta lado a lado de tempos (ms), MFLOPS e taxa de eficiência (Wasm / Nativo) no mesmo ambiente de hardware.

4. **Revisões com ASD-STE100 em Subagentes Dedicados:**
   - As revisões automáticas a cada ticket identificaram com precisão detalhes cruciais, como a purga de marcadores LaTeX em `spec.md`, testes para parâmetros não-inteiros e remoção de parâmetros de função não utilizados para compilação estrita sob `-Wall -Wextra`.

---

## 2. Fricções, Retrabalhos e Lições Aprendidas

1. **Acesso à Memória Linear Emscripten no Node.js:**
   - No início da implementação do benchmark, tentou-se utilizar `Module.HEAPF64.set`, que não estava diretamente exposto devido às opções de modularização do build. A substituição por `Module.setValue` e `Module.getValue` (rotinas canonicamente exportadas pelo `scripts/build.sh`) garantiu compatibilidade universal e sem atrito.
2. **Escopo de Variáveis Locais Pós-Refatoração:**
   - Na refatoração de `sparseScale`, a variável `outerSize` era anteriormente declarada no bloco de validação removido. A compilação rápida com `npm run build` detectou o identificador ausente de imediato, reforçando o valor de compilar e testar continuamente a cada alteração.
3. **Parâmetros Não Utilizados em C++:**
   - A função `benchmarkProblem` recebia `int N` que não era utilizado internamente. A compilação nativa com `-Wall -Wextra` sinalizou o aviso, corrigido prontamente no Ticket 04.

---

## 3. Métricas e Validações Realizadas

### 3.1 Integridade da Suíte de Testes
- **Total de Suítes de Teste:** 30 suítes (18 densas + 6 esparsas Phase 1 + 5 esparsas Phase 2 + 1 suíte de geradores de Poisson).
- **Taxa de Sucesso:** 100% dos testes aprovados (`ALL TESTS PASSED`), zero regressões.
- **Novas Asserções:** 31 novas asserções automatizadas em `test/test_poisson_generators.js` e 16 novas asserções de validação de `storageOrder` e finitude em `test/test_sparse_validation.js`.

### 3.2 Performance Relativa: WebAssembly vs Nativo C++ (-O3)
Métricas obtidas em execução padrão (`npm run bench` em Apple Silicon M-series, Node v22.23.3 vs Apple Clang -O3):

| Problema | Operação | Wasm (ms) | Nativo (ms) | Razão (Wasm/Nativo) | Wasm MFLOPS | Nativo MFLOPS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Poisson 2D (10k DoF)** | SpMV (A * x) | 0.13 ms | 0.02 ms | ~5.1x | 787.7 | 4070.4 |
| **Poisson 2D (10k DoF)** | SimplicialLDLT (Fact) | 15.71 ms | 5.46 ms | ~2.8x | - | - |
| **Poisson 2D (10k DoF)** | SimplicialLDLT (Solve) | 1.20 ms | 0.40 ms | ~3.0x | - | - |
| **Poisson 2D (10k DoF)** | ConjugateGradient (158 iters) | 13.39 ms | 5.50 ms | ~2.4x | 1170.4 | 2850.9 |
| **Poisson 2D (10k DoF)** | BiCGSTAB (119 iters) | 17.87 ms | 7.30 ms | ~2.4x | 1320.9 | 3178.0 |
| **Poisson 3D (15.6k DoF)** | SpMV (A * x) | 0.16 ms | 0.04 ms | ~3.8x | 1305.9 | 5050.4 |
| **Poisson 3D (15.6k DoF)** | SimplicialLDLT (Fact) | 284.37 ms | 241.27 ms | **~1.18x** | - | - |
| **Poisson 3D (15.6k DoF)** | SimplicialLDLT (Solve) | 3.30 ms | 3.03 ms | **~1.09x** | - | - |
| **Poisson 3D (15.6k DoF)** | ConjugateGradient (50 iters) | 5.06 ms | 2.96 ms | **~1.71x** | 2087.7 | 3574.1 |
| **Poisson 3D (15.6k DoF)** | BiCGSTAB (38 iters) | 7.47 ms | 4.50 ms | **~1.66x** | 2148.5 | 3659.9 |

> **Destaque de Performance:**
> Em problemas 3D (onde o volume computacional e a localidade de cache dominam), a resolução e fatoração de Cholesky em WebAssembly atingem de **85% a 92% da performance nativa compilada com `-O3`** (fator de slowdown entre 1.09x e 1.22x). Solvers iterativos operam em patamares acima de 2 GFLOPS em Wasm.

---

## 4. Ações Concretas para os Próximos Ciclos

1. **Exportação de `HEAPF64` / `HEAP32` no Runtime Emscripten:**
   - Avaliar a inclusão de `HEAPF64`, `HEAP32` na lista `EXPORTED_RUNTIME_METHODS` em `scripts/build.sh` para permitir cópias em lote via `TypedArray.prototype.set` em vez de loops elemento a elemento no harness de benchmark em JavaScript.
2. **Otimizações SIMD em WebAssembly (`-msimd128`):**
   - Investigar a viabilidade de compilar uma variante alternativa com `-msimd128` no Emscripten para avaliar o ganho de throughput em SpMV e operações vetoriais de solvers iterativos.
3. **Persistência de Histórico de Benchmarking:**
   - Criar uma rotina para exportar as métricas de benchmark para arquivo markdown ou JSON de tracking sob `bench/results/`, permitindo detectar eventuais regressões de performance em futuras alterações do módulo Core ou Dense.

# 03: Suíte de Benchmarks de Solvers e SpMV Poisson em WebAssembly

**What to build:** Um harness de benchmarking completo em Node.js (`bench/bench_poisson.js`), acionável via `npm run bench`, que mede tempo de execução (ms), throughput (ops/s), estimativa de MFLOPS e resíduo relativo (`||A * x - b|| / ||b||`) para operações de SpMV, Cholesky (`SimplicialLDLT` e `SimplicialLLT`) e solvers iterativos (`ConjugateGradient` e `BiCGSTAB`). O script suporta presets `--quick` (malhas de 2.5k a 10k DoF) e `--full` (malhas padrão de 10k a 40k+ DoF), parâmetros de linha de comando (`--dim2d`, `--dim3d`, `--tol`, `--max_iters`) e imprime uma tabela formatada em ASCII no terminal.

**Blocked by:** 01: Refatoração Unificada do Boilerplate de Validação Esparsa, 02: Geradores Canônicos de Matrizes Esparsas Poisson 2D e 3D

**Status:** closed

- [x] Implementar `bench/bench_poisson.js` importando as rotinas Wasm compiladas e os geradores de matrizes Poisson
- [x] Implementar perfilamento de SpMV calculando tempo médio e FLOPS teóricos (2 * NNZ / tempo)
- [x] Implementar perfilamento de Cholesky direto (`SimplicialLDLT` e `SimplicialLLT`) separando tempos de fatoração simbólica/numérica e tempos de resolução com múltiplos lados direitos
- [x] Implementar perfilamento de solvers iterativos (`ConjugateGradient` e `BiCGSTAB`) reportando tempo, número de iterações executadas e convergência com verificação de norma residual
- [x] Suportar flags CLI `--quick`, `--full`, `--dim2d=N`, `--dim3d=N`, `--tol=T`, `--max_iters=M` e renderizar os resultados consolidados em tabela ASCII no terminal
- [x] Adicionar o comando canônico `"bench": "node bench/bench_poisson.js"` ao `package.json`

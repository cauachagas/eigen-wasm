# 04: Linha de Base Opcional em C++ Nativo com Otimização -O3

**What to build:** Um utilitário de benchmark C++ nativo (`bench/native_poisson.cpp`) que compila diretamente com os headers de `deps/eigen` utilizando otimização total (`-O3`), e suporte em `bench/bench_poisson.js` para detectar automaticamente a presença de compiladores C++ (`clang++` ou `g++`). Se presente, o harness compila e executa o binário nativo com os mesmos problemas de Poisson e exibe tabelas comparativas com a razão de aceleração relativa (speedup Wasm versus Nativo).

**Blocked by:** 03: Suíte de Benchmarks de Solvers e SpMV Poisson em WebAssembly

**Status:** closed

- [x] Implementar `bench/native_poisson.cpp` utilizando diretamente os templates do upstream Eigen (`Eigen::SparseMatrix<double>`, `SimplicialLDLT`, `SimplicialLLT`, `ConjugateGradient`, `BiCGSTAB`) resolvendo a mesma formulação de Poisson 2D/3D
- [x] Adicionar suporte a argumentos de CLI no programa nativo (`--dim2d`, `--dim3d`, `--quick`, `--full`, `--tol`, `--max_iters`) produzindo saída JSON estruturada ou texto parseável
- [x] Implementar detecção automática de compilador C++ (`clang++` ou `g++`) no Node.js em `bench/bench_poisson.js`
- [x] Quando o compilador estiver disponível, compilar e executar o binário nativo, integrando os tempos lado a lado e calculando a métrica de eficiência relativa (Wasm / Nativo)
- [x] Garantir degradação suave sem falha de execução caso o ambiente de execução não possua compilador nativo C++ instalado

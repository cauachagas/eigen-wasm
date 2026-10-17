# Retrospectiva: Sparse Solvers (Phase 2)

Retrospectiva do ciclo de implementação da Phase 2 de matrizes esparsas no `eigen-wasm`: Direct Solvers (`SimplicialLDLT`, `SimplicialLLT`) via opaque handles e Iterative Solvers (`ConjugateGradient`, `BiCGSTAB`) com diagnósticos de convergência.

---

## 1. O que funcionou bem

1. **Ciclo TDD com Testes Upstream C++:**
   - O espelhamento direto dos casos de teste do Eigen upstream (`deps/eigen/test/simplicial_cholesky.cpp`, `conjugate_gradient.cpp`, `bicgstab.cpp` e `sparse_solver.h`) forneceu asserções canônicas de estabilidade numérica e resíduos relativos rigorosos (`||A * x - b|| / ||b|| <= tol`).
   - A fase Red foi verificada em cada ticket antes da implementação em C++.
2. **Arquitetura de Handles Polimórficos (`SparseSolverInstance`):**
   - O registro centralizado de instâncias em `src/sparse_wasm.hpp` permitiu reutilização eficiente da fatoração com múltiplos vetores de lado direito sem redundância computacional.
   - A guarda de colisão com detecção de wraparound assegurou que handles nunca colidem ou vazam memória.
3. **Invariante de Buffers Intocados (Untouched Buffer Invariant):**
   - O uso de sentinelas canônicos (`SENTINEL = -4.4444444444444e-100` e `-999` para inteiros) em todos os caminhos de erro (`InvalidInput` e `NumericalIssue`) evitou mutações parciais ou corrupção de memória do chamador.
4. **Revisões Automatizadas com OpenCode CLI (`opencode/beam-free`):**
   - A cada ticket concluído, a revisão externa com as skills `@code-review` e `@asd-ste100` identificou nuances críticas, tais como validação de finitude de `tolerance`, verificação de `bad_alloc` separado de problemas numéricos e garantia de tempo de vida de `cscStorage` no escopo da função.
5. **Automação de Sincronização de Build:**
   - A cópia automática dos artefatos de `build/` para `test/` em `scripts/build.sh` eliminou qualquer risco de testes executando sobre binários Wasm defasados.

---

## 2. Fricções, Retrabalhos e Lições Aprendidas

1. **Cálculo de Lado Direito Exato em Múltiplos RHS:**
   - Em `test_sparse_cg.js` e `test_sparse_bicgstab.js`, pequenos descuidos manuais ao derivar `b = A * x` para a segunda coluna causaram falhas pontuais de asserção durante a escrita dos testes. O uso de scripts rápidos em Node para verificar algebricamente o sistema antes de codificar a suíte evitou retrabalho posterior.
2. **Tempo de Vida do Buffer CSR Convertido:**
   - A conversão de matrizes CSR para CSC aloca um `Eigen::SparseMatrix` contíguo. Ao instanciar o solver iterativo, se essa matriz temporária fosse destruída no final do bloco condicional, o solver apontaria para dados desalocados. A declaração de `cscStorage` no escopo externo da função garantiu segurança de memória total.
3. **Separação Rigorosa de Códigos de Erro (Regra 10):**
   - Falhas de alocação (`std::bad_alloc`) devem retornar estritamente `3` (`InvalidInput`), reservando `1` (`NumericalIssue`) exclusivamente para divergência ou colapso matemático. Essa separação foi aplicada rigorosamente em todos os solvers.

---

## 3. Métricas e Validações Realizadas

- **Total de Suítes de Teste:** 29 suítes (18 densas + 6 esparsas Phase 1 + 5 esparsas Phase 2).
- **Taxa de Sucesso:** 100% dos testes passando (`ALL TESTS PASSED`).
- **Asserções Novas Adicionadas na Phase 2:**
  - `test/test_sparse_cholesky_lifecycle.js`: 42 asserções.
  - `test/test_sparse_cholesky_solve.js`: 44 asserções.
  - `test/test_sparse_cg.js`: 65 asserções.
  - `test/test_sparse_bicgstab.js`: 65 asserções.
  - `test/test_sparse_solvers_integration.js`: 75 asserções.
  - Total: **291 novas asserções** automatizadas em JavaScript/Wasm.
- **Limites de Capacidade Verificados:**
  - Suporte e validação de dimensão até 1.000.000 e NNZ até 10.000.000.
  - Proteção contra overflow em `n * nrhs > 20000000`.

---

## 4. Ações Concretas para os Próximos Ciclos

1. **Refatoração de Boilerplate de Validação (Debt Técnico):**
   - Extrair a validação comum de cabeçalho esparso (`validSparseDim`, `validSparseNnz`, `validCompressedStructure`, `allFinite`) para uma função utilitária única `validateSparseInputs(...)` em `src/sparse_wasm.hpp` para reduzir repetições entre rotinas.
2. **Benchmarking de Performance Wasm:**
   - Adicionar uma suíte de benchmark dedicada para medir MFLOPS e throughput de resolução de sistemas Poisson 2D/3D no Node.js versus implementações nativas.
3. **Generalização de Precondicionadores:**
   - Avaliar a viabilidade futura de suportar pré-condicionadores adicionais como `IdentityPreconditioner` ou `IncompleteLUT` no pipeline de solvers iterativos se houver demanda.

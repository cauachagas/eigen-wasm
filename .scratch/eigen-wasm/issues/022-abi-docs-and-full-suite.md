# 022: Sincronização de ABI, Documentação e Suíte Completa

**What to build:** Atualização formal e sincronização de todos os contratos e documentações do projeto (`.scratch/eigen-wasm/ABI_CONTRACT.md`, `GLOSSARY.md` e `wasm/README.md`) com as 9 novas rotinas expostas (`solvePartialLU`, `invPartialLU`, `cod`, `pseudoInverse`, `solveCholesky`, `solveTriangularLower`, `solveTriangularUpper`, `solveLUMatrix`, `solveLeastSquaresMatrix`, `transpose`, `trace`, `matrixNorm`). Execução unificada de 100% das suítes de teste Node.js (`for f in wasm/test_*.js; do node "$f"; done`), validação de ausência de regressões e entrega do diff pronto para o agente de revisão independente (`/code-review`).

**Blocked by:** 017, 018, 019, 020, 021

**Status:** ready-for-agent

- [ ] Atualizar `.scratch/eigen-wasm/ABI_CONTRACT.md` com tabelas de rotinas, assinaturas e invariantes
- [ ] Atualizar `GLOSSARY.md` com novos termos de domínio
- [ ] Atualizar `wasm/README.md` com lista de exports, exemplos e comandos de execução
- [ ] Executar todas as suítes de testes (`for f in wasm/test_*.js; do node "$f"; done`) e assegurar 100% de passagem
- [ ] Preparar diff limpo para o agente de revisão (`/code-review`)
- [ ] Executar retrospectiva `/retro`

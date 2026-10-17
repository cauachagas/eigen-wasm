# 05: Solver Validation, Limit Checks and End-to-End Integration

**What to build:** Testes de integração ponta a ponta, validação de limites de dimensão/capacidade (até 1.000.000 dimensões e 10.000.000 NNZ), verificação de robustez numérica com sentinelas canônicos (`SENTINEL = -4.4444444444444e-100`), atualização do script de compilação `scripts/build.sh` para exportar as novas rotinas (`_sparseCholeskyFactorize`, `_sparseCholeskySolve`, `_sparseCholeskyDestroy`, `_sparseConjugateGradient`, `_sparseBiCGSTAB`), e documentação em `README.md`. Satisfaz os requisitos REQ-SOLV-024 até REQ-SOLV-026.

**Blocked by:** 01-sparse-cholesky-factorize-and-lifecycle.md, 02-sparse-cholesky-solve.md, 03-sparse-conjugate-gradient.md, 04-sparse-bicgstab.md

**Status:** resolved

- [x] Exportar todas as 5 novas rotinas de solvers em `scripts/build.sh` (`EXPORTED_FUNCTIONS`).
- [x] Atualizar `README.md` com as declarações C, especificações de uso dos handles e exemplos de resolução direta e iterativa.
- [x] Criar a suíte `test/test_sparse_solvers_integration.js` cobrindo cenários de grande escala, limites de capacidade e verificação de não vazamento de handles.
- [x] Validar o invariante de buffers intocados (`untouched buffer invariant`) para todos os solvers em todas as condições de erro (`InvalidInput` e `NumericalIssue`).
- [x] Executar a suíte de testes completa via `npm run build && npm test` garantindo 100% de sucesso em testes densos e esparsos existentes e novos.

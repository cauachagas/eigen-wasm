# 015: Requisitos faltantes e padronização

**What to build:** Implementação de requisitos adicionais da especificação densa (rotina independente de cálculo de rank, cálculo de valores singulares do SVD sem computar vetores U/V), migração de funções matemáticas para numext::, limpeza de trailing whitespace e documentação no README.

**Blocked by:** 014 (resolved)

**Status:** resolved

- [x] Adição da rotina `rank(a, rows, cols, rank_out)`
- [x] Adição da rotina `svdSingularValues(a, rows, cols, s_out)`
- [x] Migração de chamadas matemáticas `std::` para `numext::` em `wasm/eigen_wasm.cpp`
- [x] Remoção de trailing whitespace em `.scratch/eigen-wasm/` para validação de `git diff --check`
- [x] Atualização do `wasm/README.md` documentando todas as rotinas exportadas

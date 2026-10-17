# 05: End-to-End Validation, Export & Build Integration

**What to build:** Integração das rotinas esparsas em `scripts/build.sh` (`-s EXPORTED_FUNCTIONS`), compilação unificada, suíte dedicada de validação de integridade e robustez `test/test_sparse_validation.js` (bounds extremos, não-monotonicidade de ponteiros outer, nulos, grandes dimensões até 1.000.000, limites de memória) e atualização de documentação da ABI em `README.md`. Cumprir `REQ-SP-060` até `REQ-SP-062`.

**Blocked by:** 02, 03, 04

**Status:** resolved

- [x] Atualizar `scripts/build.sh` adicionando todas as rotinas `sparse*` à lista `EXPORTED_FUNCTIONS`.
- [x] Criar a suíte `test/test_sparse_validation.js` testando casos de borda e violações de integridade.
- [x] Testar grandes dimensões (dimensão até 1.000.000, 10.000.000 de não-zeros).
- [x] Validar a preservação do *untouched invariant* em todas as rotinas esparsas.
- [x] Atualizar o `README.md` com as declarações de API das rotinas esparsas.
- [x] Executar `npm run build && npm test` garantindo 100% de aprovação de todas as suítes (densas e esparsas).

# Retrospectiva: Matrizes Esparsas (Fase 1 - Conclusão Completa)

Esta retrospectiva consolida o ciclo de implementação completo da feature de **Matrizes Esparsas (Fase 1)**, cobrindo o planejamento via `/grill-with-docs` e `/grill-me`, a formulação de requisitos EARS, a execução dos **Tickets 01 a 05** e as revisões de código integradas via `opencode` com o modelo `beam-free` (aplicando as skills `code-review` e `asd-ste100`).

---

## 1. O Que Foi Realizado

### Planejamento e Especificação EARS
- Realizada a sessão de entrevista via `/grill-with-docs` e `/grill-me`, alinhando os pilares de design:
  - Formato de intercâmbio comprimido CSC/CSR padrão (3 buffers contíguos: `values: double*`, `innerIndices: int32_t*`, `outerStarts: int32_t*`).
  - Modelo de memória estritamente *caller-allocated* via `Module._malloc()` e `Module._free()`.
  - Padrão *Two-pass sparse allocation* para rotinas com número dinâmico de elementos não-nulos.
  - Teto de dimensões ampliado para até 1.000.000 de linhas/colunas e 10.000.000 de não-zeros.
- Elaborada a especificação formal em `.scratch/sparse/spec.md` estruturada integralmente na sintaxe EARS (**Ubiquitous**, **Event-driven**, **State-driven**, **Unwanted-behavior** e **Optional-feature**).
- Atualizado o modelo de domínio em `GLOSSARY.md` na nova seção `## Sparse module`.
- Iniciativa registrada no Hindsight sob o ID `kp-ca8232b4ca924665b4c23cc450f8bc4c`.

### Decomposição e Execução TDD (Red -> Green -> Refactor)
- **Ticket 01 (Tipos base e montagem via Triplets):**
  - Implementada `sparseFromTriplets` com soma automática de duplicatas e ordenação de índices.
  - Criada a suíte `test/test_sparse_triplets.js` (43 asserções passando).
- **Ticket 02 (SpMV e SpMM):**
  - Implementadas `sparseMatMulVec` (`y = A * x`) e `sparseMatMulDense` (`C = A * B`, onde B e C são densas em row-major).
  - Criadas as suítes `test/test_sparse_spmv.js` e `test/test_sparse_spmm.js`.
- **Ticket 03 (Adição Esparsa com Two-Pass Allocation):**
  - Implementadas `sparseAddGetNnz` (passo 1 de consulta de NNZ com descarte de cancelamentos a zero) e `sparseAdd` (passo 2 de escrita dos buffers).
  - Criada a suíte `test/test_sparse_add.js`.
- **Ticket 04 (Multiplicação Escalar e Transposição):**
  - Implementadas `sparseScale` (com suporte a aliasing in-place) e `sparseTranspose` (com `makeCompressed()` garantido).
  - Criada a suíte `test/test_sparse_ops.js`.
- **Ticket 05 (Validação e Integração):**
  - Criada a suíte `test/test_sparse_validation.js` cobrindo limites de até 1.000.000 de dimensões, 10.000.000 de NNZ, checagem estrita de índices internos ordenados e preservação de buffers intocados em falha.
  - Atualizado `README.md` com a declaração e documentação completa da nova API esparsa.
  - Build unificado em `scripts/build.sh` exportando todas as 7 rotinas esparsas.
  - 100% de aprovação em `npm run build && npm test` (todas as suítes densas e esparsas).

---

## 2. Apêndice dos Code Reviews e Integração com OpenCode (`beam-free`)

Durante o ciclo, o `opencode` com modelo `beam-free` foi integrado como revisor autônomo através da chamada:
`opencode run -m opencode/beam-free "faça review com a skill @code-review com auxílio da skill @asd-ste100 <detalhes>"`

### A. Revisão do Ticket 02 (SpMV e SpMM)
- **Achado 1 (Int Overflow em Dimensões Grandes):** O cálculo `colsA * colsB` e `rowsA * colsB` podia sofrer overflow de `int32` sob o teto de 1.000.000 dimensões.
  - *Resolução:* Implementado guard de overflow em ponto flutuante (`double maxElements`) rejeitando matrizes densas que excedam 20.000.000 de elementos com `InvalidInput`.
- **Achado 2 (Ordenação de Índices Internos):** Índices internos não-ordenados podiam causar computação incorreta sem aviso.
  - *Resolução:* Implementado validador `validCompressedStructure()` que verifica estritamente se os índices internos são crescentes dentro de cada fatia exterior.
- **Achado 3 (Limpeza e Sentinelas):** Padronização de sentinelas de teste conforme o contrato da ABI.

### B. Revisão dos Tickets 03 e 04 (Soma, Escala e Transposição)
- **Achado 1 (Transposição Descomprimida):** `mat.transpose()` do Eigen para matrizes esparsas pode deixar a estrutura descomprimida antes da leitura dos ponteiros de buffer.
  - *Resolução:* Adicionada chamada explícita a `matT.makeCompressed()` antes de invocar `copyCompressedSparse()`.
- **Achado 2 (Cobertura de Casos de Borda):** Ausência de teste para transposição de CSR e checagem de buffers intocados na rotina de adição.
  - *Resolução:* Adicionados testes para CSR transpose e asserções completas de preservação dos 3 buffers de saída em `test_sparse_add.js` e `test_sparse_ops.js`.

---

## 3. Métricas e Validações Realizadas

- **Total de Suítes de Teste:** 24 suítes em execução no `npm test` (18 densas + 6 esparsas).
- **Asserções Esparsas:** Mais de 120 asserções cobrindo conversão, produtos, adição com cancelamento, escala, transposição e limites.
- **Garantias Invariantes:** O *untouched output buffer invariant* foi validado para todas as rotinas em condições de ponteiros nulos, dimensões fora de limites, índices desordenados e valores não-finitos (`NaN`/`Inf`).
- **Cleanliness:** Nenhuma referência ou arquivo temporário de review pendente. Nenhum caractere ou sintaxe LaTeX utilizado.

---

## 4. Próximos Passos (Fase 2 Recomendada)

1. **Decomposição Cholesky Esparsa (SimplicialLDLT / SimplicialLLT):**
   - Permitir resolução direta de sistemas esparsos simétricos positivos-definidos via WebAssembly.
2. **Solvers Iterativos Esparsos (ConjugateGradient e BiCGSTAB):**
   - Suporte a sistemas lineares de grande porte sem fatoração direta densa.

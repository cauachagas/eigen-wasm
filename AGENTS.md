# AGENTS.md

Guia de desenvolvimento e governança para agentes e colaboradores no repositório `eigen-wasm`.

## Visão Geral do Repositório

O `eigen-wasm` é um porte WebAssembly autônomo dos módulos Core e Dense da biblioteca Eigen, compilado via Emscripten.

- **`deps/eigen/`**: Submódulo git contendo os headers do upstream Eigen (somente leitura, pinned).
- **`src/`**: Implementação C++ exposta para WebAssembly (`src/eigen_wasm.cpp`).
- **`test/`**: Suítes de teste em JavaScript executadas via Node.js (`test/test_*.js`).
- **`scripts/build.sh`**: Script de compilação Emscripten que gera os artefatos em `build/eigen_wasm.js` e `build/eigen_wasm.wasm`.
- **`build/`**: Artefatos compilados (gitignored). O arquivo `test/eigen_wasm.js` serve como ponto de reexportação para as suítes de teste.
- **Comandos canônicos**:
  - Compilar: `npm run build` (ou `./scripts/build.sh`)
  - Testar: `npm test` (ou `node test/test_<nome>.js`)

---

## Ciclo de Desenvolvimento: Especificação, Planejamento e Requisitos

### 1. Issue Tracker Local e Especificações
- Especificações e tickets residem como markdown sob `.scratch/<feature>/` (ex.: `.scratch/eigen-wasm/`). Nunca crie issues públicas no GitHub ou GitLab.
- Documentos de referência:
  - [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)
  - [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md)
  - [`docs/agents/domain.md`](docs/agents/domain.md) e [`GLOSSARY.md`](GLOSSARY.md)
- **Versionamento de Especificações:** Ao finalizar uma feature ou épico, os arquivos `.scratch/<feature>/spec.md`, `.scratch/<feature>/retro.md` e os tickets `.scratch/<feature>/issues/*.md` **devem ser commitados no repositório**, garantindo auditabilidade e governança local contínua.

### 2. Padrão EARS para `/grill-me` e `/grill-with-docs`
- Toda rodada de planejamento ou entrevista via `/grill-me` ou `/grill-with-docs` **DEVE** formular e registrar os requisitos da especificação (`spec.md` ou `spec-<feature>.md`) utilizando o padrão da skill `ears-requirements` (Easy Approach to Requirements Syntax).
- Os requisitos devem ser explícitos, mensuráveis, testáveis e estruturados nos padrões EARS:
  - **Ubíquo (Ubiquitous):** `The <system> shall <action>`
  - **Orientado a Eventos (Event-driven):** `When <trigger>, the <system> shall <action>`
  - **Orientado a Estado (State-driven):** `While in <state>, the <system> shall <action>`
  - **Comportamento Indesejado (Unwanted-behavior):** `If <trigger/condition>, then the <system> shall <action>`
  - **Recurso Opcional (Optional-feature):** `Where <feature is included>, the <system> shall <action>`
  - **Complexo (Complex):** Combinações explícitas de estado, eventos e respostas.

### 3. Decomposição em Tickets e Execução de TDD
- **Decomposição:** Cada especificação aprovada deve ser decomposta em tickets individuais sob `.scratch/<feature>/issues/<NN>-<slug>.md`, numerados a partir de `01`.
- **Uso Obrigatório da Skill `tdd`:**
  - O desenvolvimento e a correção de rotinas **DEVEM** utilizar a skill `tdd`, seguindo rigorosamente o ciclo test-first (Red -> Green -> Refactor).
  - Nenhum código deve ser adicionado em `src/eigen_wasm.cpp` sem testes correspondentes cobrindo os requisitos.
- **Adaptação dos Testes do Lib Eigen C++:**
  - Os testes base em JavaScript (`test/test_*.js`) **DEVERÃO SER adaptados a partir dos testes oficiais em C++ do upstream Lib Eigen** (localizados sob `deps/eigen/test/`).
  - Essa adaptação é mandatória para garantir que o porte WebAssembly reproduz exatamente a mesma semântica, estabilidade numérica e os mesmos resultados da biblioteca de referência.
- **Descoberta e Mapeamento de Testes com `graphify`:**
  - Para encontrar os testes C++ correspondentes a qualquer rotina ou módulo do Eigen, **DEVE-SE utilizar a skill `graphify`**.
  - O grafo de arquivos e dependências gerado pelo `graphify` deve ser consultado para rastrear as definições do Core/Dense até suas suítes de teste originais no upstream.
  - **Mapeamento Prévio Mandatório:** Antes de iniciar a implementação do primeiro ticket de qualquer feature, o agente DEVE mapear e apresentar formalmente quais arquivos de teste do upstream C++ (`deps/eigen/test/`), matrizes de teste e asserções de estabilidade/residual serão espelhados em cada ticket e arquivo em `test/`.
- **Ciclo de Execução TDD:**
  1. Localizar os testes de referência no upstream `deps/eigen/test/` via `graphify`.
  2. Criar ou adaptar a suíte em `test/test_*.js` espelhando os casos do Eigen, os requisitos EARS e os contratos da ABI (Red).
  3. Implementar a rotina em `src/eigen_wasm.cpp` (Green).
  4. Validar a execução local com `npm run build && npm test`.
  5. Refatorar mantendo a conformidade total da suíte.

---

## Qualidade e Revisão de Código

### 1. Code Review via Subagente Separado
- É **SEMPRE RECOMENDADO** executar a skill `/code-review` através de um subagente dedicado (`invoke_subagent`) sempre que uma feature ou ticket for finalizado.
- O review deve inspecionar as alterações ao longo de dois eixos principais:
  - **Standards**: conformidade com os padrões de código, REUSE/SPDX, segurança de memória e boas práticas.
  - **Spec**: aderência estrita aos requisitos EARS da especificação e ao contrato de ABI.

### 2. Linguagem e Tom do Review com `asd-ste100`
- O relatório de revisão gerado pelo subagente **DEVE** utilizar os princípios da skill `asd-ste100` (Simplified Technical English):
  - Frases curtas, diretas e com estrutura sujeito-verbo clara.
  - Eliminação de ambiguidades, rodeios e linguagem passiva.
  - Uma instrução ou constatação técnica por sentença.
  - Vocabulário técnico preciso para que o agente implementador possa agir sem incertezas.

### 3. Revisão Externa Automatizada via OpenCode CLI
- Pode-se acionar o OpenCode CLI para atuar como revisor automatizado de tickets ou épicos:
  ```bash
  opencode run -m opencode/beam-free "faça review com a skill @code-review com auxílio da skill @asd-ste100 <detalhes do ticket/código>"
  ```
- **Identificador do Modelo:** O modelo `beam-free` deve sempre ser qualificado com o prefixo do provedor: `opencode/beam-free`.
- **Limpeza de Artefatos Temporários:** Relatórios temporários de revisão externa (ex.: `.scratch/<feature>/review.md`, `review_claude.md`) servem apenas como apoio durante a iteração. Eles **devem ser excluídos antes do commit final**.
- **Integridade de Links:** Antes de apagar relatórios temporários, garanta que nenhum arquivo permanente (`retro.md`, `spec.md`, documentação) possua links órfãos apontando para eles.

---

## Finalização de Especificação e Retrospectiva

- Ao concluir a implementação de todos os tickets pertencentes a uma especificação/épico, deve-se obrigatoriamente executar a skill `/retro`.
- A retrospectiva deve gerar ou atualizar o arquivo `.scratch/<feature>/retro.md`, consolidando:
  - O que funcionou bem durante o ciclo.
  - Fricções, retrabalhos ou ferramentas faltantes encontradas.
  - Métricas e validações realizadas.
  - Ações concretas de melhoria para o próximo ciclo de desenvolvimento.

---

## Diretrizes Técnicas e Regras Obrigatórias

1. **Preservar Trabalho Existente:** Sempre execute `git status --short` antes de qualquer alteração. Nunca descarte mudanças de terceiros.
2. **Proibição Absoluta de LaTeX:** Jamais utilize sintaxe LaTeX (`$`, `$$`, `\text{}`, `\to`, etc.) em documentação, comentários ou código. Use texto puro, operadores relacionais (`>=`, `<=`, `==`) e setas Unicode (`→`) ou ASCII (`->`).
3. **Privacidade e Portabilidade:** Nunca exponha o caminho absoluto do home do usuário; generalize caminhos com `~/` ou `$HOME/`. Use links relativos dentro do repositório.
4. **Submódulo Eigen:** Trate `deps/eigen` como somente leitura. Não modifique arquivos internos do Eigen diretamente.
5. **Licenciamento REUSE:** Todos os arquivos novos criados devem conter cabeçalho SPDX adequado (`// SPDX-FileCopyrightText: The Eigen Authors` e `// SPDX-License-Identifier: MPL-2.0`) ou estar mapeados em `REUSE.toml`.
6. **Invariante do Buffer de Saída Intocado (Untouched Buffer Invariant):** Se uma função C++/Wasm falhar ou receber entradas inválidas (retornando status diferente de 0, ex.: `3` - `InvalidInput`), os buffers de saída do chamador **NUNCA** devem ser modificados. As suítes de teste devem validar esse invariante usando valores sentinela canônicos (`SENTINEL = -4.4444444444444e-100` em `test/test_helpers.js`).
7. **Compressão Obrigatória em Matrizes Esparsas:** Em matrizes esparsas (`Eigen::SparseMatrix`), operações que retornam expressões (como transposição) devem chamar explicitamente `.makeCompressed()` antes da extração de ponteiros brutos (`outerIndexPtr`, `innerIndexPtr`, `valuePtr`), garantindo layout contíguo válido na memória.
8. **Validação Estrutural de Índices Esparsos:** Toda entrada esparsa comprimida (CSC/CSR) deve ser validada contra monotonicidade estrita crescente nos índices internos de cada fatia para impedir corrupção de memória e loops fora de limites.
9. **Sincronização Contínua de Build:** O script `scripts/build.sh` deve sempre sincronizar os artefatos compilados em `build/eigen_wasm.*` para `test/eigen_wasm.*`, assegurando que todas as suítes de teste executem sempre contra o binário Wasm mais recente.
10. **Gerenciamento de Instâncias e Handles (Opaque Handles):** Em rotinas com ciclo de vida, handles devem ser inteiros positivos únicos com verificação ativa contra colisões em wraparound. Falhas de alocação de memória (`std::bad_alloc`) devem retornar estritamente `3` (`InvalidInput`), reservando `1` (`NumericalIssue`) exclusivamente para divergência ou instabilidade matemática.
11. **Validação de Finitude em Parâmetros Escalares:** Parâmetros numéricos de tolerância, escala ou fatores numéricos escalares passados pelo chamador devem ser explicitamente validados com `std::isfinite()`. Valores não-finitos (`NaN`, `Infinity`) devem retornar estritamente `3` (`InvalidInput`), preservando os buffers de saída intactos.
12. **Garantia de Tempo de Vida de Estruturas Convertidas (Scope Lifetime):** Ao converter matrizes (ex.: CSR para CSC) para alimentar solvers ou rotinas que armazenam referências (`Eigen::Ref` ou ponteiros internos), o objeto convertido (`cscStorage`) DEVE ser declarado no escopo externo da rotina, garantindo que sua memória permaneça válida até a conclusão de todas as operações de `solve()`.

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

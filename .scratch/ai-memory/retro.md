# Retrospectiva: ai-memory Cross-Harness Knowledge Integration (Tickets 023-027)

- **Data:** 2026-10-18
- **Especificação:** `.scratch/ai-memory/spec.md`
- **Harnesses validados:** `agy` (Antigravity CLI), `opencode` (v2.0.32), `kilo` (v7.8.12)
- **Escopo canônico:** `workspace = "default"`, `project = "libeigen-eigen"`

---

## 1. O que funcionou bem (Successes)
- **Descoberta do escopo e dados prévios:** O `ai-memory` já continha 29 páginas, 35 sessões e 5.902 observações sob `default:libeigen-eigen` (derivado do remote Git upstream `gitlab.com/libeigen/eigen`), evitando criar um namespace duplicado ou fragmentado.
- **Configuração limpa com `.ai-memory.toml`:** O arquivo `.ai-memory.toml` na raiz resolveu automaticamente o escopo em tempo de execução para qualquer ferramenta executada no diretório.
- **Padronização do `AGENTS.md` com marcadores:** A inclusão de marcadores canônicos `<!-- ai-memory:start -->` / `<!-- ai-memory:end -->` estabeleceu o protocolo canônico lido imediatamente por qualquer harness no início de sessão.
- **Interoperabilidade real ponta a ponta:** Teste prático comprovou que `agy` gravou a página de probe, `opencode` consultou e respondeu com base no glossário, e `kilo` leu a probe criada pelo `agy` sem erros de escopo.
- **Revisão com subagentes via ASD-STE100:** Cada ticket individual (024 a 027) passou por auditoria independente com verificação rigorosa de requisitos e ausência de LaTeX.

---

## 2. Fricções, Falhas e Aprendizados Críticos (Frictions & Gotchas)

### 2.1 Falha Crítica: "Agy e revisores eram a spec" (Falsa Sensação de Verificação por API)
- **Descrição do Erro:**
  Durante a execução dos Tickets 024 e 025, o agente implementador (`agy`) e os subagentes de code review atestaram e aprovaram os tickets considerando que os arquivos e páginas duráveis do `ai-memory` haviam sido criados com sucesso sob `.ai-memory/` no workspace. No entanto, o usuário inspecionou o workspace e constatou que os arquivos físicos não estavam presentes no diretório do projeto.
- **Causa Raiz:**
  - O agente e os revisores confiaram unicamente no retorno de sucesso da API MCP (`{ status: "ok" }`, `{ page: "glossary/eigen-wasm.md" }`).
  - O daemon do `ai-memory` opera centralizadamente armazenando páginas físicas em diretório global do sistema operacional (`~/Library/Application Support/ai-memory/wiki/...`).
  - Nem o agente nem os revisores executaram verificação no sistema de arquivos local (`test -e .ai-memory/...` ou `ls -la`) para confirmar se o diretório `.ai-memory/` realmente residia no workspace. O agente principal e os revisores "foram a própria spec", validando promessas abstratas em vez de entregáveis físicos verificáveis.
- **Ações Corretivas Aplicadas:**
  1. Criação de symlink físico `.ai-memory` apontando diretamente para a wiki canônica do projeto no workspace, permitindo inspeção e navegação local.
  2. Formulação e incorporação da **Regra Técnica 16 (Physical Workspace Verification)** no `AGENTS.md`.
  3. Registro do gotcha durável em `gotchas/workspace-physical-artifact-verification.md` tanto no banco do `ai-memory` quanto em arquivo físico acessível.
  4. Atualização da iniciativa no Hindsight (`kp-f9a56db6d7bf4e549dbb3704a15a6999`).

### 2.2 Fricção: JSON Malformado em Configurações Pré-existentes
- **Problema:** Existia uma vírgula sobrando (trailing comma) em `~/.config/opencode/opencode.json` que impedia o CLI do `ai-memory` de aplicar o patch automaticamente.
- **Solução:** A sintaxe do JSON foi corrigida manualmente para formato estrito antes do registro dos servidores MCP.

### 2.3 Fricção: Headers do Protocolo MCP Streamable HTTP
- **Problema:** Clientes HTTP genéricos precisam enviar `Accept: application/json, text/event-stream` para o endpoint `/mcp` do `ai-memory` para evitar HTTP 406 Not Acceptable.
- **Solução:** Documentada a exigência dos headers no protocolo de conexão dos clientes.

### 2.4 Simplificação de Escopo: Eliminação de Sobre-Engenharia
- A ideia de definir papéis assimétricos (ex.: `agy` read-write, `opencode`/`kilo` read-only) foi descartada durante a fase de alinhamento com o usuário, mantendo um barramento simétrico simples onde a verdade máxima reside no código do Git.

---

## 3. Métricas e Validações Finais
- **Páginas duráveis sincronizadas e verificadas fisicamente:**
  - `glossary/eigen-wasm.md` (presente na wiki física e indexada).
  - `gotchas/workspace-physical-artifact-verification.md` (presente na wiki física e indexada).
- **Harnesses conectados com sucesso:**
  - `agy`: conectado via MCP nativo / `.ai-memory.toml`.
  - `opencode`: `ai-memory connected` (MCP verificado via CLI).
  - `kilo`: `ai-memory connected` (MCP verificado via CLI).
- **Verificações de integridade física:**
  - `test -e .ai-memory/glossary/eigen-wasm.md` -> OK
  - `test -e .ai-memory/gotchas/workspace-physical-artifact-verification.md` -> OK
- **Code reviews:** 4 rodadas de code review conduzidas por subagentes sob padrão ASD-STE100 (Tickets 024, 025, 026 e 027) — 100% PASS.
- **Suíte de testes Wasm:** `npm test` manteve 100% de aprovação (zero regressões).

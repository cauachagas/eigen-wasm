# Specification: ai-memory Cross-Harness Knowledge Integration

## 1. Context and Problem Statement

Project knowledge for `eigen-wasm` is currently fragmented across multiple documentation files, and different LLM agents or execution harnesses (`agy`, `opencode`, `kilo`) risk starting work from disparate assumptions or rediscovering prior solutions.

The goal is to integrate `ai-memory` as the external persistent knowledge layer (Cross-Harness Memory), ensuring that any harness and underlying model can read and write to the same mental map of the project, architecture decisions, and session handoffs.

The code in Git remains the ultimate source of truth. External Obsidian vault synchronization (such as `second-brain`) and complex role-based access restrictions between harnesses are explicitly out of scope for this initiative.

---

## 2. Architecture and Scope Definition

### 2.1 Canonical Knowledge Scope
- **Workspace**: `default`
- **Project**: `libeigen-eigen` (auto-derived from the upstream Git remote `gitlab.com/libeigen/eigen`, preserving existing 29 knowledge pages and 35 session records).
- **Declaration**: Declared in `.ai-memory.toml` at the repository root.

### 2.2 Storage and Git Hygiene
- Storage data resides locally in `.ai-memory/`.
- The `.ai-memory/` directory is added to `.gitignore`.
- `.ai-memory.toml` is committed to Git to ensure all harnesses resolve the identical scope.

### 2.3 Cross-Harness MCP Integration
- **`agy` (Antigravity CLI)**: Connected via built-in MCP configuration (`ai-memory` tool cluster).
- **`opencode`**: Connected via MCP server entry in `~/.config/opencode/opencode.json`.
- **`kilo`**: Connected via MCP server entry in `~/.config/kilo/kilo.jsonc`.

---

## 3. EARS System Requirements

### 3.1 Ubiquitous Requirements
- **REQ-UBI-01**: The system shall use `workspace = "default"` and `project = "libeigen-eigen"` as the canonical memory scope across all harness interactions.
- **REQ-UBI-02**: The system shall isolate local SQLite database files under `.ai-memory/` without tracking them in Git version control.

### 3.2 Event-Driven Requirements
- **REQ-EVT-01**: When an agent in any harness initializes a work session, the system shall provide access to the latest project context via `memory_query`, `memory_read_page`, or `memory_briefing`.
- **REQ-EVT-02**: When an agent wraps up an active session or requests a context save, the system shall generate a single-use handoff via `memory_handoff_begin`.
- **REQ-EVT-03**: When a subsequent agent in a different harness starts work, the system shall allow claiming the open handoff via `memory_handoff_accept`.

### 3.3 State-Driven Requirements
- **REQ-STA-01**: While operating in any supported harness (`agy`, `opencode`, `kilo`), the system shall resolve the identical set of durable pages (`concepts/`, `decisions/`, `gotchas/`, `_rules/`) declared under `default:libeigen-eigen`.

### 3.4 Unwanted Behavior Requirements
- **REQ-UWT-01**: If an MCP client calls `ai-memory` without explicit scope parameters, then the system shall resolve the scope via `.ai-memory.toml` rather than falling back to unmapped default workspaces.
- **REQ-UWT-02**: If an agent attempts to store transient raw output or excessive logs as durable pages, then the system shall reject or discourage the write, reserving durable pages for facts, decisions, and gotchas.

---

## 4. Ticket Deconstruction and Implementation Plan

1. **Ticket 024**: Scope Configuration, AGENTS.md Instructions, and Local Storage Setup (`.ai-memory.toml`, `AGENTS.md`, and `.gitignore`).
2. **Ticket 025**: Foundational Knowledge Verification (validate that core Eigen-WASM decisions, gotchas, and glossary are indexed and queryable in `default:libeigen-eigen`).
3. **Ticket 026**: Cross-Harness MCP Configuration (`agy`, `opencode`, and `kilo`).
4. **Ticket 027**: End-to-End Interoperability Test (Write/handoff in one harness, verify read/accept in the others).

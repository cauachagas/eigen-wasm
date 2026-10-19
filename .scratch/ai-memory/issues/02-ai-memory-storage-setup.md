# Ticket 024: ai-memory scope, AGENTS.md instructions, and storage configuration

Status: closed

Set up the project-level `.ai-memory.toml` configuration, update canonical `AGENTS.md` instructions, and establish storage hygiene for the `eigen-wasm` repository to bind all LLM harnesses (`agy`, `opencode`, `kilo`) canonically to `workspace = "default"` and `project = "libeigen-eigen"`.

**What to build:**
1. Configure canonical `<!-- ai-memory:start -->` markered block in `AGENTS.md` declaring the scope and cross-harness protocol.
2. Create `.ai-memory.toml` at repository root defining `workspace = "default"` and `project = "libeigen-eigen"`.
3. Configure `.gitignore` to include `.ai-memory/` to keep local SQLite storage and cache out of Git commits.
4. Verify that `memory_status` without manual parameters correctly resolves to `default:libeigen-eigen`.

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] Verify canonical markered block in `AGENTS.md`.
- [x] Create `.ai-memory.toml` with `workspace = "default"` and `project = "libeigen-eigen"`.
- [x] Add `.ai-memory/` to `.gitignore`.
- [x] Verify `memory_status` returns `scope: { workspace: "default", project: "libeigen-eigen" }`.
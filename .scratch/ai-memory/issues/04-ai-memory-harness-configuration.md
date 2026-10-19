# Ticket 026: Harness configuration for ai-memory access

Status: closed

Configure all LLM harnesses (agy, opencode, kilo) to access the shared ai-memory storage location ensuring consistent knowledge access across all development and evaluation contexts.

**What to build:** The configuration of all LLM harnesses to access the shared ai-memory storage location, ensuring that agy (primary), opencode (reviewer), and kilo (evaluation) all access the same project knowledge base.

**Blocked by:** 024-ai-memory-storage-setup

**Status:** closed

- [x] Configure agy to use the project's ai-memory storage location
- [x] Configure opencode to use the project's ai-memory storage location via MCP
- [x] Configure kilo to use the project's ai-memory storage location via MCP
- [x] Verify all harnesses can successfully access and retrieve knowledge from the shared storage
- [x] Confirm knowledge consistency across all harnesses
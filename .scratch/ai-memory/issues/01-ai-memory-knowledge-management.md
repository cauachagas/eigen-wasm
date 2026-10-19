# Ticket 023: ai-memory knowledge management system

Status: ready-for-agent

Create a comprehensive ai-memory knowledge management system for the Eigen-wasm project to ensure all LLMs/agents/harnesses (agy, opencode, kilo) have access to the same project knowledge, decisions, and best practices.

## Problem Statement

Currently, project knowledge is scattered across various sources (AGENTS.md, RULES.md, issue tickets, etc.) and is not consistently accessible when switching between different LLM agents or harnesses. When evaluating new harnesses like kilo alongside established ones like agy (primary) and opencode (reviewer), there's no guaranteed common starting point for knowledge, leading to:
- Inconsistent understanding of project architecture and decisions
- Repeated rediscovery of solutions and workarounds
- Loss of institutional knowledge when switching contexts
- Inefficient onboarding for new agents/harnesses

## Solution

Implement a structured ai-memory knowledge base that serves as the single source of truth for Eigen-wasm project knowledge, accessible to all LLM agents regardless of their harness or interface. This will include:
- Project-specific ai-memory storage location
- Standardized knowledge organization (glossary, decisions, procedures, gotchas)
- Cross-harness accessibility configuration
- OKF v0.2 compatibility for backup and exchange
- Continuous knowledge improvement processes

## User Stories

1. As a developer using agy (primary harness), I want to access the same project knowledge as when using opencode (reviewer) so that I maintain consistent understanding of the Eigen-wasm project.

2. As a developer evaluating kilo (new harness), I want to start with the complete project knowledge base so that I don't need to rediscover existing decisions and workarounds.

3. As a project maintainer, I want to document architectural decisions in ai-memory so that they are preserved and accessible to all future agents regardless of harness.

4. As a developer encountering a known issue, I want to quickly retrieve the documented solution from ai-memory so that I don't waste time re-solving known problems.

5. As a developer completing a work session, I want to create a handoff in ai-memory so that the next agent (regardless of harness) can continue seamlessly from where I left off.

6. As a project maintainer, I want to run periodic knowledge quality checks so that the ai-memory base remains accurate, consistent, and valuable.

7. As a developer, I want to backup the project knowledge base using OKF v0.2 format so that I can restore it or share it with external collaborators.

8. As a new contributor, I want to access the project glossary and terminology guide so that I can understand project-specific vocabulary quickly.

9. As a developer making a technical decision, I want to record it as an ADR in ai-memory so that the rationale and alternatives are preserved for future reference.

10. As a developer learning from a mistake, I want to document it as a gotcha in ai-memory so that others can avoid the same pitfall.

## Implementation Decisions

### Storage Location
- Use project-local ai-memory storage at `$HOME/Projects/wasm/eigen/.ai-memory/` to keep knowledge with the project
- This ensures the knowledge base moves with the repository and is accessible to all harnesses

### Knowledge Organization Structure
- **Glossary**: Project-specific terminology in `glossary/eigen-wasm.md`
- **Decisions**: Architecture Decision Records (ADR format) in `decisions/` directory
- **Procedures**: Standard operating procedures in `procedures/` directory  
- **Gotchas**: Lessons learned and common pitfalls in `gotchas/` directory
- **Concepts**: Foundational explanations in `concepts/` directory
- **Rules**: Coding and contribution standards in `_rules/` directory

### Harness Configuration
- **agy**: Set `AI_MEMORY_DATA_DIR` environment variable to project storage path
- **opencode**: Configure MCP server in `~/.config/opencode/opencode.json` with `--data-dir` pointing to project storage
- **kilo**: Configure MCP server in `~/.config/kilo/kilo.jsonc` with `--data-dir` pointing to project storage

### Knowledge Flow
1. **Session Start**: Agents begin with `memory_query()` and `memory_briefing()` to load project context
2. **During Work**: Document decisions, learnings, and procedures as they occur using `memory_write_page()`
3. **Session End**: Create handoff using `memory_handoff_begin()` for next agent continuity
4. **Periodic Maintenance**: Run `memory_lint()` and `memory_auto_improve()` for quality assurance

### Technical Implementation
- Use ai-memory's MCP (Model Context Protocol) server for cross-harness accessibility
- Configure all harnesses to connect to the same ai-memory instance via MCP
- Leverage ai-memory's built-in versioning and conflict resolution
- Utilize OKF v0.2 export/import for backups and knowledge sharing

### Interface Specifications
- **Write Knowledge**: `memory_write_page(path, body, kind, entities, relations)` for creating/updating knowledge
- **Read Knowledge**: `memory_read_page(path)` or `memory_query(query)` for retrieving knowledge
- **Create Handoff**: `memory_handoff_begin(summary, next_steps, open_questions)` for session continuity
- **Quality Assurance**: `memory_lint()` for audit, `memory_auto_improve()` for improvement suggestions
- **Backup/Export**: `memory_export_okf()` for OKF v0.2 compliant knowledge bundles

## Testing Decisions

### What Makes a Good Test
- Tests verify that knowledge is correctly stored, retrieved, and persists across sessions
- Tests confirm that all configured harnesses can access the same knowledge base
- Tests validate that OKF v0.2 export/import preserves knowledge integrity
- Tests check that handoffs properly transfer session context between agents

### Modules to Test
- ai-memory storage and retrieval mechanisms
- MCP server configuration for each harness (agy, opencode, kilo)
- Knowledge organization structure and accessibility
- OKF v0.2 export/import functionality
- Handoff creation and consumption workflow

### Prior Art for Tests
- Existing Eigen-wasm test patterns in `test/` directory
- ai-memory's built-in validation and quality checking mechanisms
- Standard software documentation testing practices
- Cross-platform configuration validation patterns

## Out of Scope

- Modifying the core Eigen C++ codebase (remains frozen upstream)
- Changing the Emscripten compilation process or flags
- Altering the JavaScript binding interface for Wasm functions
- Modifying the existing test suite structure or validation methods
- Implementing features outside the ai-memory knowledge management system

## Further Notes

This spec implements the foundation for project knowledge retention that will:
1. Ensure consistent understanding across all LLM agents and harnesses
2. Preserve institutional knowledge regardless of individual agent transitions
3. Provide a scalable foundation for growing project documentation
4. Enable efficient onboarding for new contributors and evaluators
5. Maintain OKF v0.2 compatibility for knowledge exchange and backup

The implementation follows the Eigen-wasm project's existing patterns for documentation, issue tracking, and skill usage while introducing a robust knowledge management layer that benefits all stakeholders in the project ecosystem.
# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating
them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs`) creates them lazily when terms
or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── GLOSSARY.md
├── docs/agents/          ← tracker, triage labels, this file
├── docs/adr/
└── wasm/                 ← this fork's only code change
```

## What the glossary covers

The glossary describes the WebAssembly build under `wasm/`. The Eigen sources under `Eigen/`,
`contrib/Eigen/`, `unsupported/Eigen/` and `test/` are frozen upstream code and are not described here;
they carry their own vocabulary, which upstream documentation covers. Read the upstream docs when working
inside them, which for this repo means almost never, since they are not edited.

Where a term exists in both vocabularies, the term in `GLOSSARY.md` wins for work under `wasm/`.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the
project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
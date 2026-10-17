# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`. Nothing is published to GitHub or
GitLab. This fork does not open issues on `upstream`, which it does not control.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md`
  for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Specs

A feature's current spec is `.scratch/<feature-slug>/spec.md`. A feature directory may also carry
`spec-<name>.md` for a spec that extends or replaces the baseline one.

This repository has one such pair. `.scratch/eigen-wasm/spec.md` is the WebAssembly MVP: it established
the build, the `matMul3x3` export and the Node test suite, and it stays as the record of that stage.
`.scratch/eigen-wasm/spec-dense.md` is the current scope, covering the dense routines, and it supersedes
the MVP where the two disagree. Read `spec-dense.md` when work is about the routines; read `spec.md` when
work is about the build or the existing export.

Do not merge the two. They describe two different stages, and the MVP spec is what the earlier commits
were written against.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the
  body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:`
  line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists
  is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first
  by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a
  context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
# Indexing Rules

Use Graphify as source of truth for project structure.

`graphify-out/` is generated locally by Graphify and is not tracked in git, so a fresh clone may not
contain it. Run Graphify before reading the files listed below.

- Do not use `grep`, `find`, or `rg` for discovery.
- Read `graphify-out/graph.json` or `graphify-out/GRAPH_REPORT.md` for file mapping.
- For code navigation, query the graph via Graphify tool, not filesystem search.
- When needing a file list, use `graphify-out/manifest.json`.

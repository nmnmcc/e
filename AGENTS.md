# AGENTS.md

## General

- **Library usage must be source-verified** - when using any third-party library, read its source code in `references/` before changing code that depends on it. If the source is missing, add it as a git submodule pinned to a specific commit first.
- **Keep `README.md` in sync** - when a change affects public API, imports, usage, or examples, update `README.md`.
- **Persistent instructions go here** - when the user gives a standing instruction, write it into this file before doing other work.
- **Simple English only in `AGENTS.md`** - use short sentences and common words in this file.

## References

- `references/effect` contains the source for `effect` and `@effect/platform-node`.

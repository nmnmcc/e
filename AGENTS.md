# AGENTS.md

## General

- **Library usage must be source-verified** - when using any third-party library, read its source code in `references/` before changing code that depends on it. If the source is missing, add it as a git submodule pinned to a specific commit first.
- **Persistent instructions go here** - when the user gives a standing instruction, write it into this file before doing other work.
- **Simple English only in `AGENTS.md`** - use short sentences and common words in this file.
- **Keep value names short** - use short, clean names for values. If the meaning is clear, use at most two simple English words.
- **Prefer Effect object helpers** - use Effect helpers like `Array` before methods on values when they fit.
- **Name Effect helpers plainly** - import Effect helpers as names like `Array`. Use `Array.Array` or `globalThis.Array` for the base object.
- **Import Effect as Effect** - do not use names like `EffectModule`. Merge type and value imports from the same module.
- **Use Effect Match for complex branches** - use Effect `Match` when branch logic is too complex for one `if else`.
- **Import Data as Data** - import `effect/Data` as `Data`.
- **Use Effect Data** - use `Data.TaggedEnum` for closed `_tag` unions. Use its constructors when you make those values.
- **Use Data classes** - use `Data.Class` or `Data.TaggedClass` for small immutable values. Use `Data.TaggedError` for tagged errors.
- **Do not lean on Effect AI** - this project replaces the official Effect AI module. Follow this project's own ideas.
- **Do not use mutable bindings** - do not use `let`, `var`, or value reassignment. Do not use loops, since loops need mutable state.
- **Allow explicit undefined** - write optional fields as `x?: T | undefined` when code may pass `undefined` through.

## Effect Code Shape

- **Copy Effect layout** - follow `references/effect` for code shape inside files and across folders.
- **Use public modules** - put public code in `packages/<name>/src/Name.ts`. Use PascalCase file names.
- **Keep private code internal** - put private helpers in `packages/<name>/src/internal/name.ts`. Use camelCase file names.
- **Hide internals** - block `./internal/*` in package exports. Do not import another package's internal files.
- **Use package barrels** - keep `src/index.ts` as a package barrel. Do not hand-edit generated barrels.
- **Mirror Effect exports** - expose `.`, `./*`, and `./package.json` from each package when it fits.
- **Order public files like Effect** - start with module JSDoc, then imports, ids, models, services, constructors, layers, guards, accessors, and combinators.
- **Keep public files thin** - keep API, docs, and small glue in public modules. Move large shared implementation to `internal`.
- **Document public API** - give each public export JSDoc with `@category` and `@since`.
- **Place tests like Effect** - put runtime tests in `packages/<name>/test`. Put type tests in `packages/<name>/typetest`.

## References

- `references/effect` contains the source for `effect` and `@effect/platform-node`.
- `references/vercel-ai` contains the source for `ai` and `@ai-sdk/*`.
- `references/openai-node` contains the source for `openai`.
- `references/anthropic-sdk-typescript` contains the source for `@anthropic-ai/sdk`.

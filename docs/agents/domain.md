# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **multi-context** monorepo (Bun + Turborepo): the dashboard app, the database schema, and the dual auth layer are distinct domain contexts.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- The per-context **`CONTEXT.md`** files referenced by the map.
- **`docs/adr/`** at the repo root — system-wide architectural decisions.
- **`<workspace>/docs/adr/`** — context-scoped decisions (e.g. `packages/db/docs/adr/`). Read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context layout — the presence of `CONTEXT-MAP.md` at the root marks it:

```
/
├── CONTEXT-MAP.md                     ← points at each CONTEXT.md
├── docs/adr/                          ← system-wide decisions
├── apps/web/
│   ├── CONTEXT.md
│   └── docs/adr/                      ← dashboard-specific decisions
└── packages/
    ├── db/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← schema-specific decisions
    └── auth/
        ├── CONTEXT.md
        └── docs/adr/                  ← auth-specific decisions
```

Note: this repo already keeps canonical agent guidance in `CLAUDE.md` at the repo root plus per-workspace `CLAUDE.md` files (`apps/web/CLAUDE.md`, `packages/db/CLAUDE.md`). A `CONTEXT.md` is narrower — it is the domain glossary for a context, not a full stack guide.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

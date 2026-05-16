# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` at the repo root holds the domain glossary for the whole monorepo. The technical split into `apps/` and `packages/` is not a domain boundary — the ubiquitous language (Tool, Variant, Category, Order, Client, Branch, Capability…) is shared across every workspace.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary: ubiquitous language, bounded contexts, domain invariants.
- **`docs/adr/`** at the repo root — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context layout:

```
/
├── CONTEXT.md                         ← domain glossary for the whole monorepo
├── docs/adr/                          ← architectural decisions
├── apps/
│   └── web/
└── packages/
    ├── db/
    ├── auth/
    └── ...
```

Note: this repo also keeps stack/workflow guidance in `CLAUDE.md` at the repo root plus per-workspace `CLAUDE.md` files (`apps/web/CLAUDE.md`, `packages/db/CLAUDE.md`). `CONTEXT.md` is narrower and orthogonal — it is the domain glossary, not a stack guide.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (see its "Termos preferidos / a evitar" table).

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

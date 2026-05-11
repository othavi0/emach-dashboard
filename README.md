# emach-dashboard

Dashboard interno + base para futuro ecomerce BR. Monorepo Bun + Turborepo. Auth dual (Better Auth) sobre Supabase Postgres.

> **Para agentes/IA:** o guia canônico de stack, regras, design e workflows é `.claude/CLAUDE.md` (espelhado em `AGENTS.md`). Sistema visual completo em `DESIGN.md`.

## Stack

- **Runtime:** Bun 1.3 (workspaces + catalog)
- **Build:** Turborepo 2.9 (TUI)
- **Frontend:** Next 16 + React 19 (`apps/web`, port 3001)
- **UI:** shadcn/ui + Tailwind 4 + Base UI React (`packages/ui`)
- **DB:** PostgreSQL via Supabase + Drizzle ORM (`packages/db`)
- **Auth:** Better Auth 1.5 — dual instances (`packages/auth/src/dashboard.ts` + `ecommerce.ts`)
- **Env validation:** `@t3-oss/env-core` + Zod (`packages/env`)
- **Lint/format:** Biome 2.4.13 + Ultracite 7.6 (`bun fix`)
- **Storage:** Supabase Storage (`tool-images` bucket) para imagens de produtos
- **Design system:** Industrial neutrals warm-dark + copper, dark-mode único (ver `DESIGN.md`)

## Getting Started

```bash
bun install
```

## Database Setup

PostgreSQL + Drizzle ORM via Supabase.

1. Provisionar Postgres (Supabase ou local).
2. Popular `apps/web/.env` a partir de `apps/web/.env.example` (inclui `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_*`).
3. Aplicar schema:

```bash
bun db:push                                  # dev: schema → DB sem migration
bun --cwd packages/db db:apply-triggers      # triggers PL/pgSQL (anti-ciclo + idempotência)
bun --cwd packages/db db:seed-categories     # bootstrap 5 categorias raiz
bun --cwd packages/db db:seed-attributes     # attribute_definitions iniciais
```

Servidor de desenvolvimento:

```bash
bun dev:web    # apenas web em :3001 (preferido)
bun dev        # todos os apps em paralelo (Turbo TUI)
```

Abrir [http://localhost:3001](http://localhost:3001).

## UI Customization

Primitives shadcn/ui ficam em `packages/ui`.

- Tokens de design + globals: `packages/ui/src/styles/globals.css`
- Componentes shared: `packages/ui/src/components/*`
- shadcn aliases: `packages/ui/components.json` + `apps/web/components.json`

Adicionar primitives shared (rodar da raiz):

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import:

```tsx
import { Button } from "@emach/ui/components/button";
```

Blocks específicos do app: rodar shadcn CLI dentro de `apps/web` (não em `packages/ui`).

## Lint / Format

- `bun check` — dry-run (Ultracite check; falha se houver issue)
- `bun fix` — aplica fixes automáticos (também roda como PostToolUse hook)

## Project Structure

```
emach-dashboard/
├── apps/
│   └── web/                         # Next 16 dashboard (port 3001)
│       └── src/app/dashboard/{tools,categories,suppliers,branches,stock,promotions,orders,reviews}
├── packages/
│   ├── ui/                          # shadcn/ui primitives + globals.css
│   ├── auth/                        # Better Auth dual: dashboard.ts + ecommerce.ts
│   ├── db/                          # Drizzle schema + createDb factory + scripts
│   ├── env/                         # Zod-validated env (@t3-oss/env-core)
│   └── config/                      # tsconfig.base.json compartilhado
├── docs/
│   ├── integration/admin-ecommerce.md
│   └── storage-buckets.md
├── scripts/
│   ├── clean.sh
│   └── validate-bts.mjs
├── .claude/CLAUDE.md                # Guia canônico para Claude Code (e Codex via AGENTS.md)
├── DESIGN.md                        # Sistema visual industrial dark + copper
├── PRODUCT.md                       # Register product + personality + anti-references
└── .mcp.json                        # MCP servers: context7, supabase, shadcn, ...
```

## Available Scripts

| Script                                              | Função                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `bun dev`                                           | Inicia todos os apps em paralelo (Turbo TUI)                              |
| `bun dev:web`                                       | Inicia apenas o web (port 3001)                                           |
| `bun build`                                         | Build de todos os apps                                                    |
| `bun check-types`                                   | `tsc --noEmit` em todos os workspaces                                     |
| `bun check`                                         | Ultracite check (lint/format dry-run; falha se issue)                     |
| `bun fix`                                           | Ultracite fix (aplica auto-format)                                        |
| `bun db:push`                                       | dev: sincroniza schema → DB sem migration                                 |
| `bun db:generate`                                   | Gera SQL de migration versionada (`packages/db/src/migrations/*.sql`)     |
| `bun db:migrate`                                    | Aplica migrations pendentes (prod/staging)                                |
| `bun db:studio`                                     | UI inspetora de tabelas (drizzle-kit)                                     |
| `bun --cwd packages/db db:apply-triggers`           | Aplica `src/migrations/_triggers.sql` (anti-ciclo + idempotência)         |
| `bun --cwd packages/db db:seed-categories`          | Bootstrap 5 categorias raiz                                               |
| `bun --cwd packages/db db:seed-attributes`          | Bootstrap `attribute_definitions` iniciais por categoria                  |
| `bun --cwd packages/db db:anonymize-client <id>`    | LGPD direito ao esquecimento                                              |
| `bun clean`                                         | Remove `node_modules` + caches Turbo/Next                                 |

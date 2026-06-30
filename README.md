# emach-dashboard

Dashboard interno + base para futuro ecomerce BR. Monorepo Bun + Turborepo. Auth dual (Better Auth) sobre Supabase Postgres.

> **Para agentes/IA:** o guia canônico de stack, regras, design e workflows é `CLAUDE.md` no root (espelhado em `AGENTS.md`). Sistema visual completo em `DESIGN.md`.

## Stack

- **Runtime:** Bun 1.3 (workspaces + catalog)
- **Build:** Turborepo 2.9 (TUI)
- **Frontend:** Next 16 + React 19 (`apps/web`, port 3001)
- **UI:** shadcn/ui + Tailwind 4 + Base UI React (`packages/ui`)
- **DB:** PostgreSQL via Supabase + Drizzle ORM (`packages/db`)
- **Auth:** Better Auth 1.6 — instância dashboard em `packages/auth/src/dashboard.ts` (convite-only, ADR-0013); instância ecommerce vive no repo ecommerce (ADR-0004)
- **Env validation:** `@t3-oss/env-core` + Zod (`packages/env`)
- **Lint/format:** Biome 2.4.15 + Ultracite (`bun fix`)
- **Storage:** Supabase Storage (`tool-images` bucket) para imagens de produtos
- **Design system:** Industrial-workshop warm-dark + coral, Barlow Condensed caixa-alta em h1, dark-mode único, AAA (ver `DESIGN.md`)

## Getting Started

```bash
bun install
```

## Database Setup

PostgreSQL + Drizzle ORM via Supabase.

1. Provisionar Postgres (Supabase ou local).
2. Popular `apps/web/.env` a partir de `apps/web/.env.example` (inclui `DATABASE_URL` + `NEXT_PUBLIC_SUPABASE_*`).
3. Aplicar schema (push-only — ver ADR-0006):

```bash
bun db:sync                                  # drizzle-kit push + triggers + indexes
bun --cwd packages/db db:seed-demo           # fixture completo de dev (trunca + popula + verifica invariantes)
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
│       └── src/app/dashboard/{tools,categories,suppliers,branches,stock,promotions,orders,reviews,customers,users,site}
├── packages/
│   ├── ui/                          # shadcn/ui primitives + globals.css
│   ├── auth/                        # Better Auth dashboard: dashboard.ts (ecommerce no repo ecommerce — ADR-0004)
│   ├── db/                          # Drizzle schema + createDb factory + scripts
│   ├── env/                         # Zod-validated env (@t3-oss/env-core)
│   └── config/                      # tsconfig.base.json compartilhado
├── docs/
│   ├── adr/                         # Decisões arquiteturais (0001…0017)
│   ├── agents/                      # Guias de consumo de domínio/issues p/ agentes
│   ├── integration/admin-ecommerce.md
│   └── storage-buckets.md
├── scripts/
│   ├── clean.sh
│   └── validate-bts.mjs
├── CLAUDE.md                        # Guia canônico para Claude Code (e Codex via AGENTS.md)
├── DESIGN.md                        # Sistema visual industrial-workshop dark + coral + condensada
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
| `bun db:sync`                                       | drizzle-kit push + triggers + indexes (push-only — ADR-0006)              |
| `bun db:push`                                       | Só o schema Drizzle (sem triggers/indexes)                                |
| `bun db:studio`                                     | UI inspetora de tabelas (drizzle-kit)                                     |
| `bun --cwd packages/db db:apply-sql`                | Aplica `src/sql/{triggers,rls}.sql` (triggers + RLS deny-all, idempotente) |
| `bun --cwd packages/db db:seed-demo`                | Fixture completo de dev (trunca + popula + verifica invariantes)          |
| `bun --cwd packages/db db:reset-demo`               | Só trunca as tabelas demo (estado limpo, sem repopular)                   |
| `bun clean`                                         | Remove `node_modules` + caches Turbo/Next                                 |

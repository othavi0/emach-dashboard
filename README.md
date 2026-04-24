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
- **Lint/format:** Biome 2.4 + Ultracite 7.6
- **Storage:** Supabase Storage (`tool-images` bucket) para imagens de produtos
- **Design system:** "Anthropic/Claude" — warm parchment + terracotta (ver `DESIGN.md`)

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses PostgreSQL with Drizzle ORM.

1. Make sure you have a PostgreSQL database set up.
2. Update your `apps/web/.env` file with your PostgreSQL connection details.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the fullstack application.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@emach/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Git Hooks and Formatting

- Format and lint fix: `bun run check`

## Project Structure

```
emach-dashboard/
├── apps/
│   └── web/             # Next 16 dashboard (port 3001)
│       └── src/app/dashboard/(inventory)/{tools,stock,promotions}
├── packages/
│   ├── ui/              # shadcn/ui primitives + globals.css
│   ├── auth/            # Better Auth dual: dashboard.ts + ecommerce.ts
│   ├── db/              # Drizzle schema + createDb factory
│   ├── env/             # Zod-validated env (@t3-oss/env-core)
│   └── config/          # tsconfig.base.json compartilhado
├── docs/
│   └── auth/ecommerce-integration.md
├── .claude/CLAUDE.md    # Guia canônico para Claude Code (e Codex via AGENTS.md)
├── DESIGN.md            # Sistema visual Anthropic/Claude
└── .mcp.json            # MCP servers: context7, supabase, shadcn, ...
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run check`: Run Biome formatting and linting

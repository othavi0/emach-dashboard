# Agents — emach-dashboard

> **Fonte canônica de instruções:** `.claude/CLAUDE.md`. Toda regra de stack, auth, schema, design system, anti-patterns e workflow vive lá. Esse arquivo existe para que agentes que não auto-descobrem `.claude/CLAUDE.md` (Codex, OpenCode, etc.) encontrem o ponto de entrada.

## Quick reference

- **Stack:** Bun 1.3 + Turborepo 2.9, Next 16 / React 19 (`apps/web`), Drizzle + Supabase Postgres, Better Auth dual (dashboard + ecomerce), Tailwind 4 + shadcn (`packages/ui`).
- **Comandos:** `bun install`, `bun dev:web` (port 3001), `bun check`, `bun fix`, `bun check-types`, `bun db:push` (dev) / `bun db:generate` + `bun db:migrate` (prod).
- **Lint/format:** Ultracite (`bun fix`) — também roda como hook PostToolUse do Claude Code.
- **Idioma:** comunicação **PT**; identificadores e termos técnicos **EN**.
- **Commits:** Conventional Commits PT (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`). **Nunca** commitar sem confirmação explícita do user.

## Documentos a consultar

| Para... | Ler |
|---|---|
| Regras gerais (stack, auth, schema, anti-patterns, gotchas) | `.claude/CLAUDE.md` |
| Sistema visual completo (paleta, tipografia, componentes, depth) | `DESIGN.md` |
| Integrar app ecomerce passo-a-passo (footguns, env, cookies) | `docs/auth/ecommerce-integration.md` |
| Setup inicial / scripts disponíveis | `README.md` |

## Invariantes que NUNCA podem ser violados

1. `apps/web` **nunca** importa `@emach/db/schema/client` ou `@emach/auth/ecommerce`. App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession` — não há tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"` — apps em subdomínios isolam por host.
4. CPF/CNPJ: validação responsabilidade do app (zod refine + dígito verificador). Sempre normalizar (só dígitos) antes de persistir.
5. Migrations em prod: `drizzle-kit generate` + migration versionada. `--force` só em dev/staging.
6. Design: paleta exclusivamente warm-toned. Nada de cool blue-grays, gradientes traditional, sharp corners <6px ou pure white de fundo. Detalhes em `DESIGN.md`.
7. IDs gerados via `crypto.randomUUID()` em server actions/scripts — sem nanoid.

## Skills e MCPs disponíveis

Tabelas com gatilhos completos em `.claude/CLAUDE.md` (seções "Skills locais" e "MCP servers"). Resumo:

- **Skills:** `better-auth-best-practices`, `next-best-practices`, `next-cache-components`, `shadcn`, `supabase-postgres-best-practices`, `turborepo`, `ultracite`, `vercel-composition-patterns`, `vercel-react-best-practices`, `web-design-guidelines`.
- **MCP servers:** `context7` (docs libs), `better-auth` (HTTP Inkeep), `supabase` (HTTP), `shadcn`, `next-devtools`, `better-t-stack` (apenas histórico).

# Agents — apps/web

> **Fonte canônica:** `apps/web/CLAUDE.md` (convenções deste workspace) + `.claude/CLAUDE.md` no root (regras gerais do monorepo). Esse arquivo é o ponto de entrada para agentes que não auto-descobrem `CLAUDE.md`.

## Quick reference

Dashboard Next 16 / React 19 em `port 3001`. Estrutura por feature em `src/app/dashboard/<feature>/`:

- `page.tsx` — Server Component.
- `actions.ts` — `"use server"`. Padrão `ActionResult<T>`.
- `schema.ts` — Zod.
- `_components/*.tsx` — colocated (kebab-case file, PascalCase component).

## Documentos a consultar

| Para...                                                       | Ler                                                |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Convenções deste workspace (forms, capabilities, cache, UX)   | `apps/web/CLAUDE.md`                               |
| Stack, auth, schema, anti-patterns, gotchas globais           | `.claude/CLAUDE.md`                                |
| Schema Drizzle (tabelas, FKs, triggers)                       | `packages/db/CLAUDE.md`                            |
| Sistema visual                                                | `DESIGN.md`                                        |

## Invariantes locais

1. **Nunca** importar `@emach/db/schema/client` ou `@emach/auth/ecommerce` daqui (P0).
2. Server actions sensíveis começam com `await requireCapability("...")` — ver `src/lib/permissions.ts`.
3. Server Components que precisam ler sessão usam `requireCurrentSession()` ou `requireCapabilityOrRedirect(cap)`.
4. Logs vão por `src/lib/logger.ts` — `console.*` é banido em código de produção.
5. Forms em modo `create` têm slug auto-gerado e disabled; em `edit` editável com aviso. Ver convenção em `apps/web/CLAUDE.md` (seção "Convenções de UX em forms").
6. Erros de validação Zod renderizam em painel no topo do form (lista todos os issues), não só o primeiro.

## Smoke run-time

`tsc` valida tipos mas **não** detecta SQL inválido em template strings nem queries que usam colunas removidas. Após refactor de schema/queries SSR, sempre rodar `bun dev:web` e visitar as rotas afetadas. Stack trace via MCP `next-devtools`: `nextjs_call <port> get_errors`.

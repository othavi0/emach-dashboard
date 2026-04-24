# Emach Dashboard — Guia Claude Code

Monorepo Bun + Turborepo. Dashboard Next 16 / React 19 com auth dual (funcionários internos × clientes BR), Supabase Postgres + Drizzle, design system inspirado em Anthropic/Claude.

> **Documentos referenciados (leia antes de tocar no domínio):**
> - `DESIGN.md` — sistema visual completo (paleta warm parchment + terracotta, Anthropic Serif, ring shadows). Toda mudança de UI deve seguir.
> - `docs/auth/ecommerce-integration.md` — passo-a-passo + footguns para integrar o app ecomerce.
> - `bts.jsonc` — origem do scaffold (Better-T-Stack), apenas histórico.

---

## Stack

| Camada | Versão | Onde |
|---|---|---|
| Runtime / package manager | Bun 1.3.11 | `package.json` (catalog) |
| Build orquestrador | Turborepo 2.9.6 | `turbo.json` |
| Frontend | Next 16.2 + React 19.2 | `apps/web` |
| UI primitives | shadcn/ui + Tailwind 4.1 + Base UI React | `packages/ui` |
| ORM | Drizzle 0.45 + node-postgres | `packages/db` |
| DB | Supabase Postgres + Storage (`tool-images` bucket) | env: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*` |
| Auth | Better Auth 1.5.5 (dual instances) | `packages/auth` |
| Env validation | `@t3-oss/env-core` + Zod | `packages/env` |
| Linter / formatter | Biome 2.4.12 + Ultracite 7.6 | `biome.json` |
| TypeScript | 6.0 (strict, noUncheckedIndexedAccess) | `packages/config/tsconfig.base.json` |

IDs em server actions/scripts: **`crypto.randomUUID()`** (sem nanoid).

---

## Topologia

```
apps/
  web/                    Next 16 dashboard (port 3001)
    src/app/
      login/              Pública
      dashboard/          Protegida via requireCurrentSession
        (inventory)/      Route group: tools/, stock/, promotions/
        branches/, suppliers/, product-types/
      api/auth/[...all]/  Better Auth catch-all (dashboard)
    src/lib/
      auth-client.ts      Better Auth client (browser)
      session.ts          getCurrentSession / requireRole helpers
      supabase-server.ts  Service-role client (uploads)

packages/
  auth/   src/dashboard.ts, src/ecommerce.ts (instâncias isoladas)
  db/     src/index.ts (createDb + db singleton); src/schema/*.ts
  env/    src/server.ts (Zod-validated env)
  ui/     src/components/* (50+ shadcn primitives) + src/styles/globals.css
  config/ tsconfig.base.json (compartilhado)
```

---

## Comandos do dia-a-dia

```bash
bun install                        # instalar
bun dev:web                        # apenas o web em :3001 (preferido)
bun dev                            # todos os apps em paralelo (Turbo TUI)
bun check                          # ultracite check (lint+format dry-run)
bun fix                            # ultracite fix (auto-format) — também roda como hook PostToolUse
bun check-types                    # tsc --noEmit em todos os workspaces

# DB (em desenvolvimento)
bun db:push                        # drizzle-kit push (schema → DB sem migration)
bun db:studio                      # UI inspetora de tabelas

# DB (produção/staging)
bun db:generate                    # cria SQL de migration versionada
bun db:migrate                     # aplica migrations pendentes

bun clean                          # remove node_modules + caches Turbo/Next
```

Env de scripts em `packages/*/scripts/*` resolve `.env` via path múltiplo (commit `f0f2992`). Para rodar local: garantir `apps/web/.env` populado a partir de `apps/web/.env.example`.

---

## Auth — regras invioláveis

Duas instâncias **completamente isoladas** Better Auth, mesmo banco Supabase, escopos disjuntos.

| Instância | Import | Tabelas | Cookie prefix | trustedOrigins | Consumer |
|---|---|---|---|---|---|
| Dashboard (admin/manager/user) | `@emach/auth/dashboard` → `authDashboard`, `DashboardSession` | `user`, `session`, `account`, `verification` | default | `CORS_ORIGIN` | `apps/web` |
| Ecomerce (clientes BR) | `@emach/auth/ecommerce` → `authEcommerce`, `EcommerceSession` | `client`, `clientSession`, `clientAccount`, `clientVerification`, `clientAddress` | `ecommerce` | `ECOMMERCE_ORIGIN` | `apps/<futuro>` |

**Invariantes (P0 — qualquer violação é bug crítico):**

1. `apps/web` **nunca** importa `@emach/db/schema/client` nem `@emach/auth/ecommerce`. App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession`. Não há tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`. Apps em subdomínios distintos isolam por host.
4. CPF/CNPJ: validação é responsabilidade do app (zod refine + dígito verificador). Sempre normalizar (só dígitos) antes de persistir em `client.document`.
5. Migrations em prod: `drizzle-kit generate` + migration versionada. `--force` só em dev/staging.

**Roles dashboard** (extensíveis): `user.role = "admin" | "manager" | "user"`. Verificação via `requireRole("admin")` em server actions. `client` **não** tem `role`.

**Env compartilhado:** `DATABASE_URL`, `BETTER_AUTH_SECRET` (ok enquanto subdomínios). **Específicos:** dashboard precisa `BETTER_AUTH_URL` + `CORS_ORIGIN`; ecomerce precisa `BETTER_AUTH_URL_ECOMMERCE` + `ECOMMERCE_ORIGIN` (fallbacks aceitáveis no env central).

---

## Schema Drizzle (`packages/db/src/schema/`)

| Arquivo | Tabelas-chave | Notas |
|---|---|---|
| `auth.ts` | `user`, `session`, `account`, `verification` | Better Auth padrão. `user.role` enum extensível. |
| `client.ts` | `client`, `clientSession`, `clientAccount`, `clientVerification`, `clientAddress` | Campos BR (`country` default `"BR"`, `phone`, `document` unique nullable). |
| `tools.ts` | `productType`, `supplier`, `tool`, `toolImage` | `tool.sku`/`barcode` unique; `model` agrupa variantes de voltagem; `invoiceModel` repete legitimamente; enums `productType` e `status`; visibilidade pública = `status='active' AND visibleOnSite=true`. |
| `inventory.ts` | `branch`, `stockLevel` | `stockLevel` tem `minQty` + `reorderPoint` por filial (check `reorder >= min`). |
| `promotions.ts` | `promotion`, `promotionTool` | Join tools↔promotion. |
| `stock-movements.ts` | `stockMovement` | Audit trail; enum `StockMovementReason`. |
| `api-keys.ts` | `apiKey` | Credenciais externas. |

**Variantes de voltagem (127V/220V):** rows `tool` separadas compartilhando `model`. **Não há** tabela `tool_variant`.

`packages/db/src/index.ts` exporta `createDb()` (factory, usada em `@emach/auth/*`) e `db` (singleton, usado em server actions). Manter o factory para auth (evita ciclo de import com env). Em código novo do app, prefira `import { db } from "@emach/db"`.

---

## Design system — `DESIGN.md`

Sistema "Claude/Anthropic" — paleta exclusivamente **warm-toned**. Toda decisão de UI deve passar pelo doc.

**Paleta crítica (memorize ou consulte sempre):**
- Brand CTA: Terracotta `#c96442`
- Page bg: Parchment `#f5f4ed`
- Card surface: Ivory `#faf9f5`
- Text primário: Anthropic Near Black `#141413`
- Text secundário: Olive Gray `#5e5d59`
- Bordas claras: Cream `#f0eee6`

**Não:** cool blue-grays, gradientes tradicionais, sharp corners <6px, `<img>` puro, sans-serif para títulos, pure white de fundo, drop shadow pesado, injeção de HTML cru via APIs perigosas.
**Sim:** Anthropic Serif weight 500 para headlines (1 só weight), ring shadows `0px 0px 0px 1px`, line-height 1.60 em body, `<Image>` do Next, alternância light/dark de seções.

Toda revisão de componente UI: **rodar a skill `web-design-guidelines` antes de aprovar**.

---

## Skills locais (`.claude/skills/` → `.agents/skills/`)

Skills carregadas localmente. Use a tool `Skill` quando o gatilho bater.

| Skill | Quando usar |
|---|---|
| `better-auth-best-practices` | Configurar/auditar Better Auth, plugins, sessões, adapters. |
| `next-best-practices` | RSC boundaries, async APIs, route handlers, image/font, metadata Next 16. |
| `next-cache-components` | PPR, `use cache`, `cacheLife`, `cacheTag`, `updateTag` no Next 16. |
| `shadcn` | Adicionar/buscar/auditar componentes shadcn — preferir antes de instalar manual. |
| `supabase-postgres-best-practices` | Performance, schema, RLS, índices, queries. |
| `turborepo` | Mexer em `turbo.json`, pipelines, caching, `--filter`, `--affected`, boundaries. |
| `ultracite` | Setup, lint/format, troubleshoot Biome. Em geral basta `bun fix`. |
| `vercel-composition-patterns` | Refator de boolean-prop hell, compound components, render props, React 19 APIs. |
| `vercel-react-best-practices` | Performance React/Next, bundling, data fetching, Server Components. |
| `web-design-guidelines` | **Obrigatório** antes de aprovar qualquer mudança visual significativa. |

---

## MCP servers (`.mcp.json`)

Quando usar cada um:

| MCP | Quando |
|---|---|
| `context7` | Docs atualizadas de **qualquer** lib. Em código novo / migração / refactor com import: invocar via skill `context7-cli` (preferida — passa pelo RTK). |
| `better-auth` (Inkeep HTTP) | Pergunta específica sobre API/feature do Better Auth — usar quando context7 não basta. |
| `supabase` (HTTP) | `list_tables`, `execute_sql`, `generate_typescript_types`, `get_advisors`, logs. **Confirmar custo** antes de operações pagas. |
| `shadcn` | `search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`. Preferir sobre `npx shadcn add` quando precisar inspecionar antes. |
| `next-devtools` | `nextjs_docs`, `nextjs_call`, `browser_eval`, `enable_cache_components` (Next 16 Cache Components flag). |
| `better-t-stack` | Apenas histórico — projeto já scaffoldado. Usar só para `bts_add_addons` se decidir adicionar feature do BTS. |

---

## Workflow de mudança

1. **Antes de tocar UI:** abrir `DESIGN.md` na seção relevante; invocar `web-design-guidelines` se for review.
2. **Antes de tocar schema:** editar `packages/db/src/schema/*.ts` → em dev `bun db:push`; em prod `bun db:generate` + commit da migration + `bun db:migrate`.
3. **Server actions:** sempre `"use server"` no topo, `await requireRole(...)` ou `requireCurrentSession()` no início, validar input com Zod, normalizar antes de persistir.
4. **Imagens em forms:** upload via `uploadToolImage(formData)` (`apps/web/.../image-actions.ts`), URL pública vai pro form; deletar via `deleteToolImage(url)`.
5. **Validação targeted first:** `bun check-types` no workspace alterado, `bun fix` no escopo. Suite inteira só se necessário.
6. **Commit:** Conventional Commits em **PT** (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`). **Nunca** commitar sem confirmação explícita do user.
7. **PR:** `gh pr create` — título <70 chars, body com Summary + Test plan.

---

## Anti-patterns banidos (P0/P1)

- `console.log/warn/error` em código de produção (exceto logger central). Em catch de server action, usar `throw new Error("mensagem")` que server action devolve como `actionResult.error`.
- `: any`, `<any>`, `as any`, `@ts-ignore`, `@ts-expect-error` (exceto em `.next/` gerado).
- `key={index}` em `.map()` — usar ID estável.
- `<img>` puro — sempre `next/image`.
- `React.forwardRef` — React 19 usa `ref` como prop normal.
- Barrel files (`index.ts` que só re-exporta) em `packages/ui/src`, `apps/web/src`, `packages/auth/src`.
- `async function` em Client Component (`"use client"`) — usar Server Component pra fetching.
- `.forEach()` em hot path — preferir `for...of`.
- `new RegExp(...)` ou regex literal dentro de loops — extrair top-level.
- `target="_blank"` sem `rel="noopener"`.
- APIs que injetam HTML não-sanitizado (a "perigosa" do React) — evitar exceto necessidade absoluta com sanitização (DOMPurify).
- Cool blue-grays no design — todo neutro tem undertone yellow-brown.

---

## Gotchas conhecidos

- **`createDb()` × `db` singleton:** `packages/auth/src/*` chama `createDb()` para evitar ciclo de import; resto do código usa `db` exportado. Não "consertar" forçando um padrão único.
- **Hook auto-format:** `.claude/settings.json` registra PostToolUse hook que roda `bun fix --skip=correctness/noUnusedImports` após `Write`/`Edit`. Se sumir esse hook, edições deixam de auto-formatar.
- **`.env` resolution para scripts em `packages/*`:** carregamos de múltiplos paths (commit `f0f2992`). Não assumir `process.cwd()`.
- **Master Part List:** importação de 34 SKUs em status `draft` (commit `421189b`) — itens existem mas não são públicos. Para promover, mudar `status` para `active` + `visibleOnSite=true`.
- **Schema regredido em `2dacae8`:** corrigido em `35972ca`. Histórico para contexto se algo parecer estranho em `inventory.ts`/`tools.ts`.

---

## Onde se aprofundar

- **Auth ecomerce passo-a-passo:** `docs/auth/ecommerce-integration.md`
- **Sidebar logout design:** `docs/superpowers/specs/2026-04-23-sidebar-logout-design.md`
- **Ultracite rules detalhadas:** rodar skill `ultracite` ou consultar `node_modules/ultracite/dist`
- **Tudo de UI:** `DESIGN.md`

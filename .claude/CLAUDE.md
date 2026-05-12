# Emach Dashboard — Guia Claude Code

Monorepo Bun + Turborepo. Dashboard Next 16 / React 19 com auth dual (funcionários internos × clientes BR), Supabase Postgres + Drizzle, design system industrial dark + copper.

> **Documentos referenciados (leia antes de tocar no domínio):**
>
> - `DESIGN.md` — sistema visual completo (industrial neutrals warm-dark + copper `oklch(0.65 0.15 45)` + Inter sans + 6 roles cromáticos). Toda mudança de UI deve seguir.
> - `docs/integration/admin-ecommerce.md` — contrato DB compartilhada (admin ↔ site ecomerce) + tabelas owned-by-dashboard.
> - `docs/storage-buckets.md` — Supabase Storage `tool-images` bucket (criação + URL pattern + cleanup).
> - `PRODUCT.md` — register product, personality (confiante/técnico/denso), anti-references.

---

## Stack

| Camada                    | Versão                                             | Onde                                           |
| ------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Runtime / package manager | Bun 1.3.11                                         | `package.json` (catalog)                       |
| Build orquestrador        | Turborepo 2.9.6                                    | `turbo.json`                                   |
| Frontend                  | Next 16.2 + React 19.2                             | `apps/web`                                     |
| UI primitives             | shadcn/ui + Tailwind 4.1 + Base UI React           | `packages/ui`                                  |
| ORM                       | Drizzle 0.45 + node-postgres                       | `packages/db`                                  |
| DB                        | Supabase Postgres + Storage (`tool-images` bucket) | env: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`  |
| Auth                      | Better Auth 1.5.5 (dual instances)                 | `packages/auth`                                |
| Markdown render           | `react-markdown` + `rehype-sanitize`               | `apps/web/src/components/tool-description.tsx` |
| Env validation            | `@t3-oss/env-core` + Zod                           | `packages/env`                                 |
| Linter / formatter        | Biome 2.4.13 + Ultracite 7.6                       | `biome.json`                                   |
| TypeScript                | 6.0 (strict, noUncheckedIndexedAccess)             | `packages/config/tsconfig.base.json`           |

IDs em server actions/scripts: **`crypto.randomUUID()`** (sem nanoid).

---

## Topologia

```
apps/
  web/                    Next 16 dashboard (port 3001)
    src/app/
      login/              Pública
      dashboard/          Protegida via requireCurrentSession
        tools/            Ferramentas (catálogo) — variantes, specs dinâmicas, mídia
        categories/       Árvore hierárquica + painel de atributos por categoria
        suppliers/        Fornecedores
        branches/         Filiais
        stock/            Visão por ferramenta + por filial; movimentos por variante
        promotions/       Promoções e cupons
        orders/           Pedidos (read + status update)
        customers/        (planejado Fase C) clientes, leads, tags, exports
        site/             (planejado Fase D) banners, settings, anúncios
        reviews/          Moderação de avaliações
      api/auth/[...all]/  Better Auth catch-all (dashboard)
    src/components/
      tool-description.tsx  Renderer markdown sanitizado (descrição de ferramenta)
    src/lib/
      auth-client.ts      Better Auth client (browser)
      session.ts          getCurrentSession / requireRole helpers
      permissions.ts      Capabilities + can() + requireCapability
      consent.ts          LGPD: logConsent / revokeConsent / getActiveConsent
      logger.ts           Logger central
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
bun --cwd packages/db db:apply-triggers    # aplica src/migrations/_triggers.sql (anti-ciclo + idempotência)

# DB (produção/staging)
bun db:generate                    # cria SQL de migration versionada
bun db:migrate                     # aplica migrations pendentes

# DB scripts utilitários (em packages/db)
bun --cwd packages/db db:seed-categories       # bootstrap 5 categorias raiz
bun --cwd packages/db db:seed-attributes       # bootstrap attribute_definitions iniciais por categoria
bun --cwd packages/db db:anonymize-client <id> # LGPD direito ao esquecimento

bun clean                          # remove node_modules + caches Turbo/Next
```

Env de scripts em `packages/*/scripts/*` resolve `.env` via path múltiplo. Para rodar local: garantir `apps/web/.env` populado a partir de `apps/web/.env.example`.

### Drop & recreate em dev

Se o schema diverge muito e drizzle-kit não consegue resolver renames (TTY prompt em CI):

```bash
# DROP SCHEMA public CASCADE; CREATE SCHEMA public;  via pg client
# depois: bunx drizzle-kit push
# depois: bun --cwd packages/db db:apply-triggers && bun --cwd packages/db db:seed-categories && bun --cwd packages/db db:seed-attributes
```

⚠️ Só rodar em DB de dev. **Nunca** em staging/prod.

### Testes

Cobertura mínima: `apps/web/__tests__/permissions.test.ts` (vitest unit). Roadmap: ampliar unit + Playwright (E2E) na Fase F. Por ora validação = `bun check-types` + `bun fix` + smoke manual em `bun dev:web`.

---

## Auth — regras invioláveis

Duas instâncias **completamente isoladas** Better Auth, mesmo banco Supabase, escopos disjuntos.

| Instância                      | Import                                                        | Tabelas                                                                           | Cookie prefix | trustedOrigins     | Consumer        |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- | ------------------ | --------------- |
| Dashboard (admin/manager/user) | `@emach/auth/dashboard` → `authDashboard`, `DashboardSession` | `user`, `session`, `account`, `verification`                                      | default       | `CORS_ORIGIN`      | `apps/web`      |
| Ecomerce (clientes BR)         | `@emach/auth/ecommerce` → `authEcommerce`, `EcommerceSession` | `client`, `clientSession`, `clientAccount`, `clientVerification`, `clientAddress` | `ecommerce`   | `ECOMMERCE_ORIGIN` | `apps/<futuro>` |

**Invariantes (P0 — qualquer violação é bug crítico):**

1. `apps/web` **pode** importar `@emach/db/schema/client` (admin lê dados de cliente — features `customers/`, `reviews/`). `apps/web` **nunca** importa `@emach/auth/ecommerce` (auth dual segue isolada — sem session ecomerce no dashboard). App ecomerce **nunca** importa `@emach/db/schema/auth`.
2. `DashboardSession` ≠ `EcommerceSession`. Não há tipo "Session" genérico.
3. **Nunca** setar `advanced.cookies.<name>.attributes.domain = ".emach.com.br"`. Apps em subdomínios distintos isolam por host.
4. CPF/CNPJ: validação é responsabilidade do app (zod refine + dígito verificador). Sempre normalizar (só dígitos) antes de persistir em `client.document`.
5. Migrations em prod: `drizzle-kit generate` + migration versionada. `--force` só em dev/staging.
6. **Integração com app ecomerce externo (DB compartilhada)**: ambos escrevem na mesma DB Supabase via Drizzle. Admin **não** chama o app ecomerce; o app ecomerce **não** chama o admin. Coordenação acontece pelo schema compartilhado. Contrato em `docs/integration/admin-ecommerce.md`.

**Roles dashboard**: `user.role` é `pgEnum('user_role', ['admin','manager','user'])`. Verificação em **server actions sensíveis** via `requireCapability(cap)` em `apps/web/src/lib/permissions.ts` (capabilities granulares). Gates grosseiros ainda usam `requireRole("admin")` em layouts. `client` **não** tem `role`.

**Env compartilhado:** `DATABASE_URL`, `BETTER_AUTH_SECRET` (ok enquanto subdomínios). **Específicos:** dashboard precisa `BETTER_AUTH_URL` + `CORS_ORIGIN`; ecomerce precisa `BETTER_AUTH_URL_ECOMMERCE` + `ECOMMERCE_ORIGIN` (fallbacks aceitáveis no env central).

---

## Schema Drizzle (`packages/db/src/schema/`)

| Arquivo              | Tabelas-chave                                                                     | Notas                                                                                                                                                                                                                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.ts`            | `user`, `session`, `account`, `verification`                                      | `user.role` = `pgEnum('user_role', [...])`.                                                                                                                                                                                                                                                                                    |
| `client.ts`          | `client`, `clientSession`, `clientAccount`, `clientVerification`, `clientAddress` | Campos BR (`country` default `"BR"`, `phone`, `document` unique nullable).                                                                                                                                                                                                                                                     |
| `tools.ts`           | `supplier`, `tool`, `toolVariant`, `toolImage`                                    | `tool` enxuto (sem sku/voltage/price); SKU + voltagem + preço/custo + barcode vivem em `tool_variant`. `voltage` é `pgEnum('voltage', ['127V','220V','Bivolt','380V'])`. **Toda ferramenta tem ≥1 `tool_variant`** (uma marcada `isDefault=true` via partial unique index).                                                    |
| `attributes.ts`      | `attributeDefinition`, `toolAttributeValue`                                       | Catálogo de specs dinâmicas (Saleor-lite). `attribute_definition` define `inputType` (`text`/`number`/`select`/`boolean`/`numeric_range`/`color`), `unit`, `options jsonb`, e `categoryId` **NOT NULL**. `tool_attribute_value` armazena valor tipado por coluna (`valueText`, `valueNumeric`, `valueNumericMax`, `valueBool`). |
| `categories.ts`      | `category`, `toolCategory`                                                        | Árvore com `parent_id` + `path`/`depth` materializados via trigger pl/pgSQL. Anti-ciclo + cascade de path. Depth máximo 5.                                                                                                                                                                                                     |
| `inventory.ts`       | `branch`, `stockLevel`                                                            | PK `(variantId, branchId)`. `minQty` + `reorderPoint` + check `quantity >= 0` (oversell guard).                                                                                                                                                                                                                                |
| `promotions.ts`      | `promotion`, `promotionTool`                                                      | Cupons via `promotion.type='promocode'` (não há tabela `coupon`). Promoção continua por ferramenta-pai. `createdBy`/`updatedBy` FKs para auditoria.                                                                                                                                                                            |
| `stock-movements.ts` | `stockMovement`                                                                   | Audit trail por **variante**; `actorType` (`user`/`apiKey`/`system`) + `actorId` + `apiKeyId`; partial unique index garante idempotência de débito de venda; check `delta != 0`.                                                                                                                                               |
| `orders.ts`          | `order`, `orderItem`, `orderStatusHistory`, `orderNote`                           | `orderItem` carrega `toolId` + `variantId` + snapshots fiscais/dimensão.                                                                                                                                                                                                                                                       |
| `reviews.ts`         | `review`                                                                          | Moderação por admin (`status` pgEnum). Unique `(clientId, toolId, orderId)`.                                                                                                                                                                                                                                                   |
| `api-keys.ts`        | `apiKey`                                                                          | `scopes` + `allowedTags` (text[]) controlam escopo. GIN index em scopes.                                                                                                                                                                                                                                                       |
| `consent-log.ts`     | `consentLog`                                                                      | LGPD: TOS/privacy/marketing/cookies por client/lead. Helper em `apps/web/src/lib/consent.ts`.                                                                                                                                                                                                                                  |

**Especificações técnicas dinâmicas — herança:**

- `attribute_definition.categoryId` é **NOT NULL** — não há atributo global. Categoria-raiz "Geral" recebeu os anteriormente globais durante a migration.
- Ao montar form de uma ferramenta, server action carrega definitions cuja `categoryId` está em `category.path` da categoria primary do tool (recursão via CTE em `tools/actions.ts`).
- Ao trocar a categoria primary de uma ferramenta, `updateTool` detecta valores órfãos (`tool_attribute_value` cuja `attribute_definition` não está mais no path da nova categoria) e devolve `actionResult.warning = "orphan_attributes"`. Form pede confirmação antes de deletar.

**Triggers PL/pgSQL** em `packages/db/src/migrations/_triggers.sql` (Drizzle Kit não gera triggers — aplicar via `bun --cwd packages/db db:apply-triggers`).

`packages/db/src/index.ts` exporta `createDb()` (factory, usada em `@emach/auth/*`) e `db` (singleton, usado em server actions). Manter o factory para auth (evita ciclo de import com env). Em código novo do app, prefira `import { db } from "@emach/db"`.

---

## Design system — `DESIGN.md`

Sistema **Industrial neutrals + role-based color** — dark-mode único, AAA. Toda decisão de UI passa pelo doc canônico.

**Paleta crítica (memorize ou consulte sempre):**

- Brand CTA (primary copper): `oklch(0.65 0.15 45)` ≈ `#c2724a`
- Page background: `oklch(0.16 0.005 70)` ≈ `#1d1b18` (warm-dark)
- Card surface: `oklch(0.20 0.005 70)` ≈ `#262320`
- Sidebar: `oklch(0.13 0.004 70)` ≈ `#171612` (mais escuro que background)
- Foreground primário: `oklch(0.97 0.008 85)` (texto claro on-dark)
- Border hairline: `oklch(0.36 0.008 70)` ≈ `#4a4641`
- Input border (1 degrau acima): `oklch(0.42 0.010 70)` ≈ `#57524c`

**Roles cromáticas (6 distintas, separação ≥20° de hue):** primary copper (45), destructive oxide red (25), warning mustard (85), info teal (200), success jade (155), secondary warm graphite (70).

**Não:** cool blue-grays, light mode, `font-serif` em chrome do dashboard, ring 1px ou opacity multiplicada, drop shadows pesados, `<img>` puro, sharp corners <6px, status baseado só em cor (sempre ícone + label + cor), bold weight (700+) onde `font-medium` (500) já contrasta.

**Sim:** Inter sans em chrome (peso 500 default para h1/h2/title), Cormorant Garamond restrito a login hero + capa de relatório, ring 2px sólido na cor da role da ação, depth via surface contrast (não shadow), `<Image>` do Next, `prefers-reduced-motion: reduce` respeitado.

Toda revisão de componente UI: **rodar a skill `web-design-guidelines` antes de aprovar**.

---

## Skills locais (`.claude/skills/` → `.agents/skills/`)

Skills carregadas localmente. Use a tool `Skill` quando o gatilho bater.

| Skill                              | Quando usar                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `better-auth-best-practices`       | Configurar/auditar Better Auth, plugins, sessões, adapters.                      |
| `next-best-practices`              | RSC boundaries, async APIs, route handlers, image/font, metadata Next 16.        |
| `next-cache-components`            | PPR, `use cache`, `cacheLife`, `cacheTag`, `updateTag` no Next 16.               |
| `shadcn`                           | Adicionar/buscar/auditar componentes shadcn — preferir antes de instalar manual. |
| `supabase-postgres-best-practices` | Performance, schema, RLS, índices, queries.                                      |
| `turborepo`                        | Mexer em `turbo.json`, pipelines, caching, `--filter`, `--affected`, boundaries. |
| `ultracite`                        | Setup, lint/format, troubleshoot Biome. Em geral basta `bun fix`.                |
| `vercel-composition-patterns`      | Refator de boolean-prop hell, compound components, render props, React 19 APIs.  |
| `vercel-react-best-practices`      | Performance React/Next, bundling, data fetching, Server Components.              |
| `web-design-guidelines`            | **Obrigatório** antes de aprovar qualquer mudança visual significativa.          |

---

## MCP servers (`.mcp.json`)

Quando usar cada um:

| MCP                         | Quando                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context7`                  | Docs atualizadas de **qualquer** lib. Em código novo / migração / refactor com import: invocar via CLI `npx ctx7@latest library <name>` → `npx ctx7@latest docs <id> "<q>"` (passa pelo RTK).   |
| `better-auth` (Inkeep HTTP) | Pergunta específica sobre API/feature do Better Auth — usar quando context7 não basta.                                                                                                          |
| `supabase` (HTTP)           | `list_tables`, `execute_sql`, `generate_typescript_types`, `get_advisors`, logs. **Confirmar custo** antes de operações pagas.                                                                  |
| `shadcn`                    | `search_items_in_registries`, `view_items_in_registries`, `get_add_command_for_items`, `get_audit_checklist`. Preferir sobre `npx shadcn add` quando precisar inspecionar antes.                |
| `next-devtools`             | `nextjs_docs`, `nextjs_call`, `browser_eval` (Playwright Firefox), `enable_cache_components`. `nextjs_call <port> get_errors` é a maneira mais rápida de pegar stack trace de SSR error em dev. |
| `better-t-stack`            | `bts_plan_addons` → `bts_add_addons` para puxar addon novo (fumadocs, skills, mcp) sem montar manual. Projeto já scaffoldado.                                                                   |

---

## Workflow de mudança

1. **Antes de tocar UI:** abrir `DESIGN.md` na seção relevante; invocar `web-design-guidelines` se for review.
2. **Antes de tocar schema:** editar `packages/db/src/schema/*.ts` → em dev `bun db:push`; em prod `bun db:generate` + commit da migration + `bun db:migrate`.
3. **Server actions:** sempre `"use server"` no topo, `await requireCapability(cap)` ou `requireCurrentSession()` no início, validar input com Zod, normalizar antes de persistir.
4. **Imagens em forms:** upload via `uploadToolImage(formData)` (`apps/web/src/app/dashboard/tools/_components/image-actions.ts`), URL pública vai pro form; deletar via `deleteToolImage(url)`.
5. **Validação targeted first:** `bun check-types` no workspace alterado, `bun fix` no escopo. Suite inteira só se necessário.
6. **Smoke run-time:** quando refactor toca SSR, sempre rodar `bun dev:web` e visitar as rotas afetadas — `tsc` não detecta SQL inválido nem queries com colunas removidas. `nextjs_call <port> get_errors` mostra stack trace.
7. **Commit:** Conventional Commits em **PT** (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`chore:`). **Nunca** commitar sem confirmação explícita do user.
8. **PR:** `gh pr create` — título <70 chars, body com Summary + Test plan.

---

## Convenções de UX em forms (admin)

- **Slug auto-gerado em modo `create`:** input fica `disabled`, valor deriva do label/nome via `slugifyLabel()` (em `apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts`). Em `edit` fica editável com aviso "alterar pode quebrar URLs/referências".
- **Painel de erros no topo do form:** quando Zod falha, listar todos os issues em `<ul>` vermelho com path traduzido (ver `attribute-form.tsx`). Toast complementa com contagem ("3 erros — veja detalhes acima"). Evita "Revise os campos" genérico.
- **Variantes em `tool_variant`:** pelo menos 1; uma marcada `isDefault` (radio group). Form valida via `superRefine` que `defaults.length === 1` e SKUs únicos.
- **Atributos dinâmicos:** form de tool busca `definitionsByCategory[primaryCategoryId]` (pré-computado server-side em `attribute-helpers.ts`). Inputs renderizados por `inputType` em `dynamic-specs-editor.tsx`.

---

## Anti-patterns banidos (P0/P1)

- `console.log/warn/error` em código de produção. Use `logger` de `apps/web/src/lib/logger.ts` (export default). Em catch de server action, usar `throw new Error("mensagem")` que server action devolve como `actionResult.error`.
- `: any`, `<any>`, `as any`, `@ts-ignore`, `@ts-expect-error` (exceto em `.next/` gerado).
- `key={index}` em `.map()` — usar ID estável. Exceções (variantes/options sem id) ficam com biome-ignore explícito.
- `<img>` puro — sempre `next/image` (exceto thumbs Supabase com biome-ignore documentado).
- `React.forwardRef` — React 19 usa `ref` como prop normal.
- Barrel files (`index.ts` que só re-exporta) em `packages/ui/src`, `apps/web/src`, `packages/auth/src`. Em `packages/db/src/schema/index.ts` o barrel é **intencional** (marcado com `// biome-ignore lint/performance/noBarrelFile`).
- `async function` em Client Component (`"use client"`) — usar Server Component pra fetching.
- `.forEach()` em hot path — preferir `for...of`.
- `new RegExp(...)` ou regex literal dentro de loops — extrair top-level.
- `target="_blank"` sem `rel="noopener"`.
- APIs que injetam HTML não-sanitizado — evitar exceto necessidade absoluta com sanitização (ex: `react-markdown` + `rehype-sanitize` com preset `defaultSchema`).
- Cool blue-grays no design — todo neutro tem chroma warm (oklch hue ~70).
- `font-serif` (Cormorant) em chrome do dashboard — restrito a login hero + capa de relatório.

---

## Gotchas conhecidos

- **`createDb()` × `db` singleton:** `packages/auth/src/*` chama `createDb()` para evitar ciclo de import; resto do código usa `db` exportado. Não "consertar" forçando um padrão único.
- **Hook auto-format:** `.claude/settings.json` registra PostToolUse hook que roda `bun fix --skip=correctness/noUnusedImports` após `Write`/`Edit`. Se sumir esse hook, edições deixam de auto-formatar. Pode reordenar campos e quebrar `old_string` de Edits subsequentes — re-ler o arquivo se um Edit falhar com "string não encontrada".
- **`.env` resolution para scripts em `packages/*`:** carregamos de múltiplos paths. Não assumir `process.cwd()`.
- **Server actions com payload grande (uploads em base64 inline):** o limite default Next 16 é 1MB e levanta `Error: Body exceeded 1 MB limit.` no console do dev. Configuração atual em `apps/web/next.config.ts`: `experimental.serverActions.bodySizeLimit = "5mb"`.
- **Drizzle-kit push + TTY:** `bunx drizzle-kit push` sem TTY falha quando há rename ambíguo de coluna. Em CI/scripted, dropar+recriar schema é o caminho mais previsível em dev.
- **Promoção de role para admin:** seed de Better Auth cria user com role `user` por default; promover via SQL `UPDATE "user" SET role='admin' WHERE email='...'`.
- **`db.execute()` raw devolve timestamp como string:** drizzle-orm 0.45.x sobrescreve type parser em rawQueryConfig. Sempre que tipar coluna timestamp como `Date` em função que usa `db.execute`, coercer com `toDate` de `@emach/db/utils`. Detalhes em `packages/db/CLAUDE.md`.

---

## Onde se aprofundar

- **Contrato DB compartilhada (admin ↔ site ecomerce):** `docs/integration/admin-ecommerce.md`
- **Supabase Storage buckets:** `docs/storage-buckets.md`
- **Convenções db schema + gotchas Drizzle:** `packages/db/CLAUDE.md`
- **Convenções apps/web:** `apps/web/CLAUDE.md`
- **Ultracite rules detalhadas:** rodar skill `ultracite` ou consultar `node_modules/ultracite/dist`
- **Tudo de UI:** `DESIGN.md`

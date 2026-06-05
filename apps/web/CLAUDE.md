# apps/web — Convenções

Dashboard Next 16 / React 19. Regras gerais (auth invariantes, anti-patterns, gotchas) na raiz.

## Server actions

- Sempre `"use server"` no topo + `await requireCapability(cap)` (ou `requireCurrentSession()`) no início.
- Padrão de retorno: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.
- Validação com Zod `safeParse`. Em catch: `logger.error({ err })` + retornar `{ ok: false, error: "mensagem" }`. Não logar com `console`.
- `revalidatePath` ou `revalidateTag` após mutações.

## Capabilities (`src/lib/permissions.ts`)

**⚠️ Desligado em 2026-05-27 (ADR-0012).** Funções `requireCapability`, `requireCapabilityOrRedirect`, `requireCapabilityWithContext`, `requireCapabilityWithContextOrRedirect`, `can` são **no-op** — validam só sessão + `status='active'`. Matriz original preservada em `src/lib/permissions.disabled.ts` (não-importada).

**O padrão obrigatório em server actions continua sendo `await requireCapability(cap)` ou `requireCapabilityWithContext(cap, ctx)`** — assim, quando religar, todos os endpoints já estão cobertos sem varredura. **Nunca remover essas chamadas; novos endpoints precisam delas.**

Guard-rails mantidos dentro dos no-ops:

- `ensureActive(session)` — bloqueia `pending` / `suspended` (defesa-em-profundidade).
- Self-action guard em `users.suspend` / `users.delete` / `users.update_role`.
- Last super_admin guard — `assertNotLastActiveSuperAdmin` bloqueia rebaixar/suspender/deletar o último `super_admin` `active`.

`requireRole` em `src/lib/session.ts` também é no-op (mesma validação). `ROLE_WEIGHT` permanece (usado em `<RoleBadge>` e formulários).

Bootstrap do primeiro `super_admin` via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`.

Reativar: ver `docs/adr/0012-disable-role-based-gates.md`.

## Imports

- `@/...` → `src/...`.
- **Permitido:** `@emach/db/schema/client` (admin lê dados de cliente — features `customers/`, `reviews/`).
- **Proibido P0:** `@emach/auth/ecommerce` daqui.

## Convenções de UX em forms

- **Slug auto-gerado em `create`:** `<Input disabled />` com valor de `slugifyLabel()` em `dashboard/categories/_lib/attribute-schema.ts`. Em `edit` fica editável com hint "alterar pode quebrar URLs/referências".
- **Painel de erros no topo:** quando `safeParse` falha, listar todos os issues como `<ul>` em caixa vermelha com path → rótulo humano. Toast só com contagem ("3 erros — veja detalhes acima"). NUNCA `toast.error("Revise os campos")` genérico.
- **Variantes (tools):** form exige ≥1 `tool_variant`, uma `isDefault` (radio group). Editor em `tools/_components/variants-editor.tsx`.
- **Specs dinâmicas:** `definitionsByCategory[primaryCategoryId]` (resolve cadeia ancestral). Trocar categoria primary com specs preenchidas → `updateTool` devolve `actionResult.warning = "orphan_attributes"`; form pede confirmação antes de deletar.
- **Markdown na descrição de tool:** `tool.description` é Markdown puro. Render via `<ToolDescription>` (`react-markdown` + `rehype-sanitize` preset `defaultSchema`).
- **Ações destrutivas com reason:** padrão é `DestructiveActionDialog` (`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`). `reasonRequired=true` exige min 10 chars (suspend/delete); `reasonRequired=false` em ações benignas (reactivate). Caller deve usar `useTransition` + `submitting` prop pra cobrir double-submit. Reason persistido em `metadata.reason` via `logUserActivity`.
- **Ajuda contextual (`HelpTooltip`):** `apps/web/src/components/help-tooltip.tsx` — `ⓘ` dentro do `<Label>`/`<h3>` (via `className="flex items-center gap-1.5"`). Union: `text` (curto, desambiguação) ou `title+body+example` (rico, com exemplo). O rico usa `HoverCard`/`PreviewCard` do base-ui (fecha no Esc nativo — WCAG 1.4.13 ok). Converter `<p>` verboso em tooltip; **manter visível** caveat comportamental (ex: faixas de CEP "não restringem pedidos"). Em uso: tools (identity), branches, suppliers, categories/attributes.
- **Atributos órfãos ao trocar categoria principal (tools, modo create):** `toggleCategory` **não** reseta `attributeAssignments` ao mudar a principal — decisão consciente (#121/#122) pra não destruir trabalho do usuário. Atributos que deixaram de ser sugeridos viram badge `extra · não herdado` em `attribute-assignments-editor.tsx` (continuam marcados/submetidos, removíveis pelo `X`). **Não** re-adicionar `useEffect` de reset em create; o caminho destrutivo explícito existe só no edit (`updateTool` → `warning: "orphan_attributes"`).
- **Wizard ↔ edit de tool — fonte única:** `tool-sections.ts` (`TOOL_SECTION_COMPONENTS: ToolStepId → Component`) e `use-tool-submit.ts` (`useToolSubmit({ mode })`) são compartilhados por `ToolWizard` e `ToolEditView`. Adicionar campo/passo: mexer só no map + schema, nunca duplicar. Stepper-only state (`active`/`next`/`stepDone`) fica no wizard. `STEP_FIELDS` tem assert type-level de exaustividade — campo `required` novo no schema que não entre nele quebra o build.

## Entity detail / CRUD pattern (canônico: `DESIGN.md` §4)

Default ao construir detalhe de entidade (`/dashboard/<recurso>/[id]`) ou listagem de CRUD. Referência: filiais (`branches/[id]`). Adaptar ao domínio é permitido; o esqueleto é fixo. Novas entidades seguem; existentes migram aos poucos.

- **Detalhe:** `EntityIdentityHeader` + `EntityTabs` (sincroniza `?tab=`). A ação primária (Editar / Vincular / Adicionar) vive no `actions` do header e **muda conforme `sp.tab`** — o Server Component decide qual injetar. **Nunca** pôr essa ação no corpo da tab nem fixa em todas as abas.
- **Cards de listagem:** reusar um dos 4 arquétipos (stat / media / identity / entity — `DESIGN.md` §4), não inventar shell novo. Footer **edge-to-edge** (`border-t` até a borda; `-mx-4 px-4` quando o card tem padding `p-4`).
- **Mutação:** editar simples = drawer (`Sheet` via `?edit=1`); criar ou form complexo (muitos campos, ex: tool) = página (`/new`); destrutivo = `AlertDialog` controlado (`open` state, `e.preventDefault()` no action + fechar no sucesso, `stopPropagation` se dentro de card clicável). Botão destrutivo **nunca** `variant="default"` (coral) — usar `destructive`/`outline`/`ghost`.
- **Badge de contagem em tab:** `secondary` (`TabsCountBadge` no Tabs base; `secondary rounded-md` no `EntityTabs`). Preferir count vindo de KPI agregado (ex: `kpis.teamSize`) a carregar a coleção inteira só pra `.length` — assim a tab carrega lazy.
- **Cards de listagem não têm ação de editar inline.** Editar é sempre via detalhe da entidade (drawer `?edit=1`). Atalhos de navegação (ex: ver estoque) são permitidos como `<Link>` ícone `ghost` com `border border-border bg-muted`.
- **Scroll infinito (padrão do sistema):** toda listagem usa `useInfiniteList` + `<InfiniteSentinel>` (`src/components/infinite-sentinel.tsx`). Page size global `BATCH_SIZE = 20` (`src/lib/infinite.ts`), keyset cursor (`src/lib/cursor.ts`), auto-load 200px antes do fim. O sentinel **não** exibe "fim da lista" (retorna `null` quando `!hasMore`); loading mostra `skeleton` (prop opcional `ReactNode`) ou spinner discreto; botão "Tentar de novo" só em erro. Tabs internas de entidade que listam coleções (ex: Pedidos) seguem o mesmo padrão e carregam **lazy** (só quando `sp.tab` corresponde).
- **Verificação:** `check-types` NÃO pega import de hook client (`useRouter`/`useState`) em Server Component — quebra só em runtime. Smoke visual no browser após mexer em componente de página/tab.

## Imagens

Helper genérico Storage em `src/lib/storage.ts` (upload/delete/signedUrl para bucket público e privado). Upload de imagem de tool: `uploadToolImage()` em `tools/_components/image-actions.ts`. Anexos de pedido (bucket privado): `orders/_components/attachment-actions.ts` — reaproveitar pattern.

Thumbs Supabase: `<img>` puro **com `// biome-ignore lint/performance/noImgElement: Supabase public URL` documentado**. Demais: `<Image>` do Next.

## Auditoria de mutações DB

Ao inserir em `stockMovement`, `orderStatusHistory`, `clientAuditLog`:
- Admin user → `actorType: "user"` + `actorId: session.user.id`.
- Seed/script/mutação automática (inclui escritas do app e-commerce) → `actorType: "system"` (default), sem actorId.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

`stockMovement.variantId` (não mais `toolId`) — toda movimentação por variante. Pra revalidar paths do tool-pai após `adjustStock`: `SELECT toolId FROM tool_variant WHERE id = $variantId` antes de `revalidatePath`.

## Orders — branch-scoping fail-safe

Mutações de pedido (status, anexos) passam por `lockOrderAndAuthorize(tx, cap, orderId)` em `dashboard/orders/actions.ts`: `SELECT ... FOR UPDATE` **e** capability check no mesmo lock — non-`super_admin` só age sobre pedidos da própria filial. Toda transição escreve em `orderStatusHistory`; `canceled`/`refunded`/`returned` exigem `reason`, `preparing` exige `branchId`.

## Cron jobs (Vercel Cron)

Route handlers em `src/app/api/cron/*` autenticam via header `Authorization: Bearer ${env.CRON_SECRET}`. Vercel injeta automaticamente quando o cron declarado em `apps/web/vercel.json` dispara. `CRON_SECRET` é env obrigatória (32+ chars) validada em `packages/env/src/server.ts`.

**Convenções:**

- `export const dynamic = "force-dynamic"` + `runtime = "nodejs"` no topo do handler.
- Authorize ANTES de qualquer query: `if (authHeader !== \`Bearer \${env.CRON_SECRET}\`) return 401`.
- Processar item-a-item em transações separadas com `FOR UPDATE` + re-check de estado (idempotência contra disparo concorrente + race com ecommerce).
- `actorType: 'system'`, `actorUserId: null` em writes — CHECK `actor_coherence` no DB exige.
- Logar erros por item via `logger.error("jobName", { id, err })` sem abortar o batch.

**Gerar secret:** `openssl rand -hex 32`. Em produção: configurar em **Vercel > Project Settings > Environment Variables (Production)**. Vercel Cron só dispara em deploys de produção (não preview).

**Job ativo:** `/api/cron/cancel-stale-orders` — diário 04:00 UTC; cancela `pending_payment` com `createdAt < now() - 72h`.

## Cache (Next 16)

`cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

**Dedup request-scoped sem Cache Components:** fetcher chamado em mais de um lugar no mesmo render (ex: `fetchDashboardCounts` no `layout.tsx` para badges **e** na `page.tsx` para o painel) → envolver em `cache()` do `react`. Dedupa a query no mesmo request sem precisar ligar `use cache`/Cache Components. Só funciona para a **mesma** função com os mesmos args; queries diferentes que contam o mesmo dado não deduplicam (ver issue de extrair counts num único fetch).

## Smoke run-time

`tsc` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema ou queries SSR: `bun dev:web` + visitar rotas afetadas. Stack trace via `nextjs_call <port> get_errors` (MCP `next-devtools`).

## Testes — gap conhecido

`__tests__/activity.test.ts` falha com `Cannot find package 'server-only'` em ambiente vitest. `src/lib/activity.ts` importa `server-only` (boundary do Next), que não tem stub no test runner. Fix esperado: adicionar `resolve.alias['server-only'] = path/to/stub` em `vitest.config.ts` (ou `vi.mock('server-only', () => ({}))` em setup file). Pré-existente; não regressão.

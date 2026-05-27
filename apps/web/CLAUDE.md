# apps/web — Convenções

Dashboard Next 16 / React 19. Regras gerais (auth invariantes, anti-patterns, gotchas) na raiz.

## Server actions

- Sempre `"use server"` no topo + `await requireCapability(cap)` (ou `requireCurrentSession()`) no início.
- Padrão de retorno: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`.
- Validação com Zod `safeParse`. Em catch: `logger.error({ err })` + retornar `{ ok: false, error: "mensagem" }`. Não logar com `console`.
- `revalidatePath` ou `revalidateTag` após mutações.

## Capabilities (`src/lib/permissions.ts`)

Capabilities granulares substituem `requireRole` em mutations sensíveis. `requireRole` ainda usado em gates grosseiros de layout.

- `requireCapability(cap)` — server actions sensíveis (lança Error).
- `requireCapabilityOrRedirect(cap, redirectTo?)` — Server Components / pages.
- `requireCapabilityWithContext(cap, { targetUserId?, targetBranchIds? })` — adiciona (a) escopo de filial (non-`super_admin` só age sobre filiais em `user_branch`) e (b) hierarquia de role (não gerencia igual/superior; `users.suspend/delete/update_role` não miram a si mesmo).

Matriz canônica em `ROLE_CAPS`. `super_admin` tem `SUPER_ADMIN_EXCLUSIVE` (`branches.manage`, `branches.set_default`, `users.delete`, `audit.read`).

`audit.read` em `MANAGER_CAPS` e `ADMIN_CAPS` (admin herda via `ALL_CAPS - SUPER_ADMIN_EXCLUSIVE`). `super_admin` também tem (via `ALL_CAPS`).

Bootstrap do primeiro `super_admin` via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`.

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

## Smoke run-time

`tsc` não detecta SQL inválido em template strings nem queries com colunas removidas. Após mexer em schema ou queries SSR: `bun dev:web` + visitar rotas afetadas. Stack trace via `nextjs_call <port> get_errors` (MCP `next-devtools`).

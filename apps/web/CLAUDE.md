# apps/web — Convenções

Dashboard Next 16 / React 19. Para regras gerais (auth, schema, design), ver `.claude/CLAUDE.md` no root.

## Estrutura por feature

Cada feature em `src/app/dashboard/<feature>/` segue:
- `page.tsx` — Server Component, busca dados via `db` direto.
- `actions.ts` — `"use server"`. Padrão `ActionResult<T>` (`{ ok: true; data } | { ok: false; error }`).
- `schema.ts` — Zod schemas de input.
- `_components/*.tsx` — colocated; nomear o arquivo `kebab-case`, componente `PascalCase`.
- `[id]/`, `new/`, `[id]/edit/` quando aplicável.

## Padrão de server action

```ts
"use server";
import { requireCapability } from "@/lib/permissions";

export async function updateX(input: unknown): Promise<ActionResult> {
  await requireCapability("x.manage");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validação" };
  try {
    await db.transaction(async (tx) => { /* ... */ });
    revalidatePath("/dashboard/x");
    return { ok: true, data: undefined };
  } catch (e) {
    logger.error({ err: e }, "updateX falhou");
    return { ok: false, error: "erro interno" };
  }
}
```

## Capabilities & Permissions

`src/lib/permissions.ts` define o sistema de capabilities granulares que substitui `requireRole` em server actions sensíveis.

- `Capability` — union de ~45 strings (`tools.create`, `orders.cancel`, `users.suspend`, `customers.export`, `attributes.create`, ...).
- `can(role, cap)` — boolean síncrono. Retorna `false` para role `null/undefined/desconhecida`.
- `requireCapability(cap)` — server actions sensíveis. Lança `Error("Forbidden: ...")` se não autorizado.
- `requireCapabilityOrRedirect(cap, redirectTo?)` — Server Components / pages. Redireciona em vez de lançar.
- `requireCapabilityWithContext(cap, { targetUserId?, targetBranchIds? })` — dois guards extras: (a) escopo de filial — non-`super_admin` só age sobre filiais em `user_branch`; (b) hierarquia de role via `ROLE_WEIGHT` — não gerencia usuário de role igual/superior, e `users.suspend`/`delete`/`update_role` não podem mirar a si mesmo.
- `requireRole(role)` (em `lib/session.ts`) — gates grosseiros (layout do dashboard); use `requireCapability` em mutations.

**Matriz de 4 roles** (fonte canônica: `ROLE_CAPS` em `src/lib/permissions.ts`):
- `user` (estoquista + expedição): todos os `*.read` + `stock.adjust` + `orders.update_status` + `orders.add_note` + `attributes.read`.
- `manager` (gerente operacional/comercial/conteúdo): tudo do `user` + catálogo CRUD (`tools.*`) + `categories`/`suppliers`/`promotions`/`attributes` manage + `orders.cancel`/`refund`/`export` + `customers.update_status`/`manage_sessions`/`reset_password` + `site.*` + `reviews.moderate` + `audit.read`.
- `admin`: **tudo** menos os 4 exclusivos de `super_admin`.
- `super_admin`: tudo. Exclusivos (`SUPER_ADMIN_EXCLUSIVE`): `branches.manage`, `branches.set_default`, `users.delete`, `audit.read`.

⚠️ **Quirk a confirmar:** `audit.read` está em `MANAGER_CAPS` **e** em `SUPER_ADMIN_EXCLUSIVE` — logo `manager` e `super_admin` têm, mas `admin` **não** tem. O comentário no código diz que `admin` teria auditoria escopada por outro mecanismo; validar se é intencional.

⚠️ Better Auth cria usuário novo com `role='user'` + `status='pending'` (precisa aprovação via `users.approve`). Bootstrap do primeiro super admin via SQL: `UPDATE "user" SET role='super_admin', status='active' WHERE email='...'`. A UI de gestão de usuários **existe** em `dashboard/users/`.

## Helpers críticos

- `src/lib/session.ts` — `getCurrentSession()`, `requireCurrentSession()`, `requireRole(role)`, `ROLE_WEIGHT`.
- `src/lib/permissions.ts` — `can()`, `requireCapability()`, `requireCapabilityOrRedirect()`, `requireCapabilityWithContext()`.
- `src/lib/consent.ts` — LGPD: `logConsent()`, `revokeConsent()`, `getActiveConsent()`.
- `src/lib/supabase-server.ts` — service-role client (uploads).
- `src/lib/logger.ts` — logger central (substitui `console.*`).

## Imagens

Upload em forms vai por `uploadToolImage(formData)` (em `src/app/dashboard/tools/_components/image-actions.ts`). Quando generalizar para banners/categorias, extrair para `lib/storage.ts` aceitando `{ bucket, prefix, formData }`.

Renderização de imagens: `<Image>` do Next sempre que possível. Para thumbs vindos do Supabase Storage (URL pública dinâmica), `<img>` puro com `// biome-ignore lint/performance/noImgElement: Supabase public URL` documentado.

**Server actions com upload (payload base64 inline):** o limite Next 16 default é 1MB. Configuração ativa em `next.config.ts`: `experimental.serverActions.bodySizeLimit = "5mb"`. Se erro `Body exceeded N MB limit` aparecer, ajuste lá (não no código de form).

## Imports

- `@/...` → `src/...` (configurado em `tsconfig.json`).
- `@emach/db`, `@emach/auth/dashboard`, `@emach/ui`, `@emach/env`.
- **Permitido** importar `@emach/db/schema/client` daqui (admin lê dados de cliente — features `customers/`, `reviews/`).
- **Nunca** importar `@emach/auth/ecommerce` daqui (P0). Auth dual segue isolada — dashboard só usa `authDashboard`.

## Cache (Next 16)

Adotar `cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

## Convenções de UX em forms

- **Slug auto-gerado em modo `create`:** `<Input disabled />` com valor derivado do label/nome via `slugifyLabel()` em `dashboard/categories/_lib/attribute-schema.ts`. Em `edit` fica editável com hint "alterar pode quebrar URLs/referências".
- **Painel de erros no topo do form:** quando `safeParse` falha, listar todos os issues como `<ul>` em caixa vermelha, com path traduzido pra rótulo humano. Toast complementa com contagem ("3 erros — veja detalhes acima"). Não usar `toast.error("Revise os campos")` genérico.
- **Variantes:** form de tool exige ≥1 `tool_variant`; uma marcada `isDefault` (radio group). Sub-componente em `tools/_components/variants-editor.tsx`.
- **Specs dinâmicas:** form busca `definitionsByCategory[primaryCategoryId]` (server-side via `tools/_components/attribute-helpers.ts`). Inputs renderizados por `inputType` em `tools/_components/dynamic-specs-editor.tsx`. `buildDefinitionsByCategory` resolve a cadeia ancestral da categoria primary e une todas as `attribute_definition` aplicáveis (próprias + herdadas). Trocar categoria com specs preenchidas → `updateTool` devolve `actionResult.warning = "orphan_attributes"`; form pede confirmação antes de deletar.
- **Categorias — rotas e UX:** `/dashboard/categories` é uma árvore expansível (`categories-tree.tsx`) com reorder de irmãos por drag-and-drop (`@dnd-kit`, persiste `sort_order` via `reorderCategories`). `/dashboard/categories/[id]` é a página de detalhe em leitura (grid `1.45fr/0.95fr` estilo orders): cards Sobre, Atributos técnicos (read-only), Produtos + sidebar Ações/Resumo/Hierarquia. `/dashboard/categories/[id]/edit` e `/new` usam `category-form.tsx` em cards. O CRUD de definição de atributo continua só no `edit`, via Sheet lateral (`attribute-sheet.tsx`) — "Atributos próprios" + "Atributos herdados" (read-only com link para a categoria-dona). Categoria **não tem imagem** — é só estrutura de catálogo. A ordem (`sort_order`) **não** é campo de formulário; só muda pelo drag-and-drop.
- **Markdown na descrição:** `tool.description` é texto Markdown puro. Renderizado via `<ToolDescription>` (`src/components/tool-description.tsx`) com `react-markdown` + `rehype-sanitize` (preset `defaultSchema`). Form usa `<Textarea>` simples — admin escreve markdown direto.
- **Filtros de período:** sempre usar `<DatePicker>` de `@emach/ui/components/date-picker`. Nunca `<Input type="date">` nativo — quebra o design system (cor, fonte, hover) e não respeita o locale.
- **Helpers de data em querystring:** `parseDateParam` / `formatDateParam` em `apps/web/src/lib/date-params.ts`. Strings sempre `YYYY-MM-DD`, parseadas no fuso local (concatena `T00:00:00`).
- **`<FiltersBar>`:** sempre renderiza o botão "Limpar filtros". Quando `hasActive=false`, vem com `disabled` (`opacity-50`, `pointer-events-none`) — sinaliza a ação sem causar layout jump.

## Auditoria de mutações em DB

Ao inserir em `stockMovement`, `orderStatusHistory` ou `clientAuditLog` (mutação de cliente pelo staff):
- Quando origem é admin user: `actorType: "user"` + `actorId: session.user.id`.
- Quando origem é apiKey externa (site ecomerce): `actorType: "apiKey"` + `apiKeyId: key.id`.
- Quando origem é seed/script automático: `actorType: "system"` (default), sem actorId/apiKeyId.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

`stockMovement.variantId` (não mais `toolId`) — toda movimentação é por variante específica. Para revalidar paths de UI relacionados ao tool-pai após adjustStock, fazer `SELECT toolId FROM tool_variant WHERE id = $variantId` antes de chamar `revalidatePath`.

## Smoke run-time depois de refactor

`tsc` valida tipos mas **não** detecta SQL inválido em template strings nem queries que referenciam colunas removidas. Sempre que mexer em schema ou em queries SSR, rodar `bun dev:web` e visitar as rotas afetadas. Stack trace mais rápido vem via `nextjs_call <port> get_errors` (MCP `next-devtools`).

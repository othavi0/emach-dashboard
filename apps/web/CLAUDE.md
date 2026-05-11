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

`src/lib/permissions.ts` define o sistema de capabilities granulares que substitui `requireRole("admin")` em server actions sensíveis.

- `Capability` — union de strings (`tools.create`, `orders.cancel`, `categories.manage`, `attributes.create`, ...).
- `can(role, cap)` — boolean síncrono. Retorna `false` para role `null/undefined/desconhecida`.
- `requireCapability(cap)` — server actions sensíveis. Lança `Error("Forbidden: ...")` se não autorizado.
- `requireCapabilityOrRedirect(cap, redirectTo?)` — Server Components / pages. Redireciona em vez de lançar.
- `requireRole(role)` (em `lib/session.ts`) — gates grosseiros (layout do dashboard); use `requireCapability` em mutations.

**Matriz de roles** (resumida; fonte canônica em `src/lib/permissions.ts`):
- `user` (estoquista + expedição): reads + `stock.adjust` + `orders.update_status` + `orders.add_note` + `attributes.read`.
- `manager` (gerente operacional/comercial/conteúdo): tudo do user + catálogo CRUD + categorias/promoções/suppliers/atributos + orders.cancel/refund + customers.update_tags/status + site CRUD + reviews.moderate.
- `admin`: tudo, exclusivos: `branches.manage`, `users.manage`, `apikeys.manage`, `customers.delete` (LGPD).

⚠️ Better Auth cria usuários novos com role `user` por default. Promover via SQL: `UPDATE "user" SET role='admin' WHERE email='...'` (sem UI de gestão de usuários até Fase F).

## Helpers críticos

- `src/lib/session.ts` — `getCurrentSession()`, `requireCurrentSession()`, `requireRole(role)`.
- `src/lib/permissions.ts` — `can()`, `requireCapability()`, `requireCapabilityOrRedirect()`.
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
- **Nunca** importar `@emach/db/schema/client` ou `@emach/auth/ecommerce` daqui (P0).

## Cache (Next 16)

Adotar `cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

## Convenções de UX em forms

- **Slug auto-gerado em modo `create`:** `<Input disabled />` com valor derivado do label/nome via `slugifyLabel()` em `dashboard/categories/_lib/attribute-schema.ts`. Em `edit` fica editável com hint "alterar pode quebrar URLs/referências".
- **Painel de erros no topo do form:** quando `safeParse` falha, listar todos os issues como `<ul>` em caixa vermelha, com path traduzido pra rótulo humano. Toast complementa com contagem ("3 erros — veja detalhes acima"). Não usar `toast.error("Revise os campos")` genérico.
- **Variantes:** form de tool exige ≥1 `tool_variant`; uma marcada `isDefault` (radio group). Sub-componente em `tools/_components/variants-editor.tsx`.
- **Specs dinâmicas:** form busca `definitionsByCategory[primaryCategoryId]` (server-side via `tools/_components/attribute-helpers.ts`). Inputs renderizados por `inputType` em `tools/_components/dynamic-specs-editor.tsx`. `buildDefinitionsByCategory` resolve a cadeia ancestral da categoria primary e une todas as `attribute_definition` aplicáveis (próprias + herdadas). Trocar categoria com specs preenchidas → `updateTool` devolve `actionResult.warning = "orphan_attributes"`; form pede confirmação antes de deletar.
- **Painel de atributos por categoria:** `/dashboard/categories/[id]/edit` mostra 2 cards separados — "Atributos próprios" (definidos na categoria atual; CRUD via Sheet lateral em `categories/_components/attribute-sheet.tsx`) e "Atributos herdados" (vindos de ancestrais; read-only com link "Abrir →" para a categoria-dona). `attribute_definition.categoryId` é `NOT NULL` — não há mais o conceito de atributo global; a categoria-raiz "Geral" recebeu os anteriormente globais durante a migration.
- **Markdown na descrição:** `tool.description` é texto Markdown puro. Renderizado via `<ToolDescription>` (`src/components/tool-description.tsx`) com `react-markdown` + `rehype-sanitize` (preset `defaultSchema`). Form usa `<Textarea>` simples — admin escreve markdown direto.

## Auditoria de mutações em DB

Ao inserir em `stockMovement` ou `orderStatusHistory`:
- Quando origem é admin user: `actorType: "user"` + `actorId: session.user.id`.
- Quando origem é apiKey externa (site ecomerce): `actorType: "apiKey"` + `apiKeyId: key.id`.
- Quando origem é seed/script automático: `actorType: "system"` (default), sem actorId/apiKeyId.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

`stockMovement.variantId` (não mais `toolId`) — toda movimentação é por variante específica. Para revalidar paths de UI relacionados ao tool-pai após adjustStock, fazer `SELECT toolId FROM tool_variant WHERE id = $variantId` antes de chamar `revalidatePath`.

## Smoke run-time depois de refactor

`tsc` valida tipos mas **não** detecta SQL inválido em template strings nem queries que referenciam colunas removidas. Sempre que mexer em schema ou em queries SSR, rodar `bun dev:web` e visitar as rotas afetadas. Stack trace mais rápido vem via `nextjs_call <port> get_errors` (MCP `next-devtools`).

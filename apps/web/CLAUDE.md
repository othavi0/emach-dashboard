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

- `Capability` — union de strings (`tools.create`, `orders.cancel`, `categories.manage`, ...).
- `can(role, cap)` — boolean síncrono. Retorna `false` para role `null/undefined/desconhecida`.
- `requireCapability(cap)` — server actions sensíveis. Lança `Error("Forbidden: ...")` se não autorizado.
- `requireCapabilityOrRedirect(cap, redirectTo?)` — Server Components / pages. Redireciona em vez de lançar.
- `requireRole(role)` (em `lib/session.ts`) — gates grosseiros (layout do dashboard); use `requireCapability` em mutations.

**Matriz de roles** (resumida; ver `docs/superpowers/specs/2026-04-27-fase-a-fundacao-design.md`):
- `user` (estoquista + expedição): reads + `stock.adjust` + `orders.update_status` + `orders.add_note`.
- `manager` (gerente operacional/comercial/conteúdo): tudo do user + catálogo CRUD + categorias/promoções/suppliers + orders.cancel/refund + customers.update_tags/status + site CRUD + reviews.moderate.
- `admin`: tudo, exclusivos: `branches.manage`, `users.manage`, `apikeys.manage`, `customers.delete` (LGPD).

## Helpers críticos

- `src/lib/session.ts` — `getCurrentSession()`, `requireCurrentSession()`, `requireRole(role)`.
- `src/lib/permissions.ts` — `can()`, `requireCapability()`, `requireCapabilityOrRedirect()`.
- `src/lib/consent.ts` — LGPD: `logConsent()`, `revokeConsent()`, `getActiveConsent()`.
- `src/lib/supabase-server.ts` — service-role client (uploads).
- `src/lib/logger.ts` — logger central (substitui `console.*`).

## Imagens

Upload em forms vai por `uploadToolImage(formData)` (em `(inventory)/tools/image-actions.ts`). Quando generalizar para banners/categorias, extrair para `lib/storage.ts` aceitando `{ bucket, prefix, formData }`.

## Imports

- `@/...` → `src/...` (configurado em `tsconfig.json`).
- `@emach/db`, `@emach/auth/dashboard`, `@emach/ui`, `@emach/env`.
- **Nunca** importar `@emach/db/schema/client` ou `@emach/auth/ecommerce` daqui (P0).

## Cache (Next 16)

Adotar `cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

## Auditoria de mutações em DB

Ao inserir em `stockMovement` (futuramente `orderStatusHistory` etc.):
- Quando origem é admin user: `actorType: "user"` + `actorId: session.user.id`.
- Quando origem é apiKey externa (site ecomerce): `actorType: "apiKey"` + `apiKeyId: key.id`.
- Quando origem é seed/script automático: `actorType: "system"` (default), sem actorId/apiKeyId.

CHECK `actor_coherence` no DB rejeita combinações inválidas.

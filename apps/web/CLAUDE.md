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
import { requireRole } from "@/lib/session";

export async function updateX(input: unknown): Promise<ActionResult> {
  await requireRole("admin");
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

## Helpers críticos

- `src/lib/session.ts` — `getCurrentSession()`, `requireCurrentSession()`, `requireRole(role)`.
- `src/lib/supabase-server.ts` — service-role client (uploads).
- `src/lib/logger.ts` — logger central (substitui `console.*`).
- `src/lib/permissions.ts` — (planejado) matriz role × feature.

## Imagens

Upload em forms vai por `uploadToolImage(formData)` (em `(inventory)/tools/image-actions.ts`). Quando generalizar para banners/categorias, extrair para `lib/storage.ts` aceitando `{ bucket, prefix, formData }`.

## Imports

- `@/...` → `src/...` (configurado em `tsconfig.json`).
- `@emach/db`, `@emach/auth/dashboard`, `@emach/ui`, `@emach/env`.
- **Nunca** importar `@emach/db/schema/client` ou `@emach/auth/ecommerce` daqui (P0).

## Cache (Next 16)

Adotar `cacheTag` por feature (`'orders'`, `'customers'`, `'site-banners'`...). `revalidateTag` em mutations. Ver skill `next-cache-components`.

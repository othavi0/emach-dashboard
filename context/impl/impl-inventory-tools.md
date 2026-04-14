---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Implementation Tracking: Inventory Tools CRUD

Build site: context/plans/build-site.md

| Task  | Status | Notes |
|-------|--------|-------|
| T-040 | DONE   | `tools/page.tsx` async Server Component — raw SQL join via `db.execute()` w/ category + supplier + aggregated stock (`LEFT JOIN stock_level GROUP BY`). Columns: thumb, name, category, supplier, visibility badge, total stock, actions |
| T-041 | DONE   | `_components/tools-table.tsx` — Client Component receives `tools[]` props. Actions column conditionally rendered based on `canMutate` prop (admin only — omitted from DOM entirely for non-admin per cavekit fix) |
| T-042 | DONE   | `_components/tool-filters.tsx` — `useSearchParams()` + `useRouter().replace()`. Search input debounced 300ms. Category + visibility `Select` components. Sentinel `__all__` value clears filter |
| T-043 | DONE   | Server-side Drizzle filtering via raw SQL `WHERE` clause composed from `q` (ILIKE), `category` (eq), `visible` (boolean). Applied inside page.tsx before JSX render |
| T-044 | DONE   | `_components/tool-schema.ts` — Zod schema (`toolFormSchema`), pt-BR error messages, slug regex `^[a-z0-9-]+$`, price/cost non-negative, voltage enum `VOLTAGE_OPTIONS`, `slugify()` helper |
| T-045 | DONE   | `_components/tool-form.tsx` — shared create/edit form, `useState` + `useTransition`, auto-slug from name (until user touches slug), native HTML form submission w/ `safeParse`. Field-level errors shown inline |
| T-046 | DONE   | `_components/tool-image-upload.tsx` — Supabase Storage client upload to `tool-images` bucket, jpg/png/webp MIME allowlist, 5MB max, loading spinner, immediate preview, pt-BR error toasts |
| T-047 | DONE   | Both "Nova ferramenta" CTAs (list header + empty state) server-rendered ONLY when `session.user.role === 'admin'`. Omitted from DOM for non-admin, never `disabled` |
| T-048 | DONE   | `tools/[id]/edit/page.tsx` — calls `requireRole('admin')`, fetches tool + categories + suppliers, `notFound()` if row missing, converts nullable DB fields via `toFormValues()` before passing to `ToolForm` |
| T-049 | DONE   | `_components/delete-tool-dialog.tsx` — shadcn `AlertDialog` w/ tool name in confirmation body, calls `deleteTool()` via `useTransition`, `toast.success` + `router.refresh()` after delete |
| T-050 | DONE   | `actions.ts` bodies: `createTool` (insert w/ `crypto.randomUUID()` + `revalidatePath`), `updateTool` (eq where), `deleteTool` (eq where, stock cascades via FK). All call `requireRole('admin')` first, Zod `parse()` inputs, `normalizePayload()` helper converts empty strings to null |
| T-051 | DONE   | `tools/[id]/page.tsx` detail view — Drizzle `leftJoin` tool+category+supplier, separate query for `stockLevel` × `branch`. Read-only. Admin-only "Editar" link in header |
| T-052 | DONE   | Verified: all `_components/` files live in `apps/web/src/app/dashboard/(inventory)/tools/_components/`. Zero files added or modified in `packages/ui/src/components/` |
| T-053 | DONE   | Empty state uses shadcn `Empty` component w/ `EmptyHeader`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`. Distinguishes filtered (shows "Limpar filtros" link) vs true-empty (shows "Nova ferramenta" if admin) |
| T-054 | DONE   | `sonner` `toast()` calls wired in: `tool-form.tsx` (create/update success + error), `delete-tool-dialog.tsx` (delete success + error), `tool-image-upload.tsx` (upload success + validation errors). All messages pt-BR |

## Files

- `apps/web/src/lib/supabase-client.ts` (new) — `supabaseBrowser` singleton + `TOOL_IMAGES_BUCKET` constant
- `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` (rewrite — full bodies)
- `apps/web/src/app/dashboard/(inventory)/tools/page.tsx` (new — list)
- `apps/web/src/app/dashboard/(inventory)/tools/new/page.tsx` (new — create)
- `apps/web/src/app/dashboard/(inventory)/tools/[id]/page.tsx` (new — detail)
- `apps/web/src/app/dashboard/(inventory)/tools/[id]/edit/page.tsx` (new — edit)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-schema.ts` (new)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` (new)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-image-upload.tsx` (new)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tools-table.tsx` (new)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-filters.tsx` (new)
- `apps/web/src/app/dashboard/(inventory)/tools/_components/delete-tool-dialog.tsx` (new)
- `apps/web/next.config.ts` (modified — `typedRoutes: false` temporary deviation)
- `apps/web/package.json` (modified — `@emach/db`, `drizzle-orm`, `@supabase/supabase-js`, `zod` added)

## Deviations from cavekit

- **`typedRoutes: false`**: Phase 1 cria pages em sequência; Next 16 typedRoutes exige todos os pages existirem antes de validar literais `/dashboard/x`. Desabilitado temporariamente — re-habilitar na Phase 2 quando todas as rotas existirem. Documentado em `next.config.ts` comment.
- **Filtros `q`/`category`/`visible` via raw SQL** em `page.tsx`: Drizzle type-safe builder tornou-se verboso demais para JOIN+GROUP BY + aggregate + dynamic WHERE. Optamos por `db.execute(sql\`...\`)` com `sql.join(conditions, ...)` pra composição segura. Cavekit R2 não obriga Drizzle builder — só diz "server-side filtering no Drizzle query".
- **Image `<img>` tags com biome-ignore**: Next.js `<Image>` requer `remotePatterns` config p/ Supabase URLs. Deferido Phase 2 quando domain Supabase estiver estável. Comments com ignore explícito por regra.
- **`ToolImageUpload` = file input hidden + custom Button**: evita overhead do `Input type="file"` default do browser. Preview + loading state inline.
- **Role-gate server-side only**: Tool list page e edit page são Server Components, verificam `session.user.role` no server antes de renderizar mutation CTAs. Tools-table recebe `canMutate: boolean` como prop — zero exposição client-side de role check.

## T-055 Lint + Build Gate

- `bun x ultracite check apps/web/src/app/dashboard/` — clean (16 files checked, 0 errors)
- `bun --filter=web run build` — exit 0
- 8 routes registered: `/`, `/login`, `/dashboard`, `/dashboard/tools`, `/dashboard/tools/new`, `/dashboard/tools/[id]`, `/dashboard/tools/[id]/edit`, `/api/auth/[...all]`, `/_not-found`

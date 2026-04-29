# Categorias × Atributos — embed do CRUD de atributos dentro de Categoria

**Data:** 2026-04-29
**Branch:** `categorias-atributos`

## Context

Hoje há duas features paralelas no dashboard:
- `/dashboard/attributes` — CRUD standalone de `attribute_definition` (com filtro e relação opcional a categoria via coluna `categoryId` nullable, em que `NULL` representa "global").
- `/dashboard/categories/[id]/edit` — exibe um painel **read-only** listando atributos próprios + herdados + globais aplicáveis àquela categoria, com link de "Novo atributo" que abre a página standalone.

Essa duplicação cria atrito: o usuário precisa navegar entre duas seções para configurar um atributo num contexto específico de categoria, e a sidebar carrega um item "Atributos" que só faz sentido como sub-recurso. Como todo atributo conceitualmente pertence a uma categoria (ou aplica-se a um conjunto delas via herança), faz mais sentido que o CRUD viva embutido no editor de categoria.

**Outcome desejado:** página `/dashboard/categories/[id]/edit` torna-se o único ponto de gestão (criar/editar/remover/listar). Categoria filha vê os herdados com link para a categoria-dona. Sidebar perde o item "Atributos". Conceito de atributo "global" deixa de existir — `attribute_definition.categoryId` torna-se `NOT NULL`.

## Princípios

1. **Source-of-truth claro.** Cada atributo "vive" em exatamente uma categoria. Filhas vêem herdados read-only com link para o dono.
2. **Schema reflete UX.** `categoryId NOT NULL`. Categoria-raiz "Geral" criada na migration recebe os atualmente globais.
3. **Reuso, não cópia.** Form, validação Zod, dialog de delete e `slugifyLabel` migram para `categories/_lib` e `categories/_components`. Nada é duplicado.
4. **Compatibilidade interna.** `buildDefinitionsByCategory` (consumido por Tool form) continua funcionando, apenas perde o branch de globais.

## Arquitetura

### Schema (Drizzle)

`packages/db/src/schema/attributes.ts`:

```ts
// antes: categoryId: text("category_id").references(() => category.id) // nullable
// depois:
categoryId: text("category_id")
  .notNull()
  .references(() => category.id, { onDelete: "restrict" }),
```

Migration custom (gerada via `bun db:generate` e editada manualmente):

```sql
-- 0XXX_attributes_require_category.sql
INSERT INTO category (id, slug, name, path, depth, is_active, sort_order)
SELECT gen_random_uuid(), 'geral', 'Geral', '/geral', 0, true, 0
WHERE NOT EXISTS (SELECT 1 FROM category WHERE slug = 'geral');

UPDATE attribute_definition
   SET category_id = (SELECT id FROM category WHERE slug = 'geral')
 WHERE category_id IS NULL;

ALTER TABLE attribute_definition ALTER COLUMN category_id SET NOT NULL;
```

### Estrutura de arquivos

**Deletar:**

```
apps/web/src/app/dashboard/attributes/
├── page.tsx
├── actions.ts
├── schema.ts
├── new/page.tsx
├── [id]/edit/page.tsx
└── _components/
    ├── attribute-form.tsx
    └── delete-attribute-dialog.tsx
```

**Migrar (refatorando):**

| De | Para | Mudanças |
|---|---|---|
| `attributes/schema.ts` | `categories/_lib/attribute-schema.ts` | Idêntico. Re-exporta `slugifyLabel`, `ATTRIBUTE_INPUT_TYPES`, `attributeFormSchema`. |
| `attributes/actions.ts` | `categories/_lib/attribute-actions.ts` | Server actions ganham `categoryId` obrigatório no payload; `revalidatePath` aponta para `/dashboard/categories/[id]/edit`. |
| `attributes/_components/attribute-form.tsx` | `categories/_components/attribute-form.tsx` | Remove campo `categoryId` (Select); recebe via prop fixa. Ganha prop `onSuccess`. |
| `attributes/_components/delete-attribute-dialog.tsx` | `categories/_components/delete-attribute-dialog.tsx` | Idêntico. |

**Criar:**

```
apps/web/src/app/dashboard/categories/_components/
├── attribute-sheet.tsx          # Wrapper Sheet controlado, side="right" w-full sm:max-w-md
├── attributes-table.tsx         # Tabela reusável (próprios e herdados)
└── (...arquivos migrados)
```

**Atualizar:**

| Arquivo | Motivo |
|---|---|
| `categories/category-form.tsx` | `slugifyLabel` import → novo path. |
| `categories/[id]/edit/page.tsx` | Move busca de atributos (próprios + herdados via cadeia ancestral) do panel para a page; passa pré-classificados como prop. |
| `tools/_components/attribute-helpers.ts` | Remove branch `categoryId IS NULL` em `buildDefinitionsByCategory`. |
| `dashboard/_components/app-sidebar.tsx` | Remove item "Atributos" do grupo Catálogo (linhas 80–90). |
| `apps/web/CLAUDE.md` | Atualiza seção "Convenções de UX em forms" — reescreve descrição do "Painel de atributos por categoria" e remove referência a globais. |

### Server Actions

Em `categories/_lib/attribute-actions.ts`:

```ts
"use server";
import { requireCapability } from "@/lib/permissions";

export async function createCategoryAttribute(
  categoryId: string,
  input: AttributeFormValues
): Promise<ActionResult<{ id: string }>>;

export async function updateCategoryAttribute(
  id: string,
  input: AttributeFormValues
): Promise<ActionResult>;
// categoryId NÃO pode mudar via UI nesta versão — mover atributo entre categorias requer SQL direto.

export async function deleteCategoryAttribute(
  id: string
): Promise<ActionResult>;

export async function getAttributeUsage(id: string): Promise<number>;
```

Capabilities: `attributes.create | update | delete` no início de cada action. `revalidatePath("/dashboard/categories/[id]/edit", "page")` ao final.

### Comportamento UX

**Página `/dashboard/categories/[id]/edit`** com 3 Cards:

1. **Dados da categoria** — form atual, sem mudanças.
2. **Atributos próprios** — header com CardAction `[+ Novo atributo]`. Tabela com colunas: Label · Tipo · Unidade · Obrigatório · Ações. Cada linha tem `[Editar]` e `[Remover]` (ghost sm). Empty state com CTA centralizado.
3. **Atributos herdados** — só aparece se `parentId` existe e há ≥1 herdado. Tabela com Label · Tipo · Origem (Badge da categoria-dona) · `[Abrir →]` (link para `/dashboard/categories/<ownerId>/edit`).

**Sheet (drawer lateral)** — abre via `[+ Novo atributo]` ou `[Editar]`:
- `<Sheet side="right" className="w-full sm:max-w-md">`
- Header: title `"Novo atributo"` / `"Editar atributo"`, description `Categoria: <strong>{nome}</strong>`
- Body: form completo (label, slug auto/disabled em create — editável em edit, tipo, unidade condicional, ordem, switch obrigatório, options/swatches dinâmicos para `select`/`color`).
- Painel de erros agregados no topo do body quando `safeParse` falha (convenção do CLAUDE.md preservada).
- Footer: `[Cancelar]` (outline) + `[Criar atributo]` / `[Salvar alterações]` (primary).
- Ao sucesso: `setOpen(false)` + toast + `revalidatePath` no server action atualiza a página.

**Capabilities** controlam visibilidade:
- `attributes.create` → botão "+ Novo atributo".
- `attributes.update` → botões "Editar" + sheet em modo edit.
- `attributes.delete` → botões "Remover" + dialog.
- Sem nenhuma das 3 → tabela "próprios" vira read-only (igual herdados).

### Estado client do painel

`category-attributes-panel.tsx` vira client component:

```tsx
type SheetMode = "closed" | { kind: "create" } | { kind: "edit"; attribute: Attribute };

const [sheetMode, setSheetMode] = useState<SheetMode>("closed");
const [deleteTarget, setDeleteTarget] = useState<Attribute | null>(null);
```

`attribute-sheet.tsx` recebe `mode`, `categoryId`, `categoryName`, `defaultValues?`, `onOpenChange` e renderiza `<AttributeForm>` no body.

## Arquivos críticos

- `packages/db/src/schema/attributes.ts` — drop `.nullable()` em `categoryId`.
- `packages/db/src/migrations/0XXX_attributes_require_category.sql` — nova migration custom com criação do "Geral".
- `apps/web/src/app/dashboard/categories/_lib/attribute-schema.ts` — schema Zod migrado.
- `apps/web/src/app/dashboard/categories/_lib/attribute-actions.ts` — server actions migradas.
- `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx` — form refatorado (categoryId via prop).
- `apps/web/src/app/dashboard/categories/_components/attribute-sheet.tsx` — novo wrapper.
- `apps/web/src/app/dashboard/categories/_components/attributes-table.tsx` — tabela reusável.
- `apps/web/src/app/dashboard/categories/_components/category-attributes-panel.tsx` — refatorado para client component.
- `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx` — busca atributos próprios + herdados no server.
- `apps/web/src/app/dashboard/tools/_components/attribute-helpers.ts` — remove branch de globais.
- `apps/web/src/app/dashboard/_components/app-sidebar.tsx` — remove item "Atributos".

## Reuso

- `slugifyLabel` (em `attributes/schema.ts`) — migra para `categories/_lib/attribute-schema.ts`. `category-form.tsx` atualiza import.
- `ATTRIBUTE_INPUT_TYPES`, `ATTRIBUTE_INPUT_TYPE_LABELS` — migra junto.
- `attributeFormSchema` (Zod) — migra inteiro; `categoryId` continua sendo validado, mas é injetado via prop em vez de campo de form.
- Capability checks `attributes.{create|update|delete}` — preservados.
- `getAttributeUsage(id)` — preservado para o delete dialog.
- `<Sheet>` shadcn (`packages/ui/src/components/sheet.tsx`) — usado direto.

## Verificação

1. **DB:**
   ```sql
   SELECT count(*) FROM attribute_definition WHERE category_id IS NULL;
   -- esperado: 0
   SELECT id, name, slug FROM category WHERE slug = 'geral';
   -- esperado: 1 linha
   ```

2. **Static checks:**
   ```bash
   bun --cwd apps/web check-types
   bun fix
   rg "dashboard/attributes" apps/web/src
   # esperado: nenhuma ocorrência (a pasta foi deletada)
   ```

3. **Smoke run-time** (`bun dev:web` em :3001):
   - `/dashboard/categories/<id>/edit` carrega com 3 Cards.
   - Botão `+ Novo atributo` abre Sheet com categoria fixa no header.
   - Salvar atributo (tipo `select` com 3 opções) → Sheet fecha + tabela atualiza.
   - Editar atributo existente → slug fica editável; salvar persiste.
   - Remover atributo com `usageCount > 0` → dialog mostra warning de cascade.
   - Visitar categoria filha → Card "Atributos herdados" lista o atributo recém-criado, com badge "Origem: <pai>" e link `[Abrir →]` que navega.
   - `/dashboard/tools/new` ou `/dashboard/tools/<id>/edit` → form ainda resolve specs por categoria sem regressão (criar tool, atribuir categoria, ver specs renderizadas em `dynamic-specs-editor`).

4. **Errors:** se aparecer SSR error, `nextjs_call <port> get_errors` (MCP `next-devtools`).

## Não-objetivos

- Mover atributo entre categorias via UI — fica fora deste escopo. Casos isolados podem ser feitos via SQL direto.
- Drag & drop de reordenação no painel — `sortOrder` continua sendo editado no form.
- Refatorar o componente `dynamic-specs-editor` no Tool form.
- Mudar a árvore de categorias visualmente (continua sendo tabela com indentação por `depth`).

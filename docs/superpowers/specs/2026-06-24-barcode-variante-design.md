# Código de barras único por variante — Design

> Status: aprovado para implementação · 2026-06-24
> Branch: `feat/barcode-variante`
> Escopo: adicionar `barcode` único por Tool Variant e usá-lo em Catálogo, Estoque da filial, Busca global e Pedidos (snapshot).

## Problema e objetivo

Cada **Tool Variant** (a unidade vendável: SKU, preço, voltagem) precisa de um **código de barras único**, para identificação física e operação de armazém. Hoje `tool_variant` não tem nenhum campo de barcode — o único identificador além do `id` é o `sku`.

O barcode existe para ser **escaneado**. Logo, além de cadastrá-lo no criar/editar da ferramenta, ele precisa funcionar nos pontos onde a variante é manipulada: estoque da filial (conferência/movimentação), busca global (achar a variante) e pedidos (rastreabilidade no snapshot).

> Terminologia: "Variante" já é o termo canônico do domínio (`CONTEXT.md` → Tool Variant). Mantido. "Código de barras" é o label de UI em pt-BR.

## Decisões tomadas

| Tema | Decisão | Razão |
|---|---|---|
| Coluna | `tool_variant.barcode text NOT NULL UNIQUE` | Espelha o `sku`; identidade da variante |
| Formato | **Texto livre**, sem validação de formato | Aceita EAN-13, Code128, código interno do fornecedor |
| Obrigatoriedade | **Sempre** obrigatório (inclusive em rascunho), como o SKU | Pedido explícito do usuário; identidade da variante |
| Unicidade | Global, **case-sensitive** (default Postgres), só `trim()` | Barcodes reais são dígitos; index em `LOWER()` é complexidade desnecessária |
| Constraint name | **`tool_variant_barcode_key`** (explícito) | Distinguir colisão de barcode vs SKU no catch de erro 23505 |
| Índice | **Nenhum extra** — o UNIQUE já cria o B-tree | Busca por scan = `WHERE barcode = $1` é O(log n) pelo unique |
| Scanner | **Keyboard-wedge** (leitor USB que "digita" + Enter) | Padrão universal de armazém; sem câmera/permissão. Câmera = futuro |
| Navegação do scan | `/dashboard/tools/{toolId}?variant={variantId}` com highlight da linha | Barcode é por-variante; detalhe é por-tool; query-param leva à variante certa |
| Backfill (dev) | `barcode = sku` nas 17 variantes | SKU já é único → barcode único por construção, sem colisão |

## Estratégia de backfill (push-only, ADR-0006)

A coluna é `NOT NULL` e há **17 variantes** no banco. `drizzle-kit push` não adiciona `NOT NULL` sem default a uma tabela com linhas. Sequência obrigatória (em dev; em produção futura a tabela nasce vazia):

1. **Schema nullable** → `bun db:sync` aplica `ADD COLUMN barcode text` (não-destrutivo, sem prompt TTY).
2. **Backfill** via pg client / `mcp__supabase__execute_sql`:
   `UPDATE tool_variant SET barcode = sku WHERE barcode IS NULL;`
   Verificar: `SELECT count(*) FROM tool_variant WHERE barcode IS NULL;` → **0**.
3. **Schema `.notNull()`** → `bun db:sync` aplica `ALTER COLUMN barcode SET NOT NULL` (seguro, sem nulos). Pode pedir TTY — rodar interativo em dev.
4. **Schema `+ unique('tool_variant_barcode_key').on(table.barcode)`** → `bun db:sync` aplica o UNIQUE.

Confirmar o nome do constraint no banco: `SELECT conname FROM pg_constraint WHERE conrelid = 'tool_variant'::regclass AND contype = 'u';` → deve incluir `tool_variant_barcode_key`.

> Gotcha aplicável (`packages/db/CLAUDE.md`): é a forma análoga de "CHECK novo × dados existentes" — `NOT NULL` sem backfill prévio falha o push. A sequência acima contorna.

## Faseamento

Escopo grande (~18 arquivos dashboard + coordenação cross-repo). Entregue em ondas; **Fase A é bloqueante** — sem ela o build não compila (barcode vira required em `ToolVariantInput` e quebra vários literais).

| Fase | Conteúdo | Depende |
|---|---|---|
| **A — Catálogo + schema** | schema + backfill, seed, validação, criar/editar, variants-tab, testes | — |
| **B — Estoque / scanner** | listagem, filtro, input de scanner, `lookupVariantByBarcodeAction` | A |
| **C — Busca global** | `⌘K`, lista de tools, filtro textual | A |
| **D — Pedidos + e-commerce** | `order_item.barcode` snapshot, exibição, handoff cross-repo | A |

---

## Fase A — Catálogo + schema (bloqueante)

### A1. Schema e seed

**`packages/db/src/schema/tools.ts`** — em `toolVariant`, adicionar `barcode` após `sku`. Forma final: `barcode: text("barcode").notNull()` + no array de constraints `unique("tool_variant_barcode_key").on(table.barcode)`. **Não** adicionar índice separado. O tipo `ToolVariant` (`$inferSelect`/`$inferInsert`) passa a incluir `barcode: string` — propaga a todos os consumidores tipados.

**`packages/db/scripts/seed/catalog.ts`** — `VariantDef` ganha `barcode: string`; cada uma das 17 entradas de `TOOLS[*].variants` recebe `barcode` = valor do `sku`; o insert de `toolVariant` inclui `barcode: varDef.barcode`. Sem isso, `bun db:seed-demo` falha com violação de `NOT NULL`.

**`packages/db/scripts/seed/verify.ts`** — adicionar invariantes:
`SELECT count(*) FROM tool_variant WHERE barcode IS NULL` → 0;
`SELECT count(*) FROM (SELECT barcode FROM tool_variant GROUP BY barcode HAVING count(*) > 1) d` → 0.

### A2. Validação (Zod)

**`apps/web/src/app/dashboard/tools/_components/tool-schema.ts`**:
- `toolVariantSchema`: `barcode: z.string().min(1, "Código de barras obrigatório")` (após `sku`).
- `updateVariantSchema`: `barcode: z.string().min(1).max(128).optional()` (edição inline envia só quando muda, como o `sku`).
- `toolFormSchema.superRefine`: 2º loop espelhando o de SKU — `Set<string>` de barcodes, `ctx.addIssue({ code: "custom", path: ["variants", i, "barcode"], message: "Código de barras duplicado entre variantes" })`.

### A3. Estado inicial e draft

**`apps/web/src/app/dashboard/tools/_components/tool-form-state.ts`** — `EMPTY_TOOL_VALUES.variants[0]` ganha `barcode: ""` (senão TS quebra: campo required ausente).

**`apps/web/src/app/dashboard/tools/_components/tool-draft-storage.ts`** — bump `DRAFT_KEY` de `…:v1` para `…:v2`. Invalida rascunhos salvos antes do deploy (variante sem `barcode` deixaria o form inválido no submit).

### A4. Editor de variantes (wizard + edit)

**`apps/web/src/app/dashboard/tools/_components/variants-editor.tsx`**:
- `EMPTY_VARIANT`: `barcode: ""`.
- `computeDuplicateBarcodes(variants)` idêntica a `computeDuplicateSkus`, sobre `v.barcode`; chamar no corpo do componente.
- Linha de variante: novo campo "Código de barras" com `<Input>` puro (**não** `skuMask` — ele uppercase/strip e descartaria caracteres do barcode), `aria-invalid={isBarcodeDuplicate || undefined}`, `aria-required`, e `<p className="text-destructive text-xs">Código de barras duplicado entre variantes</p>` quando duplicado (`<p>` cru é coerente com o erro de SKU duplicado já existente — é sinalização client-only, não `FieldError` de Zod).
- Grid: ampliar `md:grid-cols-[2fr_1fr_1fr_auto]` para acomodar a coluna (ex.: `[2fr_2fr_1fr_1fr_auto]`); validar breakpoint mobile no smoke visual.
- Label do RadioGroup de variante padrão: opcional incluir barcode além de sku/voltagem.

**`apps/web/src/app/dashboard/tools/_components/fields/variant-fields.tsx`** — atualizar o texto de ajuda mencionando o código de barras.

**`apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`** — atualizar a descrição do step `variants` ("SKUs, códigos de barras, voltagem e preço"). O assert `STEP_FIELDS` **não** muda (barcode é campo aninhado em `variants`, não chave de topo).

### A5. Normalização e server actions

**`apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts`** — `normalizeVariantValues`: adicionar `barcode: v.barcode.trim()`. O tipo de retorno (`Omit<…$inferInsert, "id" | "toolId">`) passa a exigir o campo — guarda de compilação.

**`apps/web/src/app/dashboard/tools/actions.ts`**:
- `createTool`/`updateTool`: nenhuma edição direta — o spread `...normalizeVariantValues(v)` já carrega `barcode`.
- `updateToolVariant`: no bloco `updateFields`, `if (fields.barcode !== undefined) { updateFields.barcode = fields.barcode; }`.
- Catch `23505`: diferenciar por `getPgError(error)?.constraint` — `tool_variant_barcode_key` → "Código de barras já cadastrado em outra variante"; `tool_variant_sku_key` → manter a mensagem de SKU. **Nunca** `e.message.includes` (regra `apps/web/CLAUDE.md`).

**`apps/web/src/app/dashboard/tools/[id]/edit/page.tsx`** — `toFormValues`, no `.map` de `parsedVariants`: `barcode: v.barcode ?? ""`.

### A6. Aba "Variantes & Preços" (edição inline)

**`apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx`**:
- `RowState`: `barcode: string`; `makeRowState`: `barcode: v.barcode`; `isDirty`: comparar barcode.
- `VariantsTab` `<TableHeader>`: `<TableHead>Código de barras</TableHead>` (após SKU).
- `EditableRow`: `<TableCell>` com `<Input className="h-8 w-[160px] font-mono text-xs" …>`.
- `handleSave`: `barcode: state.barcode === initial.barcode ? undefined : state.barcode`.
- `VariantsReadOnly`: header + célula de exibição.

`tool-detail-data.ts` (`ToolDetailVariant = $inferSelect` + `db.select().from(toolVariant)` sem projeção) herda `barcode` automaticamente — sem edição de código.

### A7. Testes

Após `barcode` virar required, todo literal de `variants` sem o campo quebra. Atualizar:
- `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` (`baseTool()`).
- `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts` e `apps/web/__tests__/tool-form-steps.test.ts` (literais `EMPTY`/`variants`).

**Gate da Fase A:** `bun verify` (check-types + check + test) verde + smoke visual em `/dashboard/tools/new`, `/dashboard/tools/[id]/edit`, aba Variantes.

---

## Fase B — Estoque da filial / scanner

**`apps/web/src/app/dashboard/stock/branch-stock-data.ts`** — `BranchStockRow` e `BranchStockDbRow` ganham `barcode: string`; SELECT inclui `tv.barcode`; ambos os mapeamentos (`urgency`/`paginate`) mapeiam `barcode: row.barcode`; o `whereParts` da busca ganha `OR tv.barcode ILIKE …`. Nova função `lookupVariantByBarcode(branchId, barcode)` que faz `… WHERE tv.barcode = $1` e retorna um `BranchStockRow`.

**`apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`** — barcode no subtítulo de metadados (junto de sku/voltagem).

**`apps/web/src/app/dashboard/stock/_components/branch-stock-sheet-head.tsx`** — barcode no `subtitle` (ambos os `lead`).

**`apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx`** — placeholder → "Nome, SKU ou cód. barras".

**`apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx`** — input de scanner (keyboard-wedge: captura sequência + Enter, sem debounce) acima do grid: ao receber Enter, procura em `items` (cache local) por `item.barcode === value`; achou → `setSelectedRow(item)` (abre o sheet de movimentação); não achou no cache → `lookupVariantByBarcodeAction`; limpar + refocus o input.

**`apps/web/src/app/dashboard/stock/actions.ts`** — `lookupVariantByBarcodeAction(barcode, branchId)`: `requireCapabilityWithContext("stock.read", { targetBranchIds: [branchId] })` + delega a `lookupVariantByBarcode`. As 3 actions de mutação (`recordStockEntry`/`recordStockWriteOff`/`adjustStock`) **continuam recebendo `variantId`** — barcode só resolve para variantId aqui.

> Branch-scoping é obrigatório no lookup — sem ele um admin de outra filial veria estoque fora do escopo.

**Gate B:** smoke com leitor real (ou simulação de keydown rápido + Enter) → escanear abre o sheet da variante certa; respeitar branch-scope.

---

## Fase C — Busca global

**`apps/web/src/app/dashboard/_lib/global-search.server.ts`** — caso de barcode (ou fundido ao de tools): `SELECT tv.id AS variant_id, t.id, t.name, tv.sku FROM tool_variant tv JOIN tool t ON t.id = tv.tool_id WHERE tv.barcode = $query LIMIT 1`. **Match exato** (único global; ILIKE geraria falso positivo). `href = /dashboard/tools/{t.id}?variant={tv.id}`.

**`apps/web/src/app/dashboard/_lib/global-search.ts`** — `SearchHit` opcional `variantId?: string`.

**`apps/web/src/app/dashboard/_components/command-palette.tsx`** — hit de barcode único → navegar (o debounce de 250ms + scanner <100ms resultam em 1 query do estado final, não 13). Validar empiricamente o Enter do scanner no `cmdk`.

**`apps/web/src/app/dashboard/tools/data.ts`** — `buildToolsWhereClause`: `OR EXISTS (SELECT 1 FROM tool_variant tv WHERE tv.tool_id = t.id AND tv.barcode ILIKE …)`. Acha a tool-pai (a lista é por-tool).

**`apps/web/src/app/dashboard/tools/_components/tool-filters.tsx`** — label/placeholder mencionando código de barras.

**Destino do highlight** — a aba Variantes de `/dashboard/tools/[id]` lê `?variant=` e destaca/scrolla a linha (ajuste em `variants-tab.tsx` / page de detalhe).

**Gate C:** escanear no `⌘K` → navega à ferramenta; busca textual parcial casa barcode.

---

## Fase D — Pedidos (snapshot) + coordenação e-commerce

**`packages/db/src/schema/orders.ts`** — `orderItem` ganha `barcode: text("barcode")` **nullable** (sem unique, sem CHECK), após `sku`. Pedidos antigos (42 no seed) ficam `null` — aceitável. Seed `sales.ts` pode incluir `barcode: null` explícito por clareza.

**`apps/web/src/app/dashboard/orders/data.ts`** — `OrderDetailItem` ganha `barcode: string | null`; mapper inclui `barcode: item.barcode` (query usa select sem projeção → coluna entra automaticamente).

**`apps/web/src/app/dashboard/orders/[id]/_components/tabs/items-tab.tsx`** — exibição condicional `{item.barcode && <span>Código de barras: {item.barcode}</span>}`.

### Coordenação cross-repo (vira issues no `emach-ecommerce`)

`tool_variant`, `order_item`, `queries/tools.ts` e `docs/integration/admin-ecommerce.md` estão na superfície de sync (ADR-0009 → PR automático do CI). **Nunca editar o ecommerce a partir deste repo** — abrir issues de handoff:

1. **`getToolBySlug`** (`packages/db/src/queries/tools.ts`) — incluir `barcode` no SELECT explícito de `tool_variant`. Sem isso, o storefront recebe `undefined` em runtime mesmo com o tipo correto. (É arquivo da superfície de sync — mudança feita aqui, propaga via CI.)
2. **Checkout do ecommerce** — copiar `toolVariant.barcode → order_item.barcode` no INSERT. O CI sincroniza **schema**, não o código de checkout — alteração manual no repo ecommerce.
3. **`docs/integration/admin-ecommerce.md`** — adicionar `barcode` (opcional, nullable) na tabela de campos de `order_item`.
4. **Deploy** — banco com `barcode` em `tool_variant` (NOT NULL, backfill completo) **antes** de qualquer deploy do ecommerce que leia/escreva o campo. `order_item.barcode` é nullable → pode entrar antes, sem risco.

**Gate D:** detalhe de pedido exibe barcode quando presente; pedidos antigos não mostram lixo; issues de handoff abertas.

---

## Riscos e gotchas (consolidado)

- **Build quebra cedo, de propósito:** `barcode` required em `ToolVariantInput` derruba `EMPTY_VARIANT`, `EMPTY_TOOL_VALUES`, `toFormValues`, `normalizeVariantValues` e os testes. São os primeiros pontos a corrigir; usar como checklist de compilação.
- **`db.execute` raw com SELECT explícito não herda colunas novas** — `getToolBySlug` e `catalog-helpers.ts` (storefront) precisam de `barcode` adicionado à mão se forem expor o campo. `db.select()`/relational herdam.
- **Nome do constraint:** declarar explícito (`tool_variant_barcode_key`) e **confirmar no banco** antes de codar o catch de 23505.
- **Scanner ≠ debounce:** o input de scan no estoque não usa o debounce do filtro textual — captura buffer + Enter direto.
- **Regra `"use server"`:** `actions.ts` só exporta async functions — qualquer const/regex auxiliar de barcode vai em `tool-schema.ts`/`_lib`.
- **Smoke visual obrigatório:** `check-types` não pega hook client em Server Component nem SQL inválido em template — visitar as rotas afetadas após cada fase.

## Arquivos por fase (índice rápido)

- **A:** `schema/tools.ts`, `seed/catalog.ts`, `seed/verify.ts`, `tool-schema.ts`, `tool-form-state.ts`, `tool-draft-storage.ts`, `variants-editor.tsx`, `fields/variant-fields.tsx`, `tool-form-steps.ts`, `tool-query-helpers.ts`, `actions.ts`, `[id]/edit/page.tsx`, `[id]/_components/variants-tab.tsx`, 3 arquivos de teste.
- **B:** `stock/branch-stock-data.ts`, `branch-stock-card.tsx`, `branch-stock-sheet-head.tsx`, `branch-stock-filters.tsx`, `branch-stock-infinite.tsx`, `stock/actions.ts`.
- **C:** `_lib/global-search.server.ts`, `_lib/global-search.ts`, `command-palette.tsx`, `tools/data.ts`, `tool-filters.tsx`, highlight em `variants-tab.tsx`/detalhe.
- **D:** `schema/orders.ts`, `orders/data.ts`, `items-tab.tsx` + handoff: `queries/tools.ts`, `admin-ecommerce.md`, issues no ecommerce.

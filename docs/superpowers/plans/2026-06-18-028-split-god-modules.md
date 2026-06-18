# Split god modules (tools + promotions) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quebrar `tools/actions.ts` (1075 linhas) e `promotions/actions.ts` (1020 linhas) no padrão de 3 camadas (`actions.ts` "use server" só mutations + wrappers / `data.ts` "server-only" reads+tipos / `_lib` puros), sem mudança de comportamento e sem re-export shim.

**Architecture:** Cada feature ganha `data.ts` (`import "server-only"`) com reads, tipos públicos e query builders; `_lib/*-query-helpers.ts` com helpers puros; e `actions.ts` enxuto com mutations + thin wrappers `"use server"` para os reads chamados de Client Components. Consumers passam a importar de `./data` (tipos/reads server-side) ou do wrapper Action (reads do client). Spec: `docs/superpowers/specs/2026-06-18-028-split-god-modules-design.md`.

**Tech Stack:** Next.js 16 (App Router, `"use server"` / `server-only`), React 19, Drizzle 0.45, Vitest (`environment: node`), Biome/ultracite.

## Global Constraints

- **`bun run --cwd apps/web build` é o gate decisivo** após mexer em arquivo `"use server"`. `check-types`/lint/test NÃO pegam `Only async functions are allowed to be exported in a "use server" file`.
- **`data.ts` usa `import "server-only"`** (linha 1), NUNCA `"use server"`. Arquivos `_lib/*` não têm diretiva nenhuma.
- **`_lib/*` são puros:** zero `requireCapability`/`requireCurrentSession`/imports de auth. (Done-criteria faz grep.)
- **Sem re-export shim:** nenhum `export ... from "./data"` em `actions.ts`. Atualizar os consumers.
- **Sem mudança de comportamento/assinatura.** Move verbatim; só muda caminho de import e a localização do guard de `fetchToolsPage`.
- Anti-patterns banidos (raiz CLAUDE.md): sem `: any`/`as any`/`@ts-ignore`, sem `console.*` (usar `logger`), sem barrel files.
- **Read cada arquivo antes de Edit** (`cat`/`sed`/`head` NÃO contam para o harness). Se Edit falhar com `string not found`, re-Read antes de re-tentar — nunca editar de memória. Rodar `bun check-types` antes de cada commit.
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reordenar imports; re-Read se um Edit subsequente falhar.
- **Drift confirmado (2026-06-18):** `errorMessage` NÃO existe mais em `tools/actions.ts` (audit trocou por `actionErrorMessage`); `updateTool` captura vídeo dentro da transação (plano 026). Localizar símbolos por nome/assinatura no HEAD, NÃO pelos números do `plans/028-*.md` original.
- **2 commits no total** (decisão do usuário): um para tools (Tasks 1–5), um para promotions (Tasks 6–9).

---

### Task 1: Extrair helpers puros de tools para `_lib` + teste characterization

Move-then-test: como `attributeValueRow` é sync, não pode ser exportada de `actions.ts` (`"use server"`) para teste. Move primeiro para o `_lib` (export livre), testa imediatamente — é a rede de segurança antes de qualquer outro move.

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts`
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-query-helpers.test.ts`

**Interfaces:**
- Produces (exported de `tool-query-helpers.ts`):
  - `toNumericString(value: number | null | undefined): string | null`
  - `toInt(value: number | undefined): number | null`
  - `nullableText(value: string | undefined): string | null`
  - `normalizeToolPayload(input: ToolFormValues)` (mesmo retorno atual)
  - `normalizeVariantValues(v: ToolVariantInput)` (mesmo retorno atual)
  - `attributeValueRow(def: AttributeDefinition, input: AttributeValueInput): { valueText: string | null; valueNumeric: string | null; valueNumericMax: string | null; valueBool: boolean | null } | null`

- [ ] **Step 1: Criar `tool-query-helpers.ts` movendo os 6 helpers puros**

Read `apps/web/src/app/dashboard/tools/actions.ts`. Recortar **verbatim** (cut, não copy) os corpos atuais de `toNumericString` (≈L47), `toInt` (≈L54), `nullableText` (≈L61), `normalizeToolPayload` (≈L97), `normalizeVariantValues` (≈L120) e `attributeValueRow` (≈L145–211). Colar em `tool-query-helpers.ts`, adicionando `export` a cada um. Sem diretiva no topo do arquivo. Cabeçalho de imports:

```ts
import type { AttributeDefinition } from "@emach/db/schema/attributes";
import type { toolVariant } from "@emach/db/schema/tools";
import type {
	AttributeValueInput,
	ToolFormValues,
	ToolVariantInput,
} from "../_components/tool-schema";
```

> Nota: `normalizeVariantValues` retorna shape compatível com `toolVariant.$inferInsert` — manter o `import type { toolVariant }` se o corpo o referencia; caso o corpo não use o tipo nominal, remover o import não usado (lint exige).

- [ ] **Step 2: Importar os helpers de volta em `actions.ts`**

Em `tools/actions.ts`, remover as 6 definições recortadas e adicionar o import (ordenação será normalizada pelo `bun fix`):

```ts
import {
	attributeValueRow,
	normalizeToolPayload,
	normalizeVariantValues,
	nullableText,
	toInt,
	toNumericString,
} from "./_lib/tool-query-helpers";
```

Remover do bloco `import { ... } from "./_components/tool-schema"` os símbolos que só os helpers usavam, SE não forem mais referenciados em `actions.ts` (deixar `bun check`/`check-types` apontar os não-usados).

- [ ] **Step 3: Verificar que compila com os helpers movidos**

Run: `bun check-types`
Expected: exit 0 (sem erros).

- [ ] **Step 4: Escrever o teste characterization de `attributeValueRow`**

Criar `tools/_components/__tests__/tool-query-helpers.test.ts`. Fixture completo de `AttributeDefinition` (campos NOT NULL: `id, slug, label, inputType, isRequired, categoryId, sortOrder, createdAt, updatedAt`; nullable: `unit, options`):

```ts
import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { describe, expect, it } from "vitest";
import { attributeValueRow } from "../../_lib/tool-query-helpers";

const def = (
	inputType: AttributeDefinition["inputType"]
): AttributeDefinition => ({
	id: "attr-1",
	slug: "attr-1",
	label: "Attr 1",
	inputType,
	unit: null,
	options: null,
	isRequired: false,
	categoryId: "cat-1",
	sortOrder: 0,
	createdAt: new Date("2026-01-01T00:00:00Z"),
	updatedAt: new Date("2026-01-01T00:00:00Z"),
});

describe("attributeValueRow", () => {
	it("text não-vazio → valueText preenchido", () => {
		expect(attributeValueRow(def("text"), { valueText: "  foo  " })).toEqual({
			valueText: "foo",
			valueNumeric: null,
			valueNumericMax: null,
			valueBool: null,
		});
	});

	it("text vazio/whitespace → null", () => {
		expect(attributeValueRow(def("text"), { valueText: "   " })).toBeNull();
	});

	it("boolean true → valueBool true", () => {
		expect(attributeValueRow(def("boolean"), { valueBool: true })).toEqual({
			valueText: null,
			valueNumeric: null,
			valueNumericMax: null,
			valueBool: true,
		});
	});

	it("number NaN → null", () => {
		expect(attributeValueRow(def("number"), { valueNumeric: Number.NaN })).toBeNull();
	});

	it("number válido → valueNumeric string", () => {
		expect(attributeValueRow(def("number"), { valueNumeric: 42 })).toEqual({
			valueText: null,
			valueNumeric: "42",
			valueNumericMax: null,
			valueBool: null,
		});
	});

	it("numeric_range com min e max → ambos setados", () => {
		expect(
			attributeValueRow(def("numeric_range"), {
				valueNumeric: 10,
				valueNumericMax: 20,
			})
		).toEqual({
			valueText: null,
			valueNumeric: "10",
			valueNumericMax: "20",
			valueBool: null,
		});
	});

	it("numeric_range com min NaN → null", () => {
		expect(
			attributeValueRow(def("numeric_range"), { valueNumeric: Number.NaN })
		).toBeNull();
	});

	it("input nulo/undefined → null", () => {
		expect(attributeValueRow(def("text"), null)).toBeNull();
	});
});
```

> Se o tipo `AttributeValueInput` não permitir `null` como segundo argumento, ajustar o último caso para `attributeValueRow(def("text"), {})` (o corpo trata ambos via `if (!input) return null`). Verificar a assinatura ao escrever.

- [ ] **Step 5: Rodar o teste**

Run: `bun --cwd apps/web test -- tool-query-helpers`
Expected: PASS (8 casos) + suíte existente verde.

- [ ] **Step 6: Sem commit ainda** — o commit de tools fecha na Task 5 (1 commit por módulo).

---

### Task 2: Criar `tools/data.ts` (reads + tipos + builders, server-only)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/data.ts`
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`

**Interfaces:**
- Consumes: `./_lib/tool-query-helpers` (se algum read usar `attributeValueRow` etc.).
- Produces (exported de `data.ts`):
  - tipos `ToolSort`, `ToolsListMode`, `ToolsFiltersInput`, `ToolPageRow`
  - `fetchDefinitionsBySlug(slugs: string[]): Promise<Map<string, AttributeDefinition>>`
  - `primaryCategoryIncompleteError(primaryCategoryId: string): Promise<string | null>`
  - `currentPrimaryCategoryId(toolId: string): Promise<string | null>`
  - `buildToolsWhereClause(filters, decoded)` / `buildToolsNextCursor(sort, last)`
  - `fetchToolsPage({ filters, cursor }): Promise<InfiniteResult<ToolCardData>>` — **sem** `requireCapability` interno

- [ ] **Step 1: Criar `tools/data.ts` com `import "server-only"`**

Read `tools/actions.ts`. Criar `data.ts` com `import "server-only";` na linha 1. Mover **verbatim** (cut): os tipos `ToolSort`/`ToolsListMode`/`ToolsFiltersInput`/`ToolPageRow`, e as funções `fetchDefinitionsBySlug`, `primaryCategoryIncompleteError`, `currentPrimaryCategoryId`, `buildToolsWhereClause`, `buildToolsNextCursor`, `fetchToolsPage`. Exportar os tipos e funções que os consumers/wrapper precisam (`ToolSort`, `ToolsListMode`, `ToolsFiltersInput`, `fetchToolsPage`, e as fns auxiliares que `actions.ts` ainda chama).

Imports necessários (incluir os que o corpo movido referenciar):

```ts
import "server-only";

import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { toolCategory } from "@emach/db/schema/categories";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { getUserBranchScope } from "@/lib/branch-scope";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import {
	isCategoryComplete,
	MIN_CATEGORY_ATTRIBUTES,
} from "../categories/_lib/category-completeness";
import { getEffectiveAttributeCount } from "../categories/_lib/effective-attributes";
import type { ToolStatusValue } from "./_components/tool-schema";
```

> Ajustar a lista exata aos símbolos realmente referenciados (lint reprova import não usado). `requireCapability` permanece importado se algum read **que não seja** `fetchToolsPage` o usar; senão removê-lo daqui (vai pro wrapper na Task 3).

- [ ] **Step 2: Remover o guard inline de `fetchToolsPage` em `data.ts`**

Em `data.ts`, no corpo de `fetchToolsPage`, trocar:

```ts
	const session = await requireCapability("tools.read");
	const scope = await getUserBranchScope(session);
```
por:
```ts
	const scope = await getUserBranchScope(await requireCurrentSession());
```

…**OU**, se preferir não acoplar a sessão aqui, manter a derivação de `scope` recebendo a sessão do caller. Decisão concreta deste plano: o guard de capability sai daqui e vai para o wrapper (Task 3); o `scope` continua sendo derivado de `getUserBranchScope(session)`, então `fetchToolsPage` precisa da `session`. Para manter assinatura estável (callers passam só `{filters,cursor}`), resolver a sessão internamente com `requireCurrentSession`:

```ts
import { requireCurrentSession } from "@/lib/session";
```
```ts
	const session = await requireCurrentSession();
	const scope = await getUserBranchScope(session);
```

Isso preserva o branch-scoping (fail-closed) sem o capability-gate, que passa a ser responsabilidade do wrapper e do `page.tsx`. Remover o import de `requireCapability` de `data.ts` se nada mais o usar.

- [ ] **Step 3: Verificar compilação**

Run: `bun check-types`
Expected: exit 0. (`tools/actions.ts` ainda referencia símbolos movidos — corrigido na Task 3; se houver erro de símbolo faltando em `actions.ts`, é esperado e some na próxima task. Se quiser isolar, rode após a Task 3.)

---

### Task 3: Enxugar `tools/actions.ts` + `fetchToolsPageAction` + atualizar consumers

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx`
- Modify: `apps/web/src/app/dashboard/tools/page.tsx`

**Interfaces:**
- Consumes: `./data` (`fetchToolsPage`, tipos), `./_lib/tool-query-helpers`.
- Produces: `fetchToolsPageAction(args: { filters: ToolsFiltersInput; cursor: string | null }): Promise<InfiniteResult<ToolCardData>>` (`"use server"`, com `requireCapability("tools.read")`).

- [ ] **Step 1: Adicionar o wrapper `fetchToolsPageAction` em `actions.ts`**

Read `tools/actions.ts`. Adicionar (mantendo `"use server"` no topo):

```ts
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import type { InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";
import { fetchToolsPage, type ToolsFiltersInput } from "./data";

export async function fetchToolsPageAction(args: {
	filters: ToolsFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<ToolCardData>> {
	await requireCapability("tools.read");
	return fetchToolsPage(args);
}
```

(imports já existentes não duplicar; `bun fix` consolida.) Confirmar que `actions.ts` NÃO tem nenhum `export type ... from "./data"` nem `export { ... } from "./data"` — sem shim. Os tipos que mutations internas usam podem ser importados normalmente de `./data` via `import type`.

- [ ] **Step 2: Apontar o Client Component para o Action**

Read `tools/_components/tools-infinite.tsx`. Trocar:
```ts
import { fetchToolsPage, type ToolsFiltersInput } from "../actions";
```
por:
```ts
import type { ToolsFiltersInput } from "../data";
import { fetchToolsPageAction } from "../actions";
```
E o uso `fetchToolsPage(...)` → `fetchToolsPageAction(...)` (provável em `fetchPage: (cursor) => fetchToolsPageAction({ filters, cursor })` — verificar o call-site real).

- [ ] **Step 3: Apontar a página (Server Component) para `./data`**

Read `tools/page.tsx`. Trocar o import:
```ts
import {
	fetchToolsPage,
	type ToolSort,
	type ToolsFiltersInput,
	type ToolsListMode,
} from "./actions";
```
por:
```ts
import {
	fetchToolsPage,
	type ToolSort,
	type ToolsFiltersInput,
	type ToolsListMode,
} from "./data";
```
(`page.tsx` é Server Component e já chama `requireCapabilityOrRedirect` no topo — pode chamar `fetchToolsPage` de `./data` diretamente.)

- [ ] **Step 4: Conferir que nenhum outro consumer importava reads/tipos de tools de `./actions`**

Run: `rg -n "from \"\\.\\./actions\"|from \"\\./actions\"" apps/web/src/app/dashboard/tools`
Expected: os únicos imports restantes de `./actions`/`../actions` são de **mutations** (`createTool`, `updateTool`, `deleteTool`, `updateToolVariant`, `setDefaultToolVariant`, `setVariantVisibility`, `deleteToolVariant`) ou de `fetchToolsPageAction`. Nenhum import de `fetchToolsPage`/`ToolSort`/`ToolsListMode`/`ToolsFiltersInput` de `./actions`.

- [ ] **Step 5: Gate de build (decisivo) + checagens**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: todos exit 0.

Run: `bun run --cwd apps/web build`
Expected: exit 0. **Se falhar com `Only async functions are allowed to be exported in a "use server" file`**, há um export não-async/tipo/re-export sobrando em `actions.ts` → removê-lo (o tipo/leitura deve sair de `./data`, não ser re-exportado).

- [ ] **Step 6: Tamanho + commit (commit 1/2)**

Run: `wc -l apps/web/src/app/dashboard/tools/actions.ts apps/web/src/app/dashboard/tools/data.ts apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts`
Expected: `actions.ts` < 400 linhas.

```bash
git add apps/web/src/app/dashboard/tools/
git commit -m "refactor: extrair reads/helpers de tools/actions em data/_lib"
```

---

### Task 4: Extrair helpers de promotions para `_lib` + teste characterization

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`
- Test: `apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts`

**Interfaces:**
- Produces (exported de `promotion-query-helpers.ts`):
  - `dbErrorMessage(error: unknown): string`
  - `safeRequireRole(error: unknown): ActionResult<never>`
  - `conflict(message: string): never`
  - `type Tx` (Drizzle transaction)
  - `assertTitleUnique(tx: Tx, type: string, title: string, excludeId?: string): Promise<void>`
  - `assertCodeUnique(tx: Tx, code: string, excludeId?: string): Promise<void>`
  - `assertFeaturedSlotFree(tx: Tx, excludeId?: string): Promise<void>`
  - `buildCouponFields(data: PromotionFormValues)`
  - `computeStatus(p: { active: boolean; startsAt: Date | null; endsAt: Date | null }): PromotionStatus`
  - `promotionStatusCondition(...)` + `interface PromotionStatusCols`
  - `makePromotionCursor(sort: PromotionSort, last: {...}): Cursor`

> `PromotionStatus` e `PromotionSort` são tipos públicos que vivem em `data.ts` (Task 5). Este `_lib` os importa via `import type { PromotionStatus, PromotionSort } from "../data"`. Se isso criar ciclo de import em runtime, mover apenas esses dois `type` para um arquivo neutro `promotions/_lib/promotion-types.ts` e ambos (`data.ts` e `_lib`) importarem dele. Decidir ao implementar (STOP condition de ciclo).

- [ ] **Step 1: Criar `promotion-query-helpers.ts` movendo os helpers**

Read `promotions/actions.ts`. Recortar **verbatim** os corpos atuais de `dbErrorMessage`, `safeRequireRole`, `conflict`, `type Tx`, `assertTitleUnique`, `assertCodeUnique`, `assertFeaturedSlotFree`, `buildCouponFields`, `computeStatus` (≈L214–230), `promotionStatusCondition` (≈L272), `makePromotionCursor` (≈L314). Colar em `promotion-query-helpers.ts` com `export`. Sem diretiva. Imports prováveis:

```ts
import { db } from "@emach/db";
import { promotion } from "@emach/db/schema/promotions";
import { type AnyColumn, and, eq, ne, sql } from "drizzle-orm";
import type { ActionResult } from "@/lib/action-result";
import type { Cursor } from "@/lib/cursor";
import { logger } from "@/lib/logger";
import type { PromotionFormValues } from "../_components/promotion-schema";
import type { PromotionSort, PromotionStatus } from "../data";
```
(ajustar nomes de schema/símbolos ao que o corpo realmente usa.)

- [ ] **Step 2: Importar de volta em `actions.ts`**

Em `promotions/actions.ts`, remover as definições recortadas e importar do `_lib`. Confirmar que `computeStatus`/`promotionStatusCondition`/`makePromotionCursor` que `data.ts` (Task 5) vai usar também serão importados lá do `_lib`.

- [ ] **Step 3: Compila?**

Run: `bun check-types`
Expected: exit 0 (erros de símbolo faltando em `actions.ts` referente a reads serão resolvidos na Task 5).

- [ ] **Step 4: Teste characterization de `computeStatus`**

Criar `promotions/_lib/__tests__/promotion-query-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeStatus } from "../promotion-query-helpers";

const day = (offsetDays: number): Date =>
	new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);

describe("computeStatus", () => {
	it("endsAt no passado → expired (mesmo se inativa)", () => {
		expect(
			computeStatus({ active: false, startsAt: null, endsAt: day(-1) })
		).toBe("expired");
	});

	it("inativa e não expirada → inactive", () => {
		expect(
			computeStatus({ active: false, startsAt: null, endsAt: null })
		).toBe("inactive");
	});

	it("ativa com startsAt no futuro → scheduled", () => {
		expect(
			computeStatus({ active: true, startsAt: day(1), endsAt: null })
		).toBe("scheduled");
	});

	it("ativa sem janela → active", () => {
		expect(
			computeStatus({ active: true, startsAt: null, endsAt: null })
		).toBe("active");
	});
});
```

> A ordem de precedência do corpo é expired → inactive → scheduled → active (verificada no HEAD). O primeiro caso fixa que `expired` vence `inactive`.

- [ ] **Step 5: Rodar o teste**

Run: `bun --cwd apps/web test -- promotion-query-helpers`
Expected: PASS (4 casos) + suíte verde.

---

### Task 5: Criar `promotions/data.ts` + enxugar `actions.ts` + wrappers + consumers

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/data.ts`
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`
- Modify: consumers que importam reads/tipos de `../actions` (lista no Step 4)

**Interfaces:**
- Produces (exported de `data.ts`): tipos `PromotionStatus`, `PromotionStatusCounts`, `PromotionToolItem`, `PromotionListItem`, `PromotionDetail`, `PromotionSort`, `ListPromotionsOptions`; reads `fetchPromotionsPage`, `getPromotion`, `getPromotionStatusCounts`, `getToolOptions`, `countToolsWithActivePromotion` (sem guard de capability — `requireCurrentSession` interno preservado).
- Produces (exported de `actions.ts`, `"use server"`): wrappers para os reads que Client Components consomem (ver Step 3).

- [ ] **Step 1: Criar `promotions/data.ts` (`import "server-only"`)**

Read `promotions/actions.ts`. Criar `data.ts` com `import "server-only";` na linha 1. Mover **verbatim**: os 7 tipos públicos e as 5 read functions listadas. Manter `await requireCurrentSession()` interno dos reads (não é capability-gate, é só sessão — preserva comportamento). Importar do `_lib`:

```ts
import {
	computeStatus,
	makePromotionCursor,
	promotionStatusCondition,
	type PromotionStatusCols,
} from "./_lib/promotion-query-helpers";
```

- [ ] **Step 2: Enxugar `actions.ts` — remover reads/tipos movidos**

Em `promotions/actions.ts` remover as 5 reads e os 7 tipos (agora em `data.ts`). Manter as 5 mutations (`createPromotion`, `updatePromotion`, `deletePromotion`, `togglePromotionActive`, `duplicatePromotion`). Onde as mutations referenciam tipos movidos, `import type { ... } from "./data"`. **Nenhum** `export ... from "./data"`.

- [ ] **Step 3: Criar wrappers `"use server"` para reads chamados de Client Components**

Identificar quais reads são chamados de `"use client"`:

Run: `rg -n "countToolsWithActivePromotion|fetchPromotionsPage|getPromotion|getPromotionStatusCounts|getToolOptions" apps/web/src/app/dashboard/promotions/_components`

Para cada read importado por um arquivo com `"use client"` no topo, criar um wrapper em `actions.ts`:

```ts
import {
	countToolsWithActivePromotion as countToolsWithActivePromotionData,
} from "./data";

export async function countToolsWithActivePromotionAction(
	toolIds: string[],
	excludeId?: string
): Promise<number> {
	return countToolsWithActivePromotionData(toolIds, excludeId);
}
```

E apontar o Client Component para o `*Action`. Reads chamados só de Server Components (`page.tsx`, `[id]/page.tsx`, etc.) importam direto de `./data` — sem wrapper. (Atual: `countToolsWithActivePromotion` é chamado de `promotion-form-fields.tsx:33`, que é client → precisa wrapper. Confirmar os demais com o grep.)

- [ ] **Step 4: Atualizar consumers (tipos → `./data`)**

Para cada arquivo abaixo (lista derivada de `plans/028-*.md:111-128`, **re-validar com grep contra HEAD**), trocar o import de tipo/read de `../actions` → `../data` (ou para o `*Action` se for read chamado do client):

Run primeiro: `rg -n "from \"\\.\\./actions\"|from \"\\.\\./\\.\\./actions\"|from \"\\./actions\"" apps/web/src/app/dashboard/promotions`

Alvos esperados (tipos): `promotion-status-badge.tsx`, `promotions-filters.tsx`, `promotions-grid.tsx`, `promotion-card.tsx`, `_components/_lib/format.ts`, `[id]/_components/promotion-identity.tsx`, `tools-tab.tsx`, `overview-tab.tsx`, `promotion-header-actions.tsx`; (reads server-side) `page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`. Mutations (`delete-promotion-dialog.tsx`, `promotion-form.tsx`) permanecem em `../actions`.

- [ ] **Step 5: Gate de build + checagens**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: exit 0.

Run: `bun run --cwd apps/web build`
Expected: exit 0. (Mesma regra de `"use server"` que a Task 3 Step 5.)

- [ ] **Step 6: Tamanho + commit (commit 2/2)**

Run: `wc -l apps/web/src/app/dashboard/promotions/actions.ts apps/web/src/app/dashboard/promotions/data.ts apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`
Expected: `actions.ts` < 400 linhas.

```bash
git add apps/web/src/app/dashboard/promotions/
git commit -m "refactor: extrair reads/helpers de promotions/actions em data/_lib"
```

---

### Task 6: Gate final, smoke visual e atualização do índice

**Files:**
- Modify: `plans/README.md`

- [ ] **Step 1: Gate completo**

Run: `bun verify`
Expected: exit 0 (check-types + check + test).

Run: `bun run --cwd apps/web build && bun guard:forms`
Expected: ambos exit 0.

- [ ] **Step 2: Pureza dos `_lib` (done-criteria)**

Run: `rg -n "requireCapability|requireCurrentSession" apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`
Expected: nenhum match.

Run: `rg -n "export .* from \"\\./data\"" apps/web/src/app/dashboard/tools/actions.ts apps/web/src/app/dashboard/promotions/actions.ts`
Expected: nenhum match (sem shim).

- [ ] **Step 3: Smoke visual**

Run: `bun dev:web` (porta 3001).
- `/dashboard/tools` — lista carrega + scroll infinito funciona; editar uma tool e salvar.
- `/dashboard/promotions` — lista carrega; abrir detalhe/edit de uma promoção.
Checar runtime errors via `nextjs_call <port> get_errors` (MCP `next-devtools`) se disponível. Esperado: sem erros, sem páginas em branco.

- [ ] **Step 4: Atualizar `plans/README.md`**

Trocar a linha de status do plano 028 de `BLOCKED (...)` para `DONE (re-do sem shim, server-only + consumers atualizados; ver docs/superpowers/specs/2026-06-18-028-split-god-modules-design.md)`.

```bash
git add plans/README.md
git commit -m "docs: marca plano 028 como DONE (split god modules)"
```

> Nota: este 3º commit é só de docs (índice). Os **2 commits de código** pedidos pelo usuário são os das Tasks 3 e 5.

---

## Self-Review (autor)

- **Cobertura da spec:** 3 camadas (Tasks 1–5) ✓; server-only não "use server" (Task 2/5 Step 1) ✓; sem shim (Global Constraints + Task 6 Step 2) ✓; guard via wrapper para `fetchToolsPage` (Task 3) ✓; reads promotions via `requireCurrentSession` + wrappers só p/ client (Task 5) ✓; testes antes do trabalho pesado (Tasks 1 e 4) ✓; gate `bun run build` (Tasks 3,5,6) ✓; smoke + README (Task 6) ✓; orders fora de escopo ✓.
- **Placeholders:** os "ajustar imports ao que o corpo usa" são instruções de lint-driven, não TODOs de lógica; o código novo (testes, wrappers, fixtures) está completo.
- **Consistência de tipos:** `fetchToolsPageAction` consome `ToolsFiltersInput`/`ToolCardData`/`InfiniteResult` definidos em `./data`/libs; `computeStatus`/`attributeValueRow` testados com as assinaturas verbatim do HEAD.
- **Risco residual conhecido:** ciclo de import `_lib` ↔ `data.ts` por `PromotionStatus`/`PromotionSort` (Task 4 tem o fallback `promotion-types.ts`); derivação do tipo `Tx` (STOP condition na spec).

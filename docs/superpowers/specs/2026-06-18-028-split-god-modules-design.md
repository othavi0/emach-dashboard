# Spec — Plano 028 (re-do): split dos god modules `tools` e `promotions`

> **Data:** 2026-06-18 · **Branch:** `chore/audit-followup-2026-06`
> **Substitui:** a abordagem com shim do `plans/028-split-god-module-actions.md` (BLOCKED — re-export em `"use server"` quebra o build).
> **Próximo passo:** writing-plans → plano de implementação.

## Contexto e motivação

Os dois maiores arquivos de actions do `apps/web` misturam, num único módulo `"use server"`, mutations + reads + query builders + helpers puros:

- `tools/actions.ts` — 1075 linhas
- `promotions/actions.ts` — 1020 linhas

(`orders/data.ts`, 1017 linhas, é o terceiro maior, mas já é data module puro e tem split por subdomínio próprio — **fora de escopo**, decisão confirmada com o usuário em 2026-06-18.)

Isso prejudica navegabilidade e impede testes unitários dos helpers puros. O objetivo é aplicar o padrão de 3 camadas já consolidado em `stock/` — **sem nenhuma mudança de comportamento**.

## Causa raiz do bloqueio anterior

A tentativa anterior (plano 028 original) deixava re-export shims no `actions.ts`:

```ts
export type { ToolSort } from "./data";
export { fetchToolsPage } from "./data";
```

Num arquivo `"use server"`, o Next.js exige que **todo export em runtime seja async function**. Re-exportar tipo/const/função de outro módulo dispara `Only async functions are allowed to be exported in a "use server" file`. **`check-types`, lint e test não pegam** — só `bun run build`. Isso já está documentado em `apps/web/CLAUDE.md` (seção "Smoke run-time") e é a razão de `bun run build` ser gate obrigatório aqui.

## Estratégia: 3 camadas (padrão canônico `stock/`)

Cada feature passa a ter três arquivos:

| Arquivo | Diretiva | Conteúdo | Restrição de export |
|---|---|---|---|
| `actions.ts` | `"use server"` | mutations + thin wrappers de read (com guard) | **só async fns** |
| `data.ts` | `import "server-only"` | reads + tipos públicos + query builders | livre (tipos/const ok) |
| `_lib/*-query-helpers.ts` | nenhuma | helpers puros (sem DB nem auth) | livre |

**Por que `server-only` e não `"use server"` no `data.ts`:** `server-only` não tem a restrição "só async exports", então tipos e builders convivem sem quebrar o build, e ainda barra import acidental no Client Component (arrastaria o driver `pg` pro bundle). É o que torna a abordagem à prova do incidente anterior.

**Sem shim.** Os consumers passam a importar de `./data` (tipos/reads server-side) ou do wrapper Action (reads chamados do client). Alinhado a `apps/web/CLAUDE.md` ("não deixe re-export shim no `actions.ts`") e ADR-0018.

### Guard dos reads (ADR-0018)

Funções em `data.ts` são read puro guardado pelo caller (não são endpoints). O caso especial é `fetchToolsPage`: hoje chama `requireCapability("tools.read")` inline **e** é consumido por um Client Component (`tools-infinite.tsx`, `"use client"`). Solução = padrão `fetchLedgerPageAction` (canônico em `stock/movements/actions.ts`):

- `fetchToolsPage` move para `data.ts` **sem** o guard inline;
- novo `fetchToolsPageAction` (`"use server"` em `actions.ts`) faz `requireCapability("tools.read")` e delega ao `data.ts`. O Client Component importa o **Action**;
- `tools/page.tsx` (Server Component, já com `requireCapabilityOrRedirect` na linha 63) importa `fetchToolsPage` direto de `./data`.

Resultado: guard preservado nos dois caminhos, comportamento idêntico.

## Escopo

### Tools

**Cria `tools/_lib/tool-query-helpers.ts`** (puro, sem diretiva): `toNumericString`, `toInt`, `nullableText`, `normalizeToolPayload`, `normalizeVariantValues`, `attributeValueRow`.

> **Drift vs. plano original:** `errorMessage` **não existe mais** em `tools/actions.ts` — a audit (commit pós-`79379ef5`) substituiu por `actionErrorMessage` de `@/lib/action-error`, e o plano 026 moveu a captura de vídeo pra dentro da transação de `updateTool`. O plano de implementação deve re-derivar as linhas contra o HEAD atual, não confiar nos números do plano 028 original.

**Cria `tools/data.ts`** (`import "server-only"`): tipos `ToolSort` / `ToolsListMode` / `ToolsFiltersInput` / `ToolPageRow`; `fetchDefinitionsBySlug`, `primaryCategoryIncompleteError`, `currentPrimaryCategoryId`, `buildToolsWhereClause`, `buildToolsNextCursor`, `fetchToolsPage` (sem guard inline).

**Enxuga `tools/actions.ts`** (`"use server"`): mantém `createTool`, `updateTool`, `deleteTool`, `updateToolVariant`, `setDefaultToolVariant`, `setVariantVisibility`, `deleteToolVariant` + **novo** `fetchToolsPageAction`.

**Consumers a atualizar (sem shim):**
- `tools/_components/tools-infinite.tsx` (client): `fetchToolsPage` → `fetchToolsPageAction`
- `tools/page.tsx`: tipos + `fetchToolsPage` passam a vir de `./data`
- Demais callers de mutations (`delete-tool-dialog`, `delete-variant-dialog`, `tool-submit`, `variants-tab`) continuam importando de `./actions` — sem mudança.

### Promotions

Mesma estrutura.

**Cria `promotions/_lib/promotion-query-helpers.ts`** (puro / tx-scoped): `dbErrorMessage` (usa `logger`), `safeRequireRole`, `conflict`, `buildCouponFields`, `computeStatus`, `promotionStatusCondition`, `makePromotionCursor`, `assertTitleUnique`, `assertCodeUnique`, `assertFeaturedSlotFree` (recebem `Tx`). Nenhum chama `requireCapability`/`requireCurrentSession`.

**Cria `promotions/data.ts`** (`import "server-only"`): tipos públicos (`PromotionStatus`, `PromotionStatusCounts`, `PromotionToolItem`, `PromotionListItem`, `PromotionDetail`, `PromotionSort`, `ListPromotionsOptions`); reads `fetchPromotionsPage`, `getPromotion`, `getPromotionStatusCounts`, `getToolOptions`, `countToolsWithActivePromotion`.

**Enxuga `promotions/actions.ts`** (`"use server"`): mantém `createPromotion`, `updatePromotion`, `deletePromotion`, `togglePromotionActive`, `duplicatePromotion` + wrappers `"use server"` para os reads que são chamados de Client Components.

**Consumers a atualizar:** ~17 arquivos que importam tipos/reads de `../actions` passam a importar de `../data` (tipos) ou do wrapper Action (reads chamados do client). Diff mecânico, maior volume da tarefa. A tabela de callers em `plans/028-split-god-module-actions.md:111-128` serve de checklist (re-derivar contra HEAD).

### Fora de escopo

- `orders/data.ts` e `orders/actions.ts` — não tocar.
- Qualquer mudança de lógica/comportamento — é move puro.
- Assinaturas públicas de tipos/funções (só muda o caminho de import).

## Testes (escrever ANTES de mover)

Rede de segurança characterization, com o código no lugar atual (export temporário do helper), verde, **depois** mover:

- `tools/_components/__tests__/tool-query-helpers.test.ts` — `attributeValueRow`: text (não-vazio → `valueText`; vazio/whitespace → `null`), boolean `true`, number (`NaN` → `null`; válido → `valueNumeric`), numeric_range (ambos setados; `NaN` min → `null`). ~8 casos. Modelar em `tools/_components/__tests__/variant-deletion.test.ts` (puro, sem mock).
- `promotions/_lib/__tests__/promotion-query-helpers.test.ts` — `computeStatus`: expired, scheduled, active, inactive. ~4 casos.

## Ordem de execução + gate

1. Testes characterization → `bun --cwd apps/web test` verde.
2. **Tools:** `_lib` → `data.ts` → enxuga `actions.ts` (+ `fetchToolsPageAction`) → atualiza consumers → `bun run build` → commit (`refactor: extrair reads/helpers de tools/actions em data/_lib`).
3. **Promotions:** idem → `bun run build` → commit (`refactor: extrair reads/helpers de promotions/actions em data/_lib`).
4. Gate final: `bun verify` (check-types + check + test) **+ `bun run --cwd apps/web build`** (pega o erro de `"use server"`) **+ `bun guard:forms`**.
5. Smoke visual (`bun dev:web`, porta 3001): `/dashboard/tools` (lista + scroll infinito + editar tool salva) e `/dashboard/promotions` (lista + detalhe/edit). `nextjs_call <port> get_errors` para runtime errors.
6. Atualizar status do plano em `plans/README.md` (028 → DONE).

## STOP conditions

- Circular import `data.ts` ↔ `actions.ts`.
- Helper planejado como "puro" que na verdade chama `requireCapability`/`requireCurrentSession` — fica no `actions.ts`.
- Tipo `Tx` do Drizzle não derivável sem instância live de `db` — manter os `assert*` no `actions.ts` e ajustar a fronteira.
- Qualquer arquivo fora de `tools/` ou `promotions/` precisando mudar.
- `bun run build` falhando após um fix razoável — parar e reportar.

## Done criteria

- `bun check-types`, `bun check`, `bun guard:forms`, `bun --cwd apps/web test` → exit 0.
- `bun run --cwd apps/web build` → exit 0 (gate decisivo).
- `tools/data.ts`, `tools/_lib/tool-query-helpers.ts`, `promotions/data.ts`, `promotions/_lib/promotion-query-helpers.ts` existem.
- `tools/actions.ts` e `promotions/actions.ts` < 400 linhas cada.
- Novos arquivos de teste existem e passam.
- `grep "requireCapability\|requireCurrentSession"` nos dois `_lib` → vazio (puros).
- Nenhum re-export shim em `actions.ts` (sem `export ... from "./data"`).
- `plans/README.md` 028 → DONE.

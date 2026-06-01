# Unificar `ACTIVE_REFUND_STATUSES` como fonte única — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar a duplicação da lista de status ativos de refund, derivando o índice parcial do dashboard e o array do ecommerce de uma única constante em `@emach/db`.

**Architecture:** A constante `ACTIVE_REFUND_STATUSES` nasce em `packages/db/src/schema/orders.ts` (dentro da superfície de sync). O `WHERE` do índice parcial `refund_request_one_open_per_order` deriva dela. O ecommerce, que já importa tipos desse módulo, passa a re-exportar a constante em vez de declarar um array local. Refactor de código puro — `drizzle-kit push` não faz diff de `WHERE` e o índice já está correto no DB (#91), então não há mudança no banco.

**Tech Stack:** Drizzle ORM 0.45.2, drizzle-kit 0.31.8, TypeScript, Turborepo, Bun. Dois repos: `emach-dashboard` (origem) e `emach-ecommerce` (consumidor via CI sync).

**Spec:** `docs/superpowers/specs/2026-06-01-active-refund-statuses-single-source-design.md`

> ⚠️ **TDD N/A aqui:** este é um refactor de constante + DDL de índice declarativo. Não há
> comportamento de runtime novo a testar por unit test. A verificação é `check-types` +
> inspeção do SQL gerado pelo drizzle-kit (confirmar que o índice deriva os 3 status corretos).
> Os "testes" abaixo são essas verificações concretas.

---

## File Structure

| Arquivo | Repo | Responsabilidade | Ação |
|---|---|---|---|
| `packages/db/src/schema/orders.ts` | dashboard | Define enum, tabela `refund_request`, índice parcial. Passa a definir `ACTIVE_REFUND_STATUSES` e derivar o índice dela. | Modify |
| `apps/web/src/lib/refunds/status.ts` | ecommerce | Apresentação/UI de refund. Para de declarar o array local; re-exporta de `@emach/db`. | Modify |

Nenhum arquivo novo. Nenhuma migration (push-only).

---

## Task 1: Dashboard — constante + índice derivado

**Files:**
- Modify: `packages/db/src/schema/orders.ts:47-54` (após `RefundStatus`, adicionar constante)
- Modify: `packages/db/src/schema/orders.ts:264-268` (derivar `WHERE`, remover comentário-espelho)

- [ ] **Step 1: Adicionar a constante após `RefundStatus`**

Localizar (linhas 47-54):

```ts
export const refundStatusEnum = pgEnum("refund_status", [
	"requested",
	"under_review",
	"approved",
	"refunded",
	"rejected",
]);
export type RefundStatus = (typeof refundStatusEnum.enumValues)[number];
```

Inserir logo abaixo:

```ts

// Status que contam como solicitação ATIVA de refund (não-terminal).
// Fonte única: o índice parcial refund_request_one_open_per_order (abaixo) deriva
// daqui; o ecommerce importa via @emach/db (sync CI). Ver issue #96.
export const ACTIVE_REFUND_STATUSES = [
	"requested",
	"under_review",
	"approved",
] as const satisfies readonly RefundStatus[];
```

- [ ] **Step 2: Derivar o `WHERE` do índice da constante**

Localizar (linhas 264-268):

```ts
		// 1 solicitação ATIVA por pedido (parcial: status não-terminal).
		// Espelha ACTIVE_REFUND_STATUSES do ecommerce: requested + under_review + approved.
		uniqueIndex("refund_request_one_open_per_order")
			.on(table.orderId)
			.where(sql`${table.status} IN ('requested', 'under_review', 'approved')`),
```

Substituir por (abordagem primária — `sql.join`, mantém o binding `${table.status}`):

```ts
		// 1 solicitação ATIVA por pedido (parcial: status não-terminal).
		// Predicado derivado de ACTIVE_REFUND_STATUSES — fonte única (issue #96).
		uniqueIndex("refund_request_one_open_per_order")
			.on(table.orderId)
			.where(
				sql`${table.status} IN (${sql.join(
					ACTIVE_REFUND_STATUSES.map((s) => sql`${s}`),
					sql`, `
				)})`
			),
```

`sql` já está importado no topo (`import { relations, sql } from "drizzle-orm";`).

- [ ] **Step 3: Type-check**

Run: `cd packages/db && bun check-types`
Expected: PASS (sem erros). A constante satisfaz `readonly RefundStatus[]`; o `sql.join` é API válida do drizzle-orm.

- [ ] **Step 4: Inspecionar o SQL gerado e comparar com o literal atual**

Run:
```bash
cd packages/db && bunx drizzle-kit generate --out=/tmp/drizzle-probe --name probe 2>&1 | tail -5
grep -i "refund_request_one_open_per_order" /tmp/drizzle-probe/*.sql
```
Expected: a linha do `CREATE UNIQUE INDEX ... refund_request_one_open_per_order ... WHERE "status" IN ('requested', 'under_review', 'approved')` — os **3 status** presentes na ordem da constante.

Decisão: se a lista renderizada contém exatamente `'requested', 'under_review', 'approved'` → manter a abordagem `sql.join`. Se o texto divergir de forma que importe (ex.: parametrização `$1` em vez de literal inline), trocar para `sql.raw` com texto idêntico ao original:

```ts
			.where(
				sql.raw(
					`status IN (${ACTIVE_REFUND_STATUSES.map((s) => `'${s}'`).join(", ")})`
				)
			),
```

- [ ] **Step 5: Limpar o probe**

Run: `rm -rf /tmp/drizzle-probe`
Expected: sem saída. (Não commitar nada de `src/migrations` — repo é push-only; confirmar `git status` limpo nessa pasta.)

Run: `cd packages/db && git status --short src/migrations`
Expected: vazio.

- [ ] **Step 6: Confirmar que NÃO é necessário `db:sync`**

Nota (sem comando): `drizzle-kit push` casa índice por nome + colunas e não faz diff do `WHERE` (gotcha em `packages/db/CLAUDE.md`). O índice já existe no DB com o predicado correto desde #91. A mudança é só de código-fonte; o banco não muda. **Não rodar `db:sync`.**

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "refactor(db): deriva indice de refund de ACTIVE_REFUND_STATUSES (#96)"
```

---

## Task 2: Ecommerce — re-exportar a constante

> Repo: `~/Projects/emach/emach-ecommerce`. Esta task depende de a constante existir na cópia
> de `@emach/db` do ecommerce. Em produção isso chega via CI `sync-db-schema.yml` após o merge
> da Task 1. Para validar **localmente antes** desse merge, o Step 1 copia o `orders.ts` para a
> cópia local (sem commitar — o CI sobrescreve).

**Files:**
- Modify: `~/Projects/emach/emach-ecommerce/apps/web/src/lib/refunds/status.ts:80-84`
- Temp (não commitar): `~/Projects/emach/emach-ecommerce/packages/db/src/schema/orders.ts`

- [ ] **Step 1: Copiar o `orders.ts` atualizado para a cópia local do ecommerce (validação)**

Run:
```bash
cp /home/othavio/Projects/emach/emach-dashboard-3/emach-dashboard/packages/db/src/schema/orders.ts \
   /home/othavio/Projects/emach/emach-ecommerce/packages/db/src/schema/orders.ts
```
Expected: sem saída. Isto simula localmente o que o CI sync fará.

- [ ] **Step 2: Trocar o array local pelo re-export**

Localizar em `~/Projects/emach/emach-ecommerce/apps/web/src/lib/refunds/status.ts` (linhas 79-84):

```ts
// Status que contam como "solicitação ativa" — bloqueiam nova solicitação.
export const ACTIVE_REFUND_STATUSES = [
	"requested",
	"under_review",
	"approved",
] as const satisfies readonly RefundStatus[];
```

Substituir por:

```ts
// Status que contam como "solicitação ativa" — bloqueiam nova solicitação.
// Fonte única em @emach/db (issue #96); sincronizado por CI.
export { ACTIVE_REFUND_STATUSES } from "@emach/db/schema/orders";
```

Manter `isActiveRefund` (linhas 86-88) inalterado — ele referencia a constante re-exportada via escopo do módulo. Verificar que o import de tipos no topo (`import type { RefundReason, RefundStatus } from "@emach/db/schema/orders";`) permanece.

- [ ] **Step 3: Type-check do ecommerce**

Run: `cd /home/othavio/Projects/emach/emach-ecommerce && bun check-types`
Expected: PASS. O re-export resolve da cópia local atualizada (Step 1); `refunds.ts:71` (`inArray(refundRequest.status, [...ACTIVE_REFUND_STATUSES])`) continua válido pois a constante mantém o tipo `readonly RefundStatus[]`.

- [ ] **Step 4: Reverter a cópia temporária do `orders.ts`**

Run:
```bash
cd /home/othavio/Projects/emach/emach-ecommerce && git checkout -- packages/db/src/schema/orders.ts
git status --short packages/db
```
Expected: `packages/db` limpo. A versão real chegará pelo PR do CI sync; não devemos commitar a cópia manual.

- [ ] **Step 5: Commit no ecommerce**

```bash
cd /home/othavio/Projects/emach/emach-ecommerce
git add apps/web/src/lib/refunds/status.ts
git commit -m "refactor(refunds): importa ACTIVE_REFUND_STATUSES de @emach/db (#96)"
```

> ⚠️ **Deploy:** este commit do ecommerce só compila em CI **depois** que o PR de sync (gerado
> pelo merge da Task 1 na `main` do dashboard) tiver mergeado no ecommerce. Não mergear o PR
> do ecommerce antes do PR de sync.

---

## Self-Review

**1. Spec coverage:**
- Spec "Dashboard 1 (constante)" → Task 1 Step 1 ✅
- Spec "Dashboard 2 (derivar índice + SQL idêntico)" → Task 1 Steps 2,4 ✅
- Spec "Dashboard 3 (remover comentário-espelho)" → Task 1 Step 2 (comentário substituído) ✅
- Spec "Ecommerce 4 (re-export, isActiveRefund local)" → Task 2 Step 2 ✅
- Spec "Sem migration / db:sync" → Task 1 Step 6 ✅
- Spec "Ordem de deploy" → nota no fim da Task 2 ✅
- Spec "Validação local copiando orders.ts" → Task 2 Steps 1,4 ✅

**2. Placeholder scan:** Sem TBD/TODO. A "decisão" no Step 4 da Task 1 é uma ramificação de verificação concreta (com código para ambos os caminhos), não placeholder.

**3. Type consistency:** `ACTIVE_REFUND_STATUSES` tipada como `readonly RefundStatus[]` em ambos os repos; consumidor `inArray([...ACTIVE_REFUND_STATUSES])` compatível; `sql` já importado. Nome do índice `refund_request_one_open_per_order` consistente.

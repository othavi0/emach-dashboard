# 052 — Branch-scoping completo nas leituras de estoque

> **Status:** TODO (deferido da rodada de auditoria 2026-06-19 / PR #228)
> **Origem:** review CodeRabbit no PR #228 (comentários em `movements-data.ts`, `tool-activity-data.ts`). Triado como **gap pré-existente** — não introduzido pela rodada 038-051; por isso deferido com plano próprio em vez de fix inline.
> **Depende de:** uma **decisão de produto** (ver "Pergunta de produto") antes de implementar.
> Planned at: commit `980d04eb`, 2026-06-19.

## Por que importa

ADR-0016 define que **Inventory (estoque) é filial-scoped**: `admin`/`user` só devem ver dados das filiais no seu `user_branch` (fail-closed — sem vínculo, vê nada). As **mutations** de estoque já enforçam isso via `requireCapabilityWithContext("stock.adjust", { targetBranchIds })`. As **leituras**, não totalmente:

- Reads `toolId`-scoped retornam movimentos/atividade de **todas as filiais**, então um admin de uma filial vê atividade de filiais fora do seu escopo no detalhe da tool.
- Alguns reads branch-targeted em `movements-data.ts` guardam só com `requireCurrentSession` (autenticação), não `requireCapability` — quando chamados **direto por um Server Component** (não pelo wrapper, que já foi corrigido em #228/980d04eb), não validam nem capability nem escopo do `branchId` pedido.

Não é um vazamento anônimo (exige sessão de dashboard válida), mas é uma violação do modelo branch-scoped: dado de filial cruzando escopo entre admins.

## Estado atual (commit `980d04eb`)

`apps/web/src/app/dashboard/stock/` — guards por função:

| Função | Arquivo:linha | Guard | Filtro de filial |
| --- | --- | --- | --- |
| `getStockMovements(toolId)` | `movements-data.ts:163` | `requireCapability("stock.read")` ✓ | **nenhum** (todas filiais) |
| `getStockMovementsByVariantBranch(variantId, branchId)` | `movements-data.ts:197` | só `requireCurrentSession` ⚠️ | filtra por `branchId` **não-validado vs escopo** |
| `fetchVariantBranchMovementsPage(variantId, branchId, …)` | `movements-data.ts:237` | só `requireCurrentSession` ⚠️ | idem |
| `getReservedQtyByVariantBranch(variantId, branchId)` | `movements-data.ts:286` | só `requireCurrentSession` ⚠️ | idem |
| `getToolActivity(toolId)` | `tool-activity-data.ts:47` | `requireCapability("stock.read")` ✓ | **nenhum** (todas filiais) |
| `fetchToolActivityPage(filters)` | `tool-activity-data.ts:80` | `requireCapability("stock.read")` ✓ | `filters.branchId` opcional; **ausente = todas filiais** |

> **Já corrigido em #228 (não refazer):** os wrappers `"use server"` em `stock/actions.ts` (`fetchVariantBranchMovementsPageAction`, `getReservedQtyByVariantBranchAction`, `fetchToolActivityPageAction`, `fetchBranchStockPageAction`) já ganharam guard de capability no boundary (`requireCapabilityWithContext` p/ branch-targeted). Este plano cobre o caminho **direto** (Server Component → data fn) e o **filtro row-level** que o wrapper não resolve. `fetchBranchStockPage` (`branch-stock-data.ts:108`) **já** valida escopo fail-closed via `getUserBranchScope`/`inScope` — usar como exemplar.

## Referência: como o resto do código scoping faz

- **Escopo:** `getUserBranchScope(session)` (`src/lib/branch-scope.ts`) → `{kind:"all"}` (super_admin) | `{kind:"scoped", branchIds, includeUnassigned}` (admin/user). `inScope(scope, branchId)` testa pertinência.
- **Exemplar de read fail-closed:** `branch-stock-data.ts:108` `fetchBranchStockPage`:
  ```ts
  const scope = await getUserBranchScope(await requireCurrentSession());
  if (!inScope(scope, filters.branchId)) {
    return { items: [], nextCursor: null };
  }
  ```
- **Exemplar de validação branch-targeted:** mutations em `stock/actions.ts:179+` usam `requireCapabilityWithContext("stock.adjust", { targetBranchIds: [branchId] })` (lança `Forbidden` fora do escopo).

## Pergunta de produto (resolver ANTES de implementar)

No detalhe de uma tool (`/dashboard/tools/[id]/stock`), um `admin` filial-scoped deve ver os movimentos/atividade **de todas as filiais** ou **só das suas**? ADR-0016 sugere "só das suas". Confirmar com o dono do produto — a resposta define se o filtro é `branchId IN (escopo)` (scoped) ou aberto. `super_admin` sempre vê tudo.

## Passos (após a decisão = "só as do escopo")

1. **`getStockMovements(toolId)` e `getToolActivity(toolId)`** — derivar escopo e adicionar predicado:
   - `const session = await requireCapability("stock.read");`
   - `const scope = await getUserBranchScope(session);`
   - `if (scope.kind === "scoped" && scope.branchIds.length === 0) return [];`
   - WHERE: quando `scope.kind === "scoped"`, `and(eq(toolVariant.toolId, toolId), inArray(stockMovement.branchId, scope.branchIds))`; quando `"all"`, sem o `inArray`.
   - Atenção a `includeUnassigned` (NULL branch) — replicar o tratamento de `inScope`/`branchAndFilter` (ver `tools/data.ts`) p/ consistência.
2. **`fetchToolActivityPage(filters)`** — quando `filters.branchId` ausente, aplicar o mesmo filtro de escopo; quando presente, ele já vem validado pelo wrapper (mas o Server Component pode chamar direto — validar `inScope` aqui também, fail-closed).
3. **Data fns com só `requireCurrentSession`** (`getStockMovementsByVariantBranch`, `fetchVariantBranchMovementsPage`, `getReservedQtyByVariantBranch`) — trocar por `requireCapabilityWithContext("stock.read", { targetBranchIds: [branchId] })` (capability + valida `branchId ∈ escopo`). Isso cobre o caminho de chamada direta por Server Component, alinhando com o que o wrapper já faz.
4. **Testes** — espelhar `tools/data.ts` tests (mock de `getUserBranchScope`): caso `scoped` filtra; caso `scoped`-vazio retorna `[]`; caso `all` não filtra; `branchId` fora do escopo → `Forbidden`/empty conforme a função.

## Critérios de pronto (machine-checkable)

- `bun check-types` ✓ · `bun check` ✓ · `bun --cwd apps/web test` ✓ · `bun run --cwd apps/web build` ✓.
- Smoke: logar como admin scoped a 1 filial, abrir `/dashboard/tools/[id]/stock` de uma tool com movimento em outra filial → não aparece. Como super_admin → aparece tudo.

## STOP / escape hatches

- Se a decisão de produto for "admin vê todas as filiais no detalhe da tool" → **só** o passo 3 (capability nas data fns branch-targeted) se aplica; passos 1-2 viram no-op. Documentar a decisão num ADR e fechar.
- Se o filtro de escopo quebrar alguma view que legitimamente agrega cross-filial (ex: relatório global só de super_admin) → confirmar que essa view usa `super_admin`/`{kind:"all"}` e não cai no ramo scoped.

## Não relacionado (não tocar)

- Paginação de `movements-data.ts` p/ `paginate()` — é o `NOTE(045)` deferido (cursor incompatível), assunto separado.
- O cap silencioso de `sort === "urgency"` em `branch-stock-data.ts:181` (carrega só `BATCH_SIZE` urgentes, sem cursor) é **intencional e comentado** — se virar problema de produto (>20 itens urgentes), é melhoria à parte (paginação por offset no urgency), não parte deste plano.

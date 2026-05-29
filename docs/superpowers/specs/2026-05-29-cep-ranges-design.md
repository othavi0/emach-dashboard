# CRUD de faixas de CEP por filial (`cep_ranges`)

**Data:** 2026-05-29
**Issue:** #76
**Goal:** Permitir editar, no painel, as faixas de CEP que cada filial atende, e expor a lógica de match num helper compartilhado com o ecommerce (ADR-0009).

---

## Contexto / por que

A coluna `branch.cep_ranges` (jsonb, nullable) existe mas hoje está sempre `NULL` e **não há UI** pra editá-la. Investigação (2026-05-29) mostrou que **boa parte do #76 já foi implementada** durante a limpeza de mock data:

| Item da issue | Estado antes deste trabalho |
|---|---|
| Formato JSON | Já tipado como `Array<{ from: string; to: string }>` em `inventory.ts` |
| Zod | `cepRangeSchema` + `branchSchema.cepRanges` (max 20) em `branch-schema.ts` |
| Server action | `createBranch`/`updateBranch` já persistem `cepRanges` |
| Data layer | `branches/data.ts` já retorna `cepRanges` |
| Lookup | `suggestBranchForCep()` em `apps/web/.../orders/_lib/branch-suggestion.ts`, usado no `order-actions-panel` |

**O que de fato falta:** a UI de edição (o form **descarta** `cepRanges` em `buildInitial`), exibição read-only, validações intra-filial, e mover o lookup pra superfície de sync.

### Modelo de negócio (decisão de produto)

Hoje **não há roteamento automático por CEP**: todo pedido chega para todas as filiais, e a primeira que "pega" o pedido pendente fica com ele. Logo `cep_ranges` / `getBranchByCep` é uma **sugestão não-autoritativa** (já é assim no `order-actions-panel`, que só *sugere* uma filial). Consequências de design:

- Sobreposição de faixas **entre filiais não importa** — sem checagem cross-branch.
- O helper compartilhado é mantido mesmo assim, pra habilitar roteamento real no futuro sem retrabalho.

---

## Decisões (brainstorming 2026-05-29)

1. **Campo `label` opcional** por faixa — `{ from, to, label? }`. Documenta a região (ex: "SP capital zona oeste").
2. **Lookup compartilhado** vive em `packages/db/src/queries/branch-cep.ts` (superfície de sync), com a função pura de match **e** uma query DB de conveniência. Single source.
3. **Sobreposição:** intra-filial = erro duro (`from ≤ to`, sem auto-overlap); **cross-branch = não checa** (cortado por YAGNI — não importa neste modelo).
4. **UI:** seção nova no form da filial (não tab dedicada) — edita junto com o resto, um único save.

---

## Design

### 1. Modelo de dados

`packages/db/src/schema/inventory.ts`:

```ts
cepRanges: jsonb("cep_ranges").$type<Array<{ from: string; to: string; label?: string }>>(),
```

Adicionar `label?`. Como a coluna é `jsonb`, é mudança **só no tipo TypeScript** — `bun db:sync` não gera ALTER estrutural. Mas o arquivo está na superfície de sync (`schema/`) → o CI abre PR automático pro ecommerce (ADR-0009).

CEPs persistidos como **8 dígitos sem máscara**, consistente com `branch.cep` (já normalizado por Zod transform).

### 2. Validação — `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`

`cepRangeSchema` passa a:

- `from` / `to`: transformar pra dígitos (`replace(/\D/g, "")`) e validar `^\d{8}$`.
- `label`: `z.string().trim().max(60).optional().transform((v) => (v ? v : undefined))`.
- Refine **por faixa**: `from ≤ to` (comparação lexicográfica de 8 dígitos é equivalente à numérica). Mensagem: "CEP inicial deve ser ≤ final".

`branchSchema` ganha refine **no array** `cepRanges`: nenhuma faixa se sobrepõe a outra **da mesma filial** (auto-overlap). Mensagem: "Faixas de CEP não podem se sobrepor". `path: ["cepRanges"]`.

`cepRanges: z.array(cepRangeSchema).max(20).optional().nullable()` permanece.

### 3. Lookup compartilhado — `packages/db/src/queries/branch-cep.ts` (novo)

```ts
import { type SQL, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type CepRange = { from: string; to: string; label?: string };

export interface BranchWithCepRanges {
  cepRanges: CepRange[] | null | undefined;
  id: string;
}

export function normalizeCep(raw: string | null | undefined): string | null;

/** First-match-wins na ordem do array. Documentar pra quem configura. */
export function matchBranchByCep(
  cep: string,
  branches: BranchWithCepRanges[]
): string | null;

/** Conveniência: consulta filiais ativas com faixas e roda o match. */
export async function getBranchByCep(
  db: NodePgDatabase<Record<string, unknown>>,
  cep: string
): Promise<{ id: string; name: string } | null>;
```

- A lógica pura (`normalizeCep`, `matchBranchByCep`) é **movida** de `apps/web/src/app/dashboard/orders/_lib/branch-suggestion.ts`. O arquivo antigo é **deletado**.
- `order-actions-panel.tsx` troca o import pra `@emach/db/queries/branch-cep` (usa `matchBranchByCep` com as branches já carregadas no client).
- `getBranchByCep` segue a convenção `queries/` (param `db`, sem singleton; sem `select *`). Consulta `branch` (status `active`, `cepRanges` não-nulo) e delega ao `matchBranchByCep`.
- **Superfície de sync:** o arquivo só importa `drizzle-orm` e `schema/inventory` (ambos isomórficos, sem `server-only`) — seguro importar `matchBranchByCep` no client component do order-panel, e não viola a regra do ADR-0009 (incidente #88).

### 4. UI — seção no form da filial

Novo componente `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx`:

- Renderiza a lista de faixas de `values.cepRanges`. Cada linha: `label` (Input texto, opcional) + `from` + `to` (CepInput mascarado) + botão remover.
- Botão "+ adicionar faixa" (desabilita ao atingir 20). Faixa nova = `{ from: "", to: "", label: "" }`.
- `onChange` chama `onPatch({ cepRanges: next })`.

`branch-form-fields.tsx`: adiciona a seção **"Faixas de CEP atendidas"** depois de Endereço, antes de Equipe, renderizando `<CepRangesEditor>`.

`branch-form.tsx`:
- `buildInitial` passa a mapear `cepRanges: d.cepRanges ?? []` (hoje **descarta**).
- `FIELD_LABELS` ganha `cepRanges: "Faixas de CEP"` (pro `FormErrorPanel`).

### 5. Exibição read-only — `branches/[id]/_components/overview-tab.tsx`

Quando `detail.cepRanges` tem itens, mostra uma lista compacta na visão geral: cada faixa como `label — 01000-000 a 05999-999` (CEP formatado via `formatCep`). Sem faixas → não renderiza a seção.

### 6. Sync + documentação

- Mudanças em `schema/inventory.ts` + `queries/branch-cep.ts` → CI abre PR de sync pro ecommerce (automático).
- `docs/integration/admin-ecommerce.md`: nova linha documentando o contrato de `cep_ranges` — formato `{ from, to, label? }` (8 dígitos), semântica de `getBranchByCep` (first-match-wins, **sugestão não-autoritativa**), e que o ecommerce **pode** consumir pra sugerir filial. Deixar explícito que não há roteamento automático hoje.

### 7. Erros & edge cases

- `cepRanges` vazio/null → filial não atende nenhuma faixa; `matchBranchByCep` retorna `null`. Comportamento esperado.
- `from > to` → erro duro por faixa.
- Auto-overlap dentro da filial → erro duro no array.
- Máscara só no display; persistência sempre 8 dígitos.
- Faixa com `label` mas `from`/`to` vazios → barrada pelo regex `^\d{8}$`.

---

## Arquivos afetados

### `packages/db` (sincroniza pro ecommerce)
- `src/schema/inventory.ts` — `$type` ganha `label?`.
- `src/queries/branch-cep.ts` — **novo**: `normalizeCep`, `matchBranchByCep`, `getBranchByCep`, tipos.

### `apps/web` (admin)
- `branches/_components/branch-schema.ts` — `label`, refine `from≤to`, refine auto-overlap, transform pra dígitos.
- `branches/_components/cep-ranges-editor.tsx` — **novo** repeater.
- `branches/_components/branch-form-fields.tsx` — nova seção.
- `branches/_components/branch-form.tsx` — `buildInitial` mapeia `cepRanges`, `FIELD_LABELS`.
- `branches/[id]/_components/overview-tab.tsx` — exibição read-only.
- `orders/_components/order-actions-panel.tsx` — import de `matchBranchByCep`.
- `orders/_lib/branch-suggestion.ts` — **deletado** (lógica movida; não há test file hoje).

### `docs`
- `docs/integration/admin-ecommerce.md` — contrato de `cep_ranges`.

---

## Verificação

- `bun check-types` verde (dashboard).
- `bun test`: testes **novos** de `matchBranchByCep` (não existiam) + schema (from>to, auto-overlap, label opcional, normalização) passam; 1 fail pré-existente (`server-only`) inalterado.
- Smoke admin (`bun dev:web`): editar filial → adicionar/remover faixas → salvar → reabrir e ver persistido; overview-tab mostra as faixas; sugestão de filial no order-panel continua funcionando.
- `bun db:sync` sem diff estrutural (mudança é só de tipo TS sobre jsonb).

---

## Ajustes durante a execução (2026-05-29)

Descobertas que corrigiram premissas deste spec:

- **O `branch-edit-sheet.tsx` já tinha um editor de faixas inline** (sem label, sem máscara). A premissa "o form descarta `cepRanges`" valia só pro `branch-form.tsx` (criar). Consolidado: o sheet passou a usar o `CepRangesEditor` compartilhado (com label + máscara) e o editor inline antigo foi removido.
- **`CepRangesEditor` virou controlado** (sem state interno) pra refletir troca de filial / reabertura do sheet sem estado duplicado.
- **`label` é chave opcional** (`z.string().optional()`, sem transform) — em zod v4 o `.transform` forçava a chave a ser `required`, quebrando a atribuição a partir de `BranchDetail`. Empty string é omitida no editor (não persiste `""`).
- **Removida a "Zona destrutiva"** (exclusão de filial) do edit sheet a pedido — `DeleteBranchDialog` ficou órfão no código.
- **Presets:** botão "Brasil todo" + dropdown de UF (faixas aproximadas por estado em `cep-presets.ts`) pra preencher faixas rapidamente.

## Fora de escopo

- Roteamento automático de pedidos por CEP (hoje todos os pedidos vão pra todas as filiais).
- Checagem de sobreposição **entre** filiais (não importa no modelo atual).
- Consumo real de `getBranchByCep` no ecommerce (chega via sync; ativação é trabalho do outro repo).
- Validação de CEP contra base dos Correios (faixas são livres).

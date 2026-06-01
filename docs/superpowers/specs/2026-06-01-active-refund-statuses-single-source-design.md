# Unificar `ACTIVE_REFUND_STATUSES` como fonte única entre repos

> Issue #96 (origem #91). Prioridade baixa — débito de robustez, sem drift ativo.

## Problema

A lista de "status ativos de refund" (`requested`, `under_review`, `approved`) está
duplicada em dois lugares e dois repos:

- **Dashboard:** literal SQL no índice parcial `refund_request_one_open_per_order`
  (`packages/db/src/schema/orders.ts:268`): `IN ('requested', 'under_review', 'approved')`.
- **Ecommerce:** array `ACTIVE_REFUND_STATUSES` em `apps/web/src/lib/refunds/status.ts`.

Já divergiram uma vez (`approved` faltava no índice — corrigido em #91). O #91 corrigiu
o sintoma mas manteve a duplicação que causou o drift.

## Causa raiz

Duas declarações independentes da mesma regra de negócio, sem fonte única.

## Estado verificado (2026-06-01)

- O índice ainda usa o literal SQL; **não existe** constante `ACTIVE_REFUND_STATUSES`
  no dashboard — só um comentário-espelho em `orders.ts:265`.
- `refundStatusEnum`: `requested`, `under_review`, `approved`, `refunded`, `rejected`.
  Ativos (não-terminais) = os 3 primeiros.
- Dashboard **não tem consumidor** da lista além do índice.
- Ecommerce: `status.ts` já importa tipos de `@emach/db/schema/orders`; a constante tem
  1 consumidor — `refunds.ts:71` (`inArray(refundRequest.status, [...ACTIVE_REFUND_STATUSES])`).
- `status.ts` (ecommerce) **não** está na superfície de sync; só `packages/db` é sincronizado.

## Arquitetura da solução

Fonte única = `packages/db/src/schema/orders.ts`. Tudo deriva dela: o `WHERE` do índice
(mesmo arquivo) e o ecommerce (via import de `@emach/db` sincronizado por CI).

A constante fica **dentro** da superfície de sync (`schema/`), respeitando a restrição
do incidente #88 (arquivo sincronizado não pode importar de fora da superfície).

## Mudanças

### Dashboard (origem)

1. Adicionar em `schema/orders.ts`, após `RefundStatus`:
   ```ts
   // Status que contam como solicitação ATIVA de refund (não-terminal).
   // Fonte única: índice parcial refund_request_one_open_per_order deriva daqui;
   // ecommerce importa via @emach/db (sync CI). Ver issue #96.
   export const ACTIVE_REFUND_STATUSES = [
       "requested",
       "under_review",
       "approved",
   ] as const satisfies readonly RefundStatus[];
   ```
2. Derivar o `WHERE` do índice (`orders.ts:268`) da constante, substituindo o literal.
   Verificar que o SQL gerado é **idêntico** ao atual antes de fechar (inspeção via
   drizzle-kit). Decisão de técnica (`sql.join` interpolado vs `sql.raw` a partir do
   array) tomada na implementação, escolhendo a que gera texto idêntico.
3. Remover o comentário-espelho redundante de `orders.ts:265` (substituído pela doc da
   constante).

### Ecommerce (coordenação)

4. Em `apps/web/src/lib/refunds/status.ts`, trocar a definição local do array por:
   ```ts
   export { ACTIVE_REFUND_STATUSES } from "@emach/db/schema/orders";
   ```
   `isActiveRefund` permanece local (helper de UI, fora do escopo do issue; já deriva
   da constante re-exportada). Consumidor `refunds.ts:71` não muda.

## Por que nenhuma migration / `db:sync`

`drizzle-kit push` casa índice por nome + colunas e **não faz diff do `WHERE`**
(gotcha documentado em `packages/db/CLAUDE.md`). O índice já existe no DB com o
predicado correto desde #91. Como o SQL gerado permanece equivalente, é refactor de
código puro — nenhuma alteração no banco.

## Ordem de deploy (dependência cross-repo)

O ecommerce só compila com o re-export depois que a constante existir no `@emach/db`
dele. Sequência obrigatória:

1. Merge no dashboard `main` → CI `sync-db-schema.yml` abre PR no ecommerce atualizando
   a cópia de `@emach/db`.
2. Merge do PR de sync no ecommerce.
3. Só então o PR do `status.ts` (re-export) passa o `check-types` no ecommerce.

## Verificação

- **Dashboard:** `bun check-types`; confirmar SQL gerado do índice idêntico ao literal atual.
- **Ecommerce:** validação local antes do merge — copiar o `orders.ts` atualizado para a
  cópia local de `@emach/db` do ecommerce, rodar `bun check-types` (prova que o re-export
  resolve e `inArray([...ACTIVE_REFUND_STATUSES])` continua válido). **Não commitar** essa
  cópia — o CI a sobrescreve.

## Fora de escopo (YAGNI)

- Não mover `isActiveRefund`, badges, tabs nem reason labels (UI ecommerce-owned).
- Não versionar migration / baseline.

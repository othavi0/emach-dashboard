# Índice de orders — branch+status+created + limpeza de redundante

**Data:** 2026-06-18
**Escopo:** higiene de índices na tabela `order` (preventivo, escala milhares/ano).

## Contexto

A rota `/dashboard/orders` é `force-dynamic` e roda, por render, a lista de pedidos
e os counts por status. Após o trabalho de perf (commit `465f30b5`: counts em
`GROUP BY` + cache por filial, remoção de get-session redundante), restou a parte
de índices do plano original (#4).

Volume atual: ~12 pedidos. Horizonte projetado: **milhares/ano** (loja pequena-média).
A esse volume seqscan ainda é rápido; o índice composto é **higiene preventiva de
baixo custo**, cujo ganho só se materializa com crescimento — não é mensurável hoje
(`EXPLAIN` vai de seqscan).

## Estado atual dos índices de `order`

| Índice | Colunas |
|---|---|
| `order_pkey` | `(id)` |
| `order_number_unique` | `(number)` UNIQUE — de `.unique()` na coluna |
| `order_number_idx` | `(number)` — **redundante** com o unique |
| `order_client_id_idx` | `(client_id)` |
| `order_branch_id_idx` | `(branch_id)` |
| `order_status_created_idx` | `(status, created_at DESC NULLS LAST)` |

## Queries dominantes

- **Lista admin filial-scoped:** `WHERE branch_id IN (…) AND status IN (…) ORDER BY created_at DESC LIMIT 21`
- **Counts (pós-refactor):** `WHERE branch_id IN (…) GROUP BY status`
- **super_admin:** `WHERE status IN (…) ORDER BY created_at DESC` → já coberto por `order_status_created_idx`.
- **Busca textual:** `o.number ILIKE '%q%' OR c.name ILIKE '%q%'` → seqscan (curinga inicial). **Fora de escopo** (ver Decisões).

## Mudanças (2)

Em `packages/db/src/schema/orders.ts`, array de índices da tabela `order`:

1. **Remover** `index("order_number_idx").on(table.number)` — o `.unique()` em
   `number` (`order_number_unique`) já cobre todo lookup por número.
2. **Adicionar** `index("order_branch_status_created_idx").on(table.branchId, table.status, table.createdAt.desc())`
   — serve a lista admin filial-scoped **e** os counts por status numa só estrutura.

## Aplicação no banco

Schema TS é a fonte de verdade (push-only, ADR-0006). O **drop** de índice trava o
`drizzle-kit push` sem TTY; o caminho canônico (gotcha em `packages/db/CLAUDE.md`) é:

1. Editar o schema TS (as 2 mudanças acima).
2. Aplicar o DDL direto no banco — `DROP INDEX order_number_idx;` +
   `CREATE INDEX order_branch_status_created_idx ON "order" (branch_id, status, created_at DESC);`
   — deixando schema≡banco (um `db:push` posterior é no-op).

⚠️ É mudança no **banco de produção compartilhado**; o schema TS sincroniza pro
ecommerce via CI (`sync-db-schema.yml`, ADR-0009). Não-destrutivo (índice), mas
requer OK explícito no momento de executar. `CREATE INDEX` em 12 linhas é instantâneo
(sem necessidade de `CONCURRENTLY` nesse volume).

## Verificação

`SELECT indexname FROM pg_indexes WHERE tablename = 'order'` confirma
`order_branch_status_created_idx` presente e `order_number_idx` ausente.
`EXPLAIN` não mostrará ganho a 12 linhas (esperado) — o índice é preventivo.

## Decisões / fora de escopo

- **pg_trgm (busca `ILIKE`): fora.** A milhares/ano o seqscan da busca é sub-ms;
  extensão + 2 índices GIN (`order.number`, `client.name`) é otimização prematura.
  Reavaliar quando a busca ficar lenta ou o volume passar a dezenas de milhares.
- **Sem índice extra dedicado a counts** (`(branch_id, status)`): o composto
  `(branch_id, status, created_at DESC)` já serve os counts pelo prefixo `branch_id, status`.

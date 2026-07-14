# Plans — backlog pendente

> Limpeza 2026-07-13: as 3 rodadas de auditoria de 2026-06 (perf 001-011,
> standard 012-037, arquitetura 038-052) foram executadas e os planos terminais
> removidos da working tree (histórico completo, com índice de status e hashes
> de commit, no git: `git show 53f94b46:plans/README.md` ou anteriores).

Restam só os planos **genuinamente pendentes** — sem ADR, sem código, aguardando
decisão de produto:

| Plano | O que falta |
| ----- | ----------- |
| [036-reorder-point-alerts-spike.md](036-reorder-point-alerts-spike.md) | O *alerta* de reorder point (cron + email). O threshold em si já existe no schema/UI; o cron não (só `cancel-stale-orders` e `prune-cart-events` existem). |
| [037-bulk-moderation-actions-spike.md](037-bulk-moderation-actions-spike.md) | Moderação de reviews em lote (`BULK_MODERATE_LIMIT` etc.). `moderateReview` single-item já existia antes do spike. |
| [052-stock-read-branch-scoping.md](052-stock-read-branch-scoping.md) | Branch-scoping nas reads de estoque (`movements-data.ts` ainda só com `requireCurrentSession`). Bloqueado por decisão de produto. |

Ao executar um destes: remover o arquivo ao final (ou converter em issue e
remover). Planos novos de sessões superpowers vivem em `docs/superpowers/` só
enquanto o trabalho está em andamento — remover após o merge.

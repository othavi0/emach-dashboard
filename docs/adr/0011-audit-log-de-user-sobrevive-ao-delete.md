# ADR 0011 — Audit log de user sobrevive ao delete via actor snapshot

**Data:** 2026-05-26
**Status:** Aceito
**Relaciona:** preserva o invariante 4 do CONTEXT.md (toda mutação auditável tem Actor); depende de ADR-0006 (push-only).

## Contexto

`userActivityLog.actorUserId` está declarado em `packages/db/src/schema/user-activity.ts:12` com `onDelete: 'cascade'` — deletar um User apaga em cascata todo o histórico do que ele fez. Isso compromete o invariante 4 do CONTEXT.md ("toda mutação auditável tem um Actor") quando o Actor é removido: a auditoria deixa de existir junto com a pessoa.

## Decisão

Avaliamos três caminhos: (a) `restrict` (proíbe deletar quem tem atividade), (b) `set null` com snapshot do nome em `metadata`, e (c) manter cascade. Decidimos pelo (b).

O padrão de "anonimizar FKs antes do DELETE" já é usado em `apps/web/src/app/dashboard/users/actions.ts:401-420` para `stockMovement`, `orderStatusHistory`, `orderNote` e `promotion` — onde `actorType` vira `'system'` e `actorId` vira `null`. Adotar o mesmo princípio em `userActivityLog` mantém coerência arquitetural e preserva auditoria post-mortem.

`restrict` foi rejeitado porque o admin precisa poder deletar contas sem atividade relevante sem que `restrict` as transforme em "suspended pra sempre", inflando a tabela.

> **Nota histórica (premissa revista por [ADR-0013](0013-auth-convite-only.md)):** a justificativa original para rejeitar `restrict` apoiava-se no signup público (ADR-0010) — "o admin precisa deletar contas de spam que clicaram em algo trivial antes da rejeição". Com convite-only (ADR-0013) não há mais auto-cadastro nem spam, mas a decisão por `set null` **permanece válida**: deletar convidados que nunca aceitaram (ou ex-staff) ainda exige preservar a auditoria sem travar o delete.

## Consequências

- `userActivityLog.actorUserId` muda para `nullable` + `onDelete: 'set null'`. Schema push via `bun db:sync` (ADR-0006).
- `logUserActivity` passa a cachear `actorName` no `metadata` no momento do log (snapshot imutável).
- A renderização do feed exibe `metadata.actorName` quando `actorUserId IS NULL`, com sufixo "(usuário deletado)".
- `deleteUser` continua dispensando passo manual nessa tabela — a FK `set null` resolve sozinha.
- O índice `user_activity_actor_created_idx` permanece útil para "feito por" mas passa a perder registros de usuários deletados quando filtrado por actor — esse é o comportamento correto: depois do delete, o histórico migra para o feed global/target.
- Coerente com o invariante 4 do CONTEXT.md e com a regra de auditoria em `apps/web/CLAUDE.md` ("Admin user → actorType: 'user' + actorId; mutação automática → 'system' sem actorId").

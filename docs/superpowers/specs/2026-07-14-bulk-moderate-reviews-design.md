# Moderação de reviews em lote — design

> Issue: [#308](https://github.com/othavi0/emach-dashboard/issues/308).
> Origem: spike 037 (`git show 09a442c1:plans/037-bulk-moderation-actions-spike.md`).
> Este design **substitui** o spike onde os dois divergem (execução do lote,
> semântica de falha parcial, sobrescrita de nota, atualização da lista).

## Problema

`moderateReview` modera uma avaliação por vez, via página de detalhe. Triagem de
dezenas de avaliações `pending` por semana exige N ciclos de abrir-moderar-voltar.
A infraestrutura de seleção em lote (`useBulkSelection`, `SelectableItem`,
`SelectionToolbar`, `BulkActionBar`) já existe e está em uso em Clientes e Pedidos.

## Escopo

**In scope:**

- `apps/web/src/app/dashboard/reviews/schema.ts` — `bulkModerateReviewsSchema`, `BULK_MODERATE_LIMIT`
- `apps/web/src/app/dashboard/reviews/actions.ts` — `bulkModerateReviews`
- `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx` — novo
- `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx` — fiação da seleção
- `apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts` — novo
- `apps/web/src/app/dashboard/orders/actions.ts` — apenas comentário de design de `bulkAssignBranch`

**Out of scope:**

- Implementar bulk em Pedidos. Pedidos são branch-scoped e exigem
  `lockOrderAndAuthorize` por item em transações independentes — risco e
  complexidade diferentes, sem demanda registrada. Fica documentado como contrato.
- `src/components/bulk/*` e `src/lib/use-bulk-selection.ts` — infra pronta, não alterar.
- Moderação individual (`moderateReview`, `/dashboard/reviews/[id]`) — inalterada.

## Server action

`bulkModerateReviews(input): Promise<ActionResult<BulkModerateResult>>`

```ts
export interface BulkModerateResult {
  moderatedIds: string[];
  stale: number;
  succeeded: number;
}
```

Fluxo:

1. `bulkModerateReviewsSchema.safeParse(input)` — erro → `{ ok: false, error: <1ª issue> }`.
2. `await requireCapability("reviews.moderate")` — **uma única vez**, antes da query.
   Reviews são globais (sem branch-scoping); checar por item seria redundante.
3. Um único `UPDATE`:

   ```ts
   const note = moderationNote?.trim();
   const moderated = await db
     .update(review)
     .set({
       status,
       moderatedBy: session.user.id,
       moderatedAt: new Date(),
       ...(note ? { moderationNote: note } : {}),
     })
     .where(
       and(
         inArray(review.id, reviewIds),
         eq(review.status, expectedStatus) // guarda de concorrência
       )
     )
     .returning({ id: review.id });
   ```

4. `succeeded = moderated.length`; `stale = reviewIds.length - succeeded`.
5. `succeeded === 0` → `{ ok: false, error: "Nenhuma avaliação foi moderada" }`.
6. `revalidatePath("/dashboard/reviews")` uma vez.
7. `catch` → `getPgError(error)` + `logger.error("bulkModerateReviews", ...)` +
   `{ ok: false, error: "Erro ao moderar avaliações" }`.

### Decisões e porquês

- **Um `UPDATE ... IN (...) RETURNING`, não um loop de N `UPDATE`s.** O spike
  propunha `for...of` com try/catch por item. Isso não compra isolamento de
  autorização (reviews são globais), faz 50 round-trips, e — o defeito real —
  `UPDATE ... WHERE id = X` sem match **não lança erro no Drizzle**, então o
  contador de sucesso incluiria IDs inexistentes. Com `RETURNING`, as linhas
  devolvidas são a verdade: o que não voltou não foi moderado.
- **Falha parcial = ID obsoleto, não erro de banco por item.** Com uma única
  statement, os modos de falha de banco (conexão, constraint) atingem o lote
  inteiro de qualquer forma — reportar isso como "parcial" seria mentira. A única
  parcialidade real é o ID que sumiu ou mudou entre a seleção e o submit (`stale`).
- **`expectedStatus` é a guarda de concorrência (revisão do design, 2026-07-14).**
  O `WHERE` casa por `id` **e** por `status = expectedStatus`, onde `expectedStatus`
  é a aba de origem (todo card visível tem o status da aba). Sem essa condição, o
  lote sobrescreve às cegas: Admin A seleciona X na aba Pendentes para aprovar;
  antes de A confirmar, Admin B rejeita X com nota; o lote de A ainda casaria X
  (a linha não sumiu, só mudou de status) e a promoveria a `approved` — deixando
  a nota de rejeição de B órfã num registro aprovado. Com a guarda, X não casa,
  não volta no `RETURNING` e entra no `stale`. É o que este documento já prometia
  ("sumiu **ou** mudou") e a primeira implementação não entregava.
  A `moderateReview` single-item tem o mesmo buraco e **não** é corrigida aqui —
  o detalhe precisa de UX própria para o conflito ("moderada por outra pessoa
  enquanto você olhava"). Fica como issue de hardening à parte.
- **`moderationNote` só entra no `set` quando preenchida.** Aprovar em lote não
  passa nota; gravar `moderationNote: null` incondicionalmente (como no spike)
  apagaria a nota de moderação anterior das avaliações selecionadas — perda de
  dado silenciosa. `rejected`/`spam` sempre exigem nota e a sobrescrevem.
- **`BULK_MODERATE_LIMIT = 50.`** `BATCH_SIZE = 20` (`src/lib/infinite.ts`), então
  "selecionar todos os carregados" cresce de 20 em 20; 50 cobre 2 páginas cheias
  com folga e mantém a payload da server action trivial (~1,8 KB de UUIDs).

## Schema (`reviews/schema.ts`)

```ts
export const BULK_MODERATE_LIMIT = 50;

export const bulkModerateReviewsSchema = z
  .object({
    reviewIds: z
      .array(z.string().uuid())
      .min(1, "Selecione ao menos 1 avaliação")
      .max(BULK_MODERATE_LIMIT, `Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`),
    /** Status esperado das avaliações (a aba de origem) — guarda de concorrência. */
    expectedStatus: z.enum(["pending", "approved", "rejected", "spam"]),
    status: z.enum(["approved", "rejected", "spam"]),
    moderationNote: z.string().max(1000).optional(),
  })
  .superRefine(/* nota obrigatória em rejected/spam — mesma regra do single */);

export type BulkModerateReviewsInput = z.infer<typeof bulkModerateReviewsSchema>;
```

## UI

### `bulk-moderate-dialog.tsx` (novo, Client Component)

Confirma a ação e coleta a nota quando `status ∈ {rejected, spam}`.

- `useTransition` + `disabled={isPending}` — anti double-submit.
- `<FieldError>` de `@/components/field-error` para o erro da nota — **nunca** `<p>`
  cru com `text-destructive` (a regra ast-grep `raw-validation-error` falha o CI;
  roda local com `bun guard:forms`).
- Título: `"Rejeitar 8 avaliações?"`. Botão primário `destructive` em
  `rejected`/`spam`, `default` em `approved`.
- Recebe `expectedStatus` (a aba de origem) do caller e repassa à action.
- Feedback:
  - `stale === 0` → `notify.success("8 avaliações moderadas")`
  - `stale > 0` → `notify.warning("8 moderadas; 2 já haviam sido moderadas ou removidas")`
    (com a guarda de `expectedStatus`, `stale` inclui as que outra pessoa moderou
    no meio-tempo — a mensagem tem que refletir isso)
  - `ok: false` → `notify.error(result.error)` e o dialog **permanece aberto**
    (o usuário pode corrigir a nota e tentar de novo).

### `reviews-infinite.tsx` (fiação)

Segue o padrão de `customers-infinite.tsx`: `SelectionToolbar` acima do grid
(`justify-end`), `SelectableItem` em volta de cada `ReviewCard` (funciona com o
`<Link>` interno — o wrapper intercepta no capture), `BulkActionBar` quando
`sel.count > 0`.

Ações: **Aprovar** (`default`), **Rejeitar** (`secondary`), **Spam** (`destructive`).
A ação cujo status é igual ao da aba atual é omitida — aprovar na aba "Aprovadas"
não muda nada. Passa `expectedStatus={filters.tab}` ao dialog: cada aba **é** um
status, então a aba de origem é o status esperado de todo card selecionado.

**Atualização da lista após o sucesso** (o ponto que o spike errava):
`useInfiniteList` guarda `items` em `useState` e **não** ressincroniza com uma nova
prop `initialItems` — só reseta quando o `resetKey` (filtros) muda. Logo,
`revalidatePath` + `router.refresh()` sozinhos deixariam os cards moderados na tela
com o status velho. O hook expõe `removeItem(predicate)` exatamente para isso.

Cada aba **é** um status (`pending`/`approved`/`rejected`/`spam`), então todo card
visível tem o status da aba. Daí a regra completa:

- `status !== filters.tab` → `removeItem((r) => moderatedIds.includes(r.id))`
- `status === filters.tab` → nada a fazer (nenhuma mudança visual)

Depois: `sel.exit()` + `router.refresh()`. O refresh atualiza as contagens das abas
(`ReviewsFilters`, server-rendered) e faz `page.tsx` renderizar `<Empty>` se a aba
esvaziou.

## Orders — contrato documentado (sem código)

Comentário de design após `assignBranch` em `orders/actions.ts`, registrando para
a implementação futura:

- `bulkAssignBranch({ orderIds, branchId })` → mesmo formato de `ActionResult`.
- `requireCapabilityWithContext("orders.update_status", { targetBranchIds: [branchId] })`
  uma vez (acesso à filial de **destino**), **e** `lockOrderAndAuthorize` por item
  dentro de transações independentes — o `branchId` **atual** do pedido pode mudar
  entre a checagem global e a mutação (race de reatribuição). Aqui o loop é
  obrigatório, ao contrário de reviews.
- `BULK_ASSIGN_LIMIT = 20` (1 página; triagem é o caso de uso).

## Testes

`apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts`, padrão
`vi.hoisted` + `vi.mock` de `@emach/db` (referência: `__tests__/activity.test.ts`).

1. Happy path — 3 IDs, `approved` → `{ ok: true, data: { succeeded: 3, stale: 0 } }`.
2. Nota ausente em `rejected` → `ok: false` com a mensagem da nota.
3. Nota ausente em `spam` → idem.
4. Nota presente em `rejected` → `ok: true`.
5. Array vazio → `ok: false, error: "Selecione ao menos 1 avaliação"`.
6. Array com 51 itens → `ok: false` com a mensagem de limite.
7. `RETURNING` devolve menos linhas que o pedido → `stale > 0`, `ok: true`.
8. `RETURNING` devolve 0 linhas → `ok: false, error: "Nenhuma avaliação foi moderada"`.
9. `moderationNote` vazia em `approved` → o `set` **não** contém `moderationNote`.
10. Erro de banco (mock lança) → `ok: false`, `logger.error` chamado.
11. `expectedStatus` ausente → `ok: false` (Zod), sem tocar no banco.
12. `expectedStatus` presente → o `where` compõe `inArray(id)` **e** `eq(status, expectedStatus)`.

## Critérios de pronto

- [ ] `bun verify` (`check-types` + `check` + `test`) exit 0
- [ ] `bun guard:forms` exit 0
- [ ] `bun run --cwd apps/web build` exit 0 (gate obrigatório após mexer em `"use server"`)
- [ ] Smoke em `/dashboard/reviews`: selecionar → aprovar → cards somem da aba
      `pending`, contagem das abas atualiza, toast de sucesso, seleção limpa
- [ ] Smoke: rejeitar sem nota → `<FieldError>` abaixo do Textarea, sem submit
- [ ] `git diff --name-only` lista só arquivos em `dashboard/reviews/` e
      `dashboard/orders/actions.ts`

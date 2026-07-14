# Guarda de status na moderação individual de review (#313)

> Fecha o lost-update de `moderateReview`, o caminho single-item que ficou de fora
> da correção feita em `bulkModerateReviews` (#308 / PR #314).

## Problema

`moderateReview` (`apps/web/src/app/dashboard/reviews/actions.ts`) faz
`UPDATE ... WHERE id = $reviewId` incondicional: não checa o status que o
moderador tinha na tela quando decidiu.

Admin A abre `/dashboard/reviews/[id]` de uma avaliação `pending`. Antes de A
clicar em Aprovar, Admin B rejeita a mesma avaliação com a nota "conteúdo
ofensivo". O clique de A ainda casa a linha (ela não sumiu, só mudou de status)
e a promove a `approved`. A decisão de B some sem aviso.

E some literalmente: a action grava `moderationNote: moderationNote ?? null`, ou
seja, aprovar **apaga** a nota de B em vez de deixá-la órfã. O `bulk` já não faz
isso (só inclui a coluna no `SET` quando há nota); o single ainda faz.

O buraco existe em **duas** superfícies, não uma:

| Superfície                                                         | Chamada                                  |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx` | detalhe da review (Aprovar/Rejeitar/Spam) |
| `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx` | tabela de avaliações no detalhe do cliente |

Ambas renderizam o status da avaliação antes do clique — logo, ambas conseguem
informar o status esperado.

## Solução

O espelho single-item da guarda do bulk: o `WHERE` casa por `id` **e** por
`status = expectedStatus`. A avaliação que mudou de status entre o render e o
clique não casa, o `RETURNING` volta vazio, e o moderador vê um conflito em vez
de um sucesso silencioso.

### Contrato da action

`moderateReviewSchema` (`apps/web/src/app/dashboard/reviews/schema.ts`) ganha:

```ts
/** Status que a tela renderizou. Guarda de concorrência: o UPDATE só afeta a
 *  linha se ela AINDA estiver nesse status. */
expectedStatus: z.enum(["pending", "approved", "rejected", "spam"]),
```

**Obrigatório, sem default.** Opcional reabriria o buraco no primeiro caller que
esquecesse de passar; obrigatório faz o `tsc` apontar cada superfície.

`moderateReview` passa a:

```ts
const updated = await db
  .update(review)
  .set({
    status,
    moderatedBy: session.user.id,
    moderatedAt: new Date(),
    // Sem nota (caso da aprovação) → a coluna não entra no SET: aprovar não
    // apaga a nota de moderação anterior. Mesma regra de bulkModerateReviews.
    ...(note ? { moderationNote: note } : {}),
  })
  .where(and(eq(review.id, reviewId), eq(review.status, expectedStatus)))
  .returning({ id: review.id });

revalidatePath(REVIEWS_PATH);
revalidatePath(`${REVIEWS_PATH}/${reviewId}`);

if (updated.length === 0) {
  return {
    ok: false,
    error:
      "Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada.",
  };
}

return { ok: true, data: undefined };
```

`catch` → `getPgError(error)` + `logger.error("moderateReview", ...)` +
`{ ok: false, error: "Erro ao moderar avaliação" }` (espelha o bulk).

### Decisões e porquês

- **`revalidatePath` também no conflito, antes do return.** Sem isso o
  `router.refresh()` do client pode servir o estado velho que causou o conflito —
  o moderador veria a mesma tela e clicaria de novo.
- **Uma mensagem para os dois casos.** Zero linhas afetadas significa "mudou de
  status" **ou** "sumiu", e a query não distingue. A mensagem serve para ambos e
  o refresh mostra qual foi (a review some → `notFound`; mudou → novo status).
- **Nota não é apagável por aprovação.** Consequência aceita do `SET` condicional:
  limpar a textarea e aprovar preserva a nota anterior. É a semântica que o bulk
  já adotou; divergir aqui seria pior que a limitação.
- **Sem código de erro no `ActionResult`.** O contrato do projeto é
  `{ ok: false; error: string }`, sem discriminante. Em vez de alterar um tipo
  compartilhado por todo o app só para a UI distinguir conflito de erro de
  validação, as duas telas de moderação chamam `router.refresh()` em **qualquer**
  falha: o refresh é idempotente, preserva o estado do client e toda falha
  significa que a visão pode estar velha.

## UX do conflito

Toast de erro + recarga automática. Sem modal, sem banner, sem override.

```
┌─ toast ────────────────────────────────────────────┐
│ Esta avaliação já foi moderada por outra pessoa.    │
│ A tela foi atualizada.                              │
└─────────────────────────────────────────────────────┘

[ a tela recarrega ]
Status: REJEITADA            (era: Pendente)
Moderada por Maria Silva • 14/07 10:32
Nota: "conteúdo ofensivo"

Ações de moderação
[Aprovar] [Rejeitar] [Spam]   ← seguem ativas, agora sobre o status atual
```

Quem, quando e a nota **não vão no toast**: `review-detail-card.tsx` já renderiza
`moderatedByName • moderatedAt` e a `moderationNote`. Um toast nomeado custaria um
`SELECT` extra no caminho de erro e uma variante nova de `ActionResult` para
entregar, fora de lugar, a informação que o card entrega no lugar certo — e o
moderador vai olhar o card de qualquer forma, porque o próximo clique dele
depende da nota de quem chegou antes.

**Não** oferecemos "aplicar minha decisão mesmo assim": um override é o próprio
lost-update, só que consentido. Para insistir, o moderador clica de novo sobre o
estado já atualizado — aí o `expectedStatus` é o novo, a guarda casa, e a decisão
dele sobrescreve conscientemente.

### Callers

- `moderate-actions.tsx`: `expectedStatus: review.status` — o status que o Server
  Component renderizou é literalmente "o que o moderador tinha na tela".
- `customer-reviews-table.tsx`: `expectedStatus: item.status`, por linha, nos três
  caminhos (aprovar inline, rejeitar e spam via dialog de nota).
- Nos dois, o ramo `!result.ok` ganha `reloadTab()` + `router.refresh()` além do
  `notify.error(result.error)`. No `customer-reviews-table`, o dialog de nota
  fecha e limpa o campo também no conflito (a decisão pendente não faz mais
  sentido sobre o estado novo).

## Testes

Novo `apps/web/src/app/dashboard/reviews/__tests__/moderate-review.test.ts`,
espelhando `bulk-moderate.test.ts` (mesmos mocks hoisted de `@emach/db`,
`@/lib/permissions`, `@/lib/logger`, `next/cache`):

1. O `WHERE` carrega `and(eq(review.id, id), eq(review.status, expectedStatus))`.
2. Zero linhas no `RETURNING` → `{ ok: false }` com a mensagem de conflito, e
   `revalidatePath` foi chamado mesmo assim.
3. Uma linha → `{ ok: true }`.
4. Aprovar sem nota → `moderationNote` **ausente** do objeto passado ao `.set()`.
5. Rejeitar/spam sem nota → erro de validação (regra já existente, agora com
   `expectedStatus` no input).
6. `expectedStatus` ausente → Zod barra antes de tocar o banco (caller
   desatualizado). O teste do bulk já faz exatamente isso com
   `as Omit<BulkModerateReviewsInput, "expectedStatus">` — cast permitido, não é
   `as any`.

A narrow de `CustomerReviewRow.status` de `string` para `ReviewStatus` (em
`customers/data.ts`) entra junto: a query drizzle já devolve o enum, o tipo é que
alargava, e sem isso o caller não consegue passar `expectedStatus` tipado.

## Verificação

`bun verify` (check-types + check + test) cobre a lógica e as duas telas.

O smoke do conflito real (duas abas, moderar numa e clicar na outra) **escreve
numa review de produção** — o Supabase deste repo é banco único dev = prod. Antes
de rodá-lo, escolher com o usuário um registro específico e restaurar o status
original depois; se ele preferir, pular o smoke de conflito e verificar apenas o
caminho feliz da moderação.

## Fora de escopo

- Bloqueio otimista genérico (coluna `version`/`updated_at` como token) para
  outras entidades. Se aparecer um terceiro caso de lost-update, aí vale abstrair.
- Notificar o moderador que perdeu a corrida (e-mail, badge). Nada no produto hoje
  faz isso.

## Referências

- `docs/superpowers/specs/2026-07-14-bulk-moderate-reviews-design.md` — seção
  "Decisões e porquês" → `expectedStatus`, que já apontava este follow-up.
- Issue #313.

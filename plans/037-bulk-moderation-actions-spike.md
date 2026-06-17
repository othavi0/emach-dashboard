# Plan 037: [SPIKE/DESIGN] Bulk Moderation Actions — Reviews (piloto) e Orders

> **Executor instructions**: Este plano é um SPIKE/DESIGN — o entregável são
> assinaturas de actions, fiação na UI, limites e decisões abertas documentadas,
> **não** a implementação completa. Leia cada seção antes de escrever qualquer
> código. Execute os passos de verificação em cada step. Se encontrar qualquer
> condição do bloco STOP, pare e reporte — não improvise.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- \
>   apps/web/src/app/dashboard/reviews/ \
>   apps/web/src/app/dashboard/orders/actions.ts \
>   apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx \
>   apps/web/src/components/bulk/ \
>   apps/web/src/lib/use-bulk-selection.ts \
>   apps/web/src/lib/capabilities.ts
> ```
> Se qualquer arquivo listado acima mudou desde o commit `79379ef5`, compare os
> trechos de "Current state" contra o código vivo antes de prosseguir; em caso de
> divergência, trate como STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

Reviews são moderadas uma a uma via página de detalhe
(`/dashboard/reviews/[id]`). Em triagens de volume médio (dezenas de avaliações
`pending` por semana), o ciclo abrir-moderar-voltar-abrir-moderar é lento. A
infraestrutura de seleção em lote (`BulkActionBar`, `SelectableItem`,
`useBulkSelection`) já está pronta e em uso em Clientes e Pedidos; adicionar
uma ação de moderação em lote custa uma server action nova + uma entrada no
array `actions` do `BulkActionBar`. Para Pedidos, o mesmo vetor existe na
triagem (`pending` / `paid`): atribuição de filial em lote reduziria cliques
repetitivos, mas exige cuidado especial porque pedidos são branch-scoped e cada
item precisa de `lockOrderAndAuthorize` independente. Este plano define as
assinaturas, o comportamento de erro por item, os limites de lote e as decisões
em aberto, sem implementar tudo — reviews são o piloto.

## Current state

### Infraestrutura bulk existente

**`apps/web/src/components/bulk/bulk-action-bar.tsx` (L6–11)**

```ts
export interface BulkAction {
  icon?: ReactNode;
  label: string;
  run: (ids: string[]) => void;
  variant?: "default" | "destructive" | "outline" | "secondary";
}
```

A barra surge quando `sel.count > 0`; cada ação recebe `selectedIds: string[]`
via `run`. Adicionar uma ação = 1 objeto no array `actions`.

**`apps/web/src/components/bulk/selectable-item.tsx`** — wrapper de card, não
precisa de alteração.

**`apps/web/src/lib/use-bulk-selection.ts`** — hook agnóstico (`items` +
`getId`); devolve `selectedIds: string[]`, `enter/exit/clear`, etc.

### Reviews — estado atual

**`apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx`
(L17–45)** — não tem bulk: nem `useBulkSelection`, nem `SelectionToolbar`, nem
`BulkActionBar`.

```tsx
// L23–28: useInfiniteList sem seleção
const { items, hasMore, loadMore, pending, error } = useInfiniteList({
  initialItems: initial,
  initialCursor,
  fetchPage: (cursor) => fetchReviewsPage({ filters, cursor }),
  resetKey,
});
// L32–44: grid de ReviewCard sem SelectableItem
```

**`apps/web/src/app/dashboard/reviews/actions.ts` (L42–74)** — `moderateReview`
recebe 1 `reviewId` (string UUID), 1 `status`, 1 `moderationNote` opcional:

```ts
export async function moderateReview(input: ModerateReviewInput): Promise<ActionResult> {
  const session = await requireCapability("reviews.moderate"); // L53
  await db.update(review).set({ status, moderatedBy, moderatedAt, moderationNote })
    .where(eq(review.id, reviewId));
  revalidatePath(REVIEWS_PATH);           // L67
  revalidatePath(`${REVIEWS_PATH}/${reviewId}`); // L68
}
```

Sem versão em lote.

**`apps/web/src/app/dashboard/reviews/schema.ts` (L28–46)** — `moderateReviewSchema`:

```ts
export const moderateReviewSchema = z.object({
  reviewId: z.string().uuid(),
  status: z.enum(["approved", "rejected", "spam"]),
  moderationNote: z.string().max(1000).optional(),
}).superRefine(/* nota obrigatória em rejected/spam */);
```

Nota obrigatória para `rejected` e `spam`. Aprovação não exige nota.

**Capability `reviews.moderate`** confirmada em
`apps/web/src/lib/capabilities.ts` (L254–260):

```ts
"reviews.moderate": {
  group: "Clientes",
  resource: "Avaliações",
  action: "Moderar",
  description: "Aprovar/remover avaliações",
  defaultRoles: SA,  // super_admin + admin
},
```

Reviews/Clientes são **globais** (sem branch-scoping). Nenhum
`requireCapabilityWithContext` necessário.

### Orders — estado atual (para referência do design)

**`apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx` (L63–76)**
— `BulkActionBar` com 1 ação "Exportar CSV":

```tsx
{sel.count > 0 && (
  <BulkActionBar
    actions={[
      {
        label: "Exportar CSV",
        run: (ids) => { window.location.href = `/dashboard/orders/export?ids=${ids.join(",")}`; },
      },
    ]}
    onClear={sel.clear}
    selectedIds={sel.selectedIds}
  />
)}
```

**`apps/web/src/app/dashboard/orders/actions.ts` (L126–163)** —
`lockOrderAndAuthorize(tx, cap, orderId)` executa `SELECT ... FOR UPDATE` +
capability check com `targetBranchIds`. Pedidos branch-scoped: **não existe**
autorização de lote inteiro; cada item precisa do seu próprio lock+auth dentro
de uma transação separada.

**`assignBranch` (L399–441)** faz `requireCapabilityWithContext("orders.update_status", { targetBranchIds: [branchId] })` + transação. Bulk assign teria que chamar `lockOrderAndAuthorize` por item em transações separadas (ou uma transação por item em paralelo limitado).

### Padrão de server action (convenção do repo)

```
"use server"
await requireCapability(cap)   // ou requireCapabilityWithContext
ActionResult<T> = {ok:true, data} | {ok:false, error}
Zod safeParse na entrada
logger.error({err}) no catch (nunca console)
getPgError(e) para erros de banco (src/lib/db-error.ts)
revalidatePath/revalidateTag após mutação
```

Exemplar: `apps/web/src/app/dashboard/reviews/actions.ts` (unitário) e
`apps/web/src/app/dashboard/orders/actions.ts` (com `lockOrderAndAuthorize`).

### ReviewCard não usa SelectableItem

`apps/web/src/app/dashboard/reviews/_components/review-card.tsx` — é um
`<Link href=...>`. `SelectableItem` intercepta `onClickCapture` e cancela a
navegação no modo ativo. Funciona com `<Link>` do mesmo jeito que com cards de
Pedido/Cliente — nenhuma alteração no `ReviewCard` é necessária.

## Commands you will need

| Propósito       | Comando                          | Esperado em sucesso           |
|-----------------|----------------------------------|-------------------------------|
| Typecheck       | `bun check-types`                | exit 0, sem erros             |
| Lint            | `bun check`                      | exit 0 (biome/ultracite)      |
| Testes          | `bun --cwd apps/web test`        | exit 0, testes verdes         |
| Guard forms     | `bun guard:forms`                | exit 0                        |
| Build           | `bun run --cwd apps/web build`   | exit 0                        |
| Rota smoke      | `bun dev:web` + visitar `/dashboard/reviews` | sem erro de runtime |

## Suggested executor toolkit

- Skill `next-best-practices` para dúvidas sobre Server Actions / Client Components.
- Skill `supabase` se precisar inspecionar o schema da tabela `review` ao vivo.
- ADR `docs/adr/0016-religacao-gates-3-niveis-filial.md` para contexto de branch-scoping de pedidos.

## Scope

**In scope** (únicos arquivos a criar/modificar neste plano):

- `apps/web/src/app/dashboard/reviews/actions.ts` — nova action `bulkModerateReviews`
- `apps/web/src/app/dashboard/reviews/schema.ts` — novo schema `bulkModerateReviewsSchema`
- `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx` — adicionar bulk selection + BulkActionBar
- `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx` — (criar) dialog de confirmação + nota para rejected/spam em lote
- `apps/web/src/app/dashboard/orders/actions.ts` — documentar (comentário de design) o contrato de futura `bulkAssignBranch`; **não implementar** a action de orders neste plano

**Out of scope** (não tocar):

- `apps/web/src/components/bulk/*` — infraestrutura já está completa; não alterar.
- `apps/web/src/lib/use-bulk-selection.ts` — hook genérico; não alterar.
- `apps/web/src/app/dashboard/reviews/[id]/page.tsx` — moderação individual continua inalterada.
- `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx` — bulk assign de orders: apenas design neste plano, não fiar na UI.
- Qualquer arquivo fora de `apps/web/src/app/dashboard/reviews/` e `apps/web/src/app/dashboard/orders/actions.ts`.

## Git workflow

- Branch: `advisor/037-bulk-moderation-spike`
- Commits Conventional Commits em PT, subject ≤50 chars. Exemplos do repo:
  `feat(reviews): add bulk moderation action`
  `feat(reviews): wire bulk selection in reviews-infinite`
- **Não** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Definir e adicionar o schema `bulkModerateReviewsSchema` em schema.ts

**O que fazer:**

Abrir `apps/web/src/app/dashboard/reviews/schema.ts` (leia o arquivo antes de
editar). Adicionar ao final:

```ts
/** Limite de itens por lote: 50. Impede timeouts e bate no limite de 1MB da
 *  server action (ADR: bodySizeLimit=5mb; 50 UUIDs ~1.8KB — seguro). */
export const BULK_MODERATE_LIMIT = 50;

export const bulkModerateReviewsSchema = z
  .object({
    reviewIds: z
      .array(z.string().uuid())
      .min(1, "Selecione ao menos 1 avaliação")
      .max(BULK_MODERATE_LIMIT, `Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`),
    status: z.enum(["approved", "rejected", "spam"]),
    moderationNote: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      (data.status === "rejected" || data.status === "spam") &&
      !data.moderationNote?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
        path: ["moderationNote"],
      });
    }
  });

export type BulkModerateReviewsInput = z.infer<typeof bulkModerateReviewsSchema>;
```

**Rationale do limite 50:** `BATCH_SIZE = 20` (`src/lib/infinite.ts:8`), então
um "Selecionar todos" máximo = 20 itens visíveis + páginas carregadas. 50 é
ceiling seguro que cobre 2 páginas completas. Transações independentes por item
(ver step 2) garantem que 1 falha não aborte as demais.

**Verify**: `bun check-types` → exit 0

---

### Step 2: Criar a server action `bulkModerateReviews` em actions.ts

**O que fazer:**

Abrir `apps/web/src/app/dashboard/reviews/actions.ts` (releia antes de editar).
Adicionar import:

```ts
import {
  type BulkModerateReviewsInput,
  bulkModerateReviewsSchema,
  BULK_MODERATE_LIMIT,
  // já existem no imports: ModerateReviewInput, moderateReviewSchema
} from "./schema";
```

Adicionar a action no final do arquivo:

```ts
export interface BulkModerateResult {
  failed: Array<{ id: string; error: string }>;
  succeeded: number;
}

/**
 * Modera N avaliações em lote. Cada item é processado numa transação
 * independente — falhas isoladas não abortam o lote inteiro.
 * Capability exigida: "reviews.moderate" (super_admin/admin).
 * Reviews são globais (sem branch-scoping).
 */
export async function bulkModerateReviews(
  input: BulkModerateReviewsInput
): Promise<ActionResult<BulkModerateResult>> {
  const parsed = bulkModerateReviewsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Entrada inválida",
    };
  }

  // Auth: 1 check antes do loop — reviews.moderate não é branch-scoped.
  const session = await requireCapability("reviews.moderate");
  const { reviewIds, status, moderationNote } = parsed.data;

  let succeeded = 0;
  const failed: BulkModerateResult["failed"] = [];

  for (const reviewId of reviewIds) {
    try {
      await db
        .update(review)
        .set({
          status,
          moderatedBy: session.user.id,
          moderatedAt: new Date(),
          moderationNote: moderationNote ?? null,
        })
        .where(eq(review.id, reviewId));
      succeeded++;
    } catch (error) {
      const pg = getPgError(error);
      logger.error("bulkModerateReviews", { reviewId, err: error });
      failed.push({
        id: reviewId,
        error: pg?.message ?? "Erro interno",
      });
    }
  }

  // Revalidar uma vez após o loop (não por item — evita 50 revalidações).
  revalidatePath(REVIEWS_PATH);

  if (succeeded === 0) {
    return { ok: false, error: "Nenhuma avaliação foi moderada" };
  }

  return { ok: true, data: { succeeded, failed } };
}
```

**Pontos de design obrigatórios:**

1. `requireCapability("reviews.moderate")` **uma vez** antes do loop — reviews
   são globais; verificar por item seria redundante e lento.
2. Loop `for...of` (não `.forEach` — anti-pattern banido pelo CLAUDE.md).
3. Transação independente por item: cada `db.update` em isolamento. Se um
   `reviewId` não existir no DB, o `update` simplesmente não afeta linhas
   (Drizzle não lança erro para `UPDATE ... WHERE id = X` sem match) —
   o contador `succeeded` pode contar IDs inexistentes. Decisão: ignorar esse
   edge-case neste piloto; se precisar de verificação, usar `db.update(...).returning()`.
4. `getPgError(error)` de `src/lib/db-error.ts` para extrair erro Postgres real
   (o `.message` do Drizzle é genérico).
5. `revalidatePath(REVIEWS_PATH)` uma única vez no final.
6. Adicionar import de `getPgError`:
   ```ts
   import { getPgError } from "@/lib/db-error";
   ```

**Verify**: `bun check-types` → exit 0

---

### Step 3: Criar o dialog de confirmação para rejected/spam em lote

**O que fazer:**

Criar `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx`.
Este é um Client Component que coleta a nota de moderação quando `status` é
`rejected` ou `spam`, e confirma antes de executar.

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@emach/ui/components/dialog";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { notify } from "@/lib/notify";

import { bulkModerateReviews } from "../actions";
import type { BulkModerateReviewsInput } from "../schema";

type ModerateStatus = Extract<
  BulkModerateReviewsInput["status"],
  "approved" | "rejected" | "spam"
>;

interface BulkModerateDialogProps {
  count: number;
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
  reviewIds: string[];
  status: ModerateStatus;
}

const STATUS_LABELS: Record<ModerateStatus, string> = {
  approved: "Aprovar",
  rejected: "Rejeitar",
  spam: "Marcar como spam",
};

const NOTE_REQUIRED: ModerateStatus[] = ["rejected", "spam"];

export function BulkModerateDialog({
  open,
  onClose,
  onSuccess,
  reviewIds,
  status,
  count,
}: BulkModerateDialogProps) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | undefined>();
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (NOTE_REQUIRED.includes(status) && !note.trim()) {
      setNoteError("Nota obrigatória para rejeitar ou marcar como spam");
      return;
    }
    setNoteError(undefined);

    startTransition(async () => {
      const result = await bulkModerateReviews({
        reviewIds,
        status,
        moderationNote: note.trim() || undefined,
      });

      if (!result.ok) {
        notify.error(result.error);
        return;
      }

      const { succeeded, failed } = result.data;
      if (failed.length > 0) {
        notify.error(
          `${succeeded} moderada(s); ${failed.length} falhou. Tente novamente para as que falharam.`
        );
      } else {
        notify.success(`${succeeded} avaliação(ões) moderada(s)`);
      }
      setNote("");
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {STATUS_LABELS[status]} {count} avaliação
            {count === 1 ? "" : "ões"}?
          </DialogTitle>
          <DialogDescription>
            Esta ação será aplicada a todas as avaliações selecionadas.
          </DialogDescription>
        </DialogHeader>
        {NOTE_REQUIRED.includes(status) && (
          <div className="space-y-1.5">
            <Textarea
              aria-invalid={noteError ? true : undefined}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explique a decisão para registro interno (obrigatório)"
              value={note}
            />
            <FieldError>{noteError}</FieldError>
          </div>
        )}
        <DialogFooter>
          <Button disabled={isPending} onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button
            disabled={isPending}
            onClick={handleSubmit}
            variant={status === "approved" ? "default" : "destructive"}
          >
            {isPending ? "Moderando…" : `${STATUS_LABELS[status]} (${count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Convenções aplicadas:**

- `FieldError` de `@/components/field-error` (não `<p>` cru — regra `raw-validation-error`).
- `useTransition` + `disabled={isPending}` — anti double-submit.
- Feedback diferenciado: falhas parciais → `notify.error` com contagem; sucesso total → `notify.success`.

**Verify**: `bun check-types` → exit 0 && `bun guard:forms` → exit 0

---

### Step 4: Fiação — adicionar bulk selection e ações em reviews-infinite.tsx

**O que fazer:**

Abrir `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx`
(releia antes de editar). O arquivo atual não tem seleção em lote. O padrão
a seguir é o de `customers-infinite.tsx` (referência mais próxima — usa
`SelectableItem` com `ReviewCard` que é `<Link>`).

Resultado esperado (estrutura funcional):

```tsx
"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { useState } from "react";

import { fetchReviewsPage } from "../actions";
import type { ReviewListItem } from "../data";
import type { ReviewsListFiltersParsed } from "../schema";
import { BulkModerateDialog } from "./bulk-moderate-dialog";
import { ReviewCard } from "./review-card";

type BulkAction = "approved" | "rejected" | "spam";

interface ReviewsInfiniteProps {
  filters: ReviewsListFiltersParsed;
  initial: ReviewListItem[];
  initialCursor: string | null;
}

export function ReviewsInfinite({ initial, initialCursor, filters }: ReviewsInfiniteProps) {
  const resetKey = JSON.stringify(filters);
  const { items, hasMore, loadMore, pending, error } = useInfiniteList({
    initialItems: initial,
    initialCursor,
    fetchPage: (cursor) => fetchReviewsPage({ filters, cursor }),
    resetKey,
  });
  const sel = useBulkSelection({ items, getId: (r) => r.id, resetKey });

  // Dialog state: qual ação bulk está sendo confirmada
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);

  function handleBulkSuccess() {
    setBulkAction(null);
    sel.exit();
  }

  return (
    <div aria-live="polite">
      <div className="mb-3 flex justify-end">
        <SelectionToolbar
          active={sel.active}
          allLoadedSelected={sel.allLoadedSelected}
          loadedCount={items.length}
          onCancel={sel.exit}
          onEnter={sel.enter}
          onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((review) => (
          <SelectableItem
            active={sel.active}
            key={review.id}
            onToggle={() => sel.toggle(review.id)}
            selected={sel.isSelected(review.id)}
          >
            <ReviewCard review={review} />
          </SelectableItem>
        ))}
      </div>
      <InfiniteSentinel
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        pending={pending}
      />
      {sel.count > 0 && (
        <BulkActionBar
          actions={[
            {
              label: "Aprovar",
              run: () => setBulkAction("approved"),
              variant: "default",
            },
            {
              label: "Rejeitar",
              run: () => setBulkAction("rejected"),
              variant: "secondary",
            },
            {
              label: "Spam",
              run: () => setBulkAction("spam"),
              variant: "destructive",
            },
          ]}
          onClear={sel.clear}
          selectedIds={sel.selectedIds}
        />
      )}
      {bulkAction && (
        <BulkModerateDialog
          count={sel.count}
          onClose={() => setBulkAction(null)}
          onSuccess={handleBulkSuccess}
          open
          reviewIds={sel.selectedIds}
          status={bulkAction}
        />
      )}
    </div>
  );
}
```

**Notas de fiação:**

- `BulkAction.run` recebe `ids: string[]`, mas aqui não usamos o parâmetro
  diretamente (o dialog usa `sel.selectedIds`). Isso é consistente com o padrão
  existente — `run` pode ignorar o arg se o caller já tem o estado.
- `sel.exit()` no `onSuccess` sai do modo de seleção e limpa a seleção,
  retornando à listagem normal.
- `revalidatePath` na server action + Next.js invalidação automática garante
  que os cards mudem de status após o dialog fechar.

**Verify**: `bun check-types` → exit 0 && `bun guard:forms` → exit 0

---

### Step 5: Smoke visual

**O que fazer:**

```
bun dev:web
```

Navegar para `/dashboard/reviews`. Verificar:

1. Botão "Selecionar" aparece acima do grid (canto direito).
2. Clicar em "Selecionar" → modo ativo: checkbox aparece sobre cada card, clique
   no card seleciona (não navega).
3. Selecionar ≥1 review → `BulkActionBar` aparece na parte inferior.
4. Clicar "Aprovar" → dialog abre com título "Aprovar X avaliação(ões)?", sem
   campo de nota, botão "Aprovar (X)" habilitado.
5. Clicar "Rejeitar" → dialog exige nota; submit sem nota mostra `FieldError`.
6. Confirmar aprovação → toast de sucesso, dialog fecha, seleção limpa, cards
   atualizados.
7. Navegar para `/dashboard/reviews` com filtro `tab=approved` → reviews
   aprovadas aparecem.

**Verify**: Nenhum erro de runtime em `nextjs_call <port> get_errors`.

---

### Step 6: Documentar contrato de bulk assign para orders (comentário de design)

**O que fazer:**

Em `apps/web/src/app/dashboard/orders/actions.ts`, adicionar um comentário
de design após a função `assignBranch` (L399–441). O comentário documenta a
assinatura e o contrato para quando a implementação de `bulkAssignBranch` for
feita, sem criar código ainda:

```ts
// ── DESIGN: bulkAssignBranch (não implementado neste sprint) ──────────────────
//
// Assinatura proposta:
//
//   export async function bulkAssignBranch(
//     input: { orderIds: string[]; branchId: string }
//   ): Promise<ActionResult<{ succeeded: number; failed: Array<{ id: string; error: string }> }>>
//
// Contrato de autorização:
//   1. requireCapabilityWithContext("orders.update_status", { targetBranchIds: [branchId] })
//      UMA VEZ antes do loop — o ator precisa de acesso à filial de DESTINO.
//   2. Cada item: db.transaction(async (tx) => lockOrderAndAuthorize(tx, "orders.update_status", orderId))
//      — lockOrderAndAuthorize valida o branchId *atual* do pedido (pode ter mudado);
//        para pedido na triagem (branchId = null), só admin/super_admin age.
//      — NÃO autorizar o lote inteiro de uma vez (race condition: pedido pode ser
//        reatribuído entre a verificação global e a mutação).
//   3. Loop for...of com transações independentes (falha por item não aborta lote).
//   4. Limite: BULK_ASSIGN_LIMIT = 20 (1 página; triagem é o caso de uso principal).
//   5. revalidatePath(ORDERS_PATH) uma vez após o loop.
//
// Fiação na UI:
//   orders-infinite.tsx: adicionar entry no array `actions` do BulkActionBar existente
//   (ex: { label: "Atribuir filial", run: (ids) => openBranchPicker(ids) }).
//   Um BranchPickerDialog coleta o branchId antes de chamar bulkAssignBranch.
//
// Diferença de reviews: orders são branch-scoped → lockOrderAndAuthorize por item.
// Reviews são globais → 1 requireCapability antes do loop.
// ─────────────────────────────────────────────────────────────────────────────
```

**Verify**: `bun check-types` → exit 0

---

### Step 7: Verificação final

```bash
bun check-types   # exit 0
bun check         # exit 0 (lint biome/ultracite)
bun guard:forms   # exit 0
bun --cwd apps/web test  # exit 0, testes verdes (baseline intacto)
```

Confirmar que nenhum arquivo fora do escopo foi modificado:

```bash
git diff --name-only HEAD
```

Deve listar apenas arquivos dentro de:
- `apps/web/src/app/dashboard/reviews/`
- `apps/web/src/app/dashboard/orders/actions.ts`

## Test plan

Este plano é SPIKE/DESIGN — o piloto de reviews é implementado, mas testes
unitários de `bulkModerateReviews` são recomendados (não bloqueadores para este
plano):

**Testes a escrever** (arquivo novo: `apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts`):

Modelar após `apps/web/src/app/dashboard/_components/__tests__/activity.test.ts`
(padrão `vi.hoisted` + `vi.mock` para `@emach/db`).

Casos:
1. Happy path — `status: "approved"`, 3 IDs → `{ ok: true, data: { succeeded: 3, failed: [] } }`.
2. Nota ausente para `rejected` → `{ ok: false, error: "Nota de moderação obrigatória…" }`.
3. Nota ausente para `spam` → mesma resposta.
4. Nota presente para `rejected` → `{ ok: true, data: { succeeded: 1, failed: [] } }`.
5. Array vazio → `{ ok: false, error: "Selecione ao menos 1 avaliação" }`.
6. Array com >50 itens → `{ ok: false, error: "Limite de 50 avaliações…" }`.
7. 1 item com erro de DB (mock lança) → `{ ok: true, data: { succeeded: N-1, failed: [{ id, error }] } }`.

**Verificação de testes** (quando escritos):
```bash
bun --cwd apps/web test --reporter=verbose reviews/bulk
```

## Done criteria

Machine-checkable. Todos devem ser verdadeiros:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (lint biome/ultracite)
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0 (baseline intacto; nenhum teste novo quebrado)
- [ ] `reviews-infinite.tsx` importa `BulkActionBar`, `SelectableItem`, `SelectionToolbar`, `useBulkSelection`
- [ ] `actions.ts` exporta `bulkModerateReviews` e `BulkModerateResult`
- [ ] `schema.ts` exporta `bulkModerateReviewsSchema`, `BulkModerateReviewsInput`, `BULK_MODERATE_LIMIT`
- [ ] `bulk-moderate-dialog.tsx` existe e usa `FieldError` (não `<p>` cru com classe `text-destructive`)
- [ ] `orders/actions.ts` contém comentário de design para `bulkAssignBranch`
- [ ] `git diff --name-only HEAD` lista apenas arquivos dentro de `apps/web/src/app/dashboard/reviews/` e `apps/web/src/app/dashboard/orders/actions.ts`
- [ ] Smoke visual (Step 5) completo sem erros de runtime

## STOP conditions

Pare e reporte (não improvise) se:

- O código nas localizações de "Current state" não corresponder aos trechos
  citados (drift desde `79379ef5`).
- `reviews-infinite.tsx` já tiver bulk selection (duplicação não-óbvia ao
  planear — verificar no drift check inicial).
- `requireCapability("reviews.moderate")` lançar `Forbidden:` em runtime para
  uma conta `admin` autenticada — isso indica override de capability negativo ou
  mudança no CAPABILITIES registry.
- O `Dialog`/`DialogContent` de `@emach/ui` não existir (verificar
  `packages/ui/src/components/dialog*` antes de importar).
- O step de typecheck falhar com erro não relacionado ao código que você escreveu
  (erro pré-existente no repo — não conserte fora do escopo).
- Qualquer step de verificação falhar duas vezes após tentativa razoável de fix.

## Maintenance notes

**Limites e escalabilidade:**

- `BULK_MODERATE_LIMIT = 50` é conservador frente ao `BATCH_SIZE = 20`. Se o
  produto evoluir para "selecionar todas as páginas" (não apenas carregadas),
  o limite precisará de revisão e a action precisará de cursor/paginação próprio.
- O loop serial (`for...of`) é adequado para 50 itens (~50 ms). Para lotes
  maiores, considerar `Promise.allSettled` com concorrência limitada (`p-limit`).

**Testes ausentes neste plano:**

- Testes unitários de `bulkModerateReviews` foram especificados mas não
  implementados (seção Test plan). Prioridade: P3, pode ser feito em PR de
  follow-up junto com o plano de testes de actions.

**Implementação de orders pendente:**

- O comentário de design em `orders/actions.ts` (Step 6) é o handoff para a
  implementação futura de `bulkAssignBranch`. O ponto crítico: **não autorizar
  o lote inteiro de uma vez** — usar `lockOrderAndAuthorize` por item dentro de
  transações independentes.

**Revisão:**

- Revisor deve verificar que `BulkModerateDialog` usa `FieldError` e não `<p>` cru.
- Revisar que `requireCapability` aparece **uma vez** antes do loop em
  `bulkModerateReviews` (não dentro do loop).
- Verificar que `revalidatePath(REVIEWS_PATH)` ocorre uma vez após o loop
  completo, não por item.

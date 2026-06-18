# Plan 035: [SPIKE/DESIGN] Definir actions e UI para o status machine de refund_request

> **Executor instructions**: Este plano é um **spike de design** — o entregável
> principal é documentação + assinaturas de código, não execução completa. Os
> passos estão divididos em dois blocos claramente marcados:
> - **Bloco A (Design / Decisões):** leitura e análise — sem tocar em código.
> - **Bloco B (Implementação):** escrever código apenas se todas as Open
>   Questions do Bloco A estiverem respondidas. Se qualquer OQ ficar aberta,
>   entregar apenas o Bloco A e reportar.
>
> Follow this plan step by step. Run every verification command and confirm the
> expected result before moving to the next step. If anything in the "STOP
> conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md` — unless a reviewer
> dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 79379ef5..HEAD -- apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/schema.ts apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx packages/db/src/schema/orders.ts apps/web/src/lib/capabilities.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`refund_request` tem um status machine completo (`requested → under_review →
approved → rejected | refunded`) mas o dashboard não expõe nenhuma ação de
escrita sobre ele. O staff vê as solicitações na aba "Reembolso" do detalhe do
pedido, mas não consegue aprovar, rejeitar ou mover para "em análise". Isso
transforma um fluxo compliance-adjacent em leitura apenas — decisões de estorno
ficam invisíveis no sistema.

Este plano define as três server actions necessárias (`setRefundUnderReview`,
`approveRefundRequest`, `rejectRefundRequest`), as transições válidas, a
capability a usar, as mudanças de UI mínimas e a linha clara com a integração
Asaas (que permanece fora deste escopo). Com o design consolidado, a
implementação pode executar sem ambiguidade em sessão separada.

## Current state

### Schema relevante

`packages/db/src/schema/orders.ts`:

```ts
// L49–56
export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "under_review",
  "approved",
  "refunded",
  "rejected",
]);
export type RefundStatus = (typeof refundStatusEnum.enumValues)[number];

// L70–74
export const ACTIVE_REFUND_STATUSES = [
  "requested",
  "under_review",
  "approved",
] as const satisfies readonly RefundStatus[];
```

Tabela `refund_request` (L314–366):
- Campos relevantes para as ações: `status`, `rejectionReason`, `resolvedAt`,
  `asaasRefundRef` (nullable — preenchido externamente), `actorType`,
  `actorUserId`.
- Constraint: `refund_actor_coherence` garante `user`/FK ou `system`/null.
- Índice parcial `refund_request_one_open_per_order` — no máximo 1 solicitação
  ativa por pedido; ativo quando `status IN ('requested','under_review','approved')`.

### Capability registry

`apps/web/src/lib/capabilities.ts` (L197–203):

```ts
"orders.refund": {
  group: "Vendas",
  resource: "Pedidos",
  action: "Estornar",
  description: "Estornar pedido",
  defaultRoles: SA,  // super_admin + admin
},
```

`orders.refund` **existe** no registry com `defaultRoles: SA`
(`["super_admin", "admin"]`). É a capability natural para as actions de
gerenciamento de `refund_request`. Confirmar no arquivo antes de implementar.

### Actions existentes

`apps/web/src/app/dashboard/orders/actions.ts`:

- `refundOrder` (L552–618): usa `lockOrderAndAuthorize(tx, "orders.refund", orderId)`;
  transita o **pedido** (`order.status`) para `"refunded"`. Esta é uma ação
  diferente — ela opera na tabela `order`, não em `refund_request`.
- `lockOrderAndAuthorize` (L126–163): helper exportado, faz `SELECT ... FOR UPDATE`
  no `order` e valida branch-scope. Deve ser reutilizado nas novas actions.

Não existem `approveRefundRequest`, `rejectRefundRequest` nem
`setRefundUnderReview` em nenhum arquivo da feature.

```bash
grep -rn "approveRefundRequest\|rejectRefundRequest\|setRefundUnderReview" \
  apps/web/src/app/dashboard/orders/
# deve retornar zero linhas
```

### UI atual

`apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx` (L16–73):
componente Server (sem `"use client"`) que recebe `refunds: OrderRefundItem[]`
e renderiza cada item como card read-only. Sem botões de ação, sem `useTransition`,
sem `startTransition`. O tipo `OrderRefundItem` em `data.ts` (L111–121) expõe
`id`, `status`, `amount`, `asaasRefundRef`, `rejectionReason`, `requestedAt`,
`resolvedAt` — base suficiente para as ações.

A aba "Reembolso" só aparece quando `order.refundRequests.length > 0`
(`page.tsx` L99–108). O Server Component `page.tsx` carrega `canRefund` via
`can(session, "orders.refund")` (L63) — a prop já existe na árvore.

### Padrão DestructiveActionDialog

`apps/web/src/app/dashboard/users/_components/destructive-action-dialog.tsx`:
componente genérico com `AlertDialog`, campo `Textarea` para motivo, prop
`reasonRequired`. Usar para "Rejeitar" (motivo obrigatório) e "Aprovar" (motivo
opcional).

### Convenções que se aplicam

- **Server actions** (`apps/web/CLAUDE.md`): `"use server"` no topo; retorno
  `ActionResult<T>`; validação Zod `safeParse`; catch: `logger.error` (nunca
  `console`); `revalidatePath` após mutação.
- **Erro de banco**: usar `getPgError(e)` de `src/lib/db-error.ts`.
- **`lockOrderAndAuthorize`**: padrão obrigatório para mutações de pedido —
  `SELECT order FOR UPDATE` + branch-scope capability check numa transação.
  As novas actions devem seguir o mesmo padrão (lock do `order` pai).
- **Auditoria**: inserir em `orderStatusHistory` NÃO — esse log é para
  transições do `order.status`, não de `refund_request.status`. O `refundRequest`
  não tem tabela de histórico dedicada; o campo `rejectionReason` + `resolvedAt`
  + `actorUserId` são o rastro de auditoria embutido.

## Commands you will need

| Propósito      | Comando                                              | Esperado em sucesso     |
| -------------- | ---------------------------------------------------- | ----------------------- |
| Typecheck      | `bun check-types`                                    | exit 0, sem erros       |
| Lint           | `bun check`                                          | exit 0                  |
| Testes         | `bun --cwd apps/web test`                            | todos passam            |
| Guard de forms | `bun guard:forms`                                    | exit 0                  |
| Build          | `bun run --cwd apps/web build`                       | exit 0                  |
| Drift check    | `git diff --stat 79379ef5..HEAD -- <in-scope paths>` | sem surpresas           |
| Grep actions   | `grep -rn "approveRefundRequest\|rejectRefundRequest\|setRefundUnderReview" apps/web/src/app/dashboard/orders/` | zero linhas |

## Suggested executor toolkit

- `find-docs` se precisar de API exata de Drizzle para atualizar colunas
  específicas numa transação.
- Ler `apps/web/src/app/dashboard/orders/actions.ts` na íntegra antes de
  começar o Bloco B — o padrão de `lockOrderAndAuthorize` + `db.transaction`
  deve ser espelhado fielmente.

## Scope

**In scope** (únicos arquivos que o executor pode modificar):

- `apps/web/src/app/dashboard/orders/actions.ts` — adicionar as 3 novas server actions
- `apps/web/src/app/dashboard/orders/schema.ts` — adicionar schemas Zod + tipos
- `apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx`
  — adicionar botões de ação (converter para Client Component ou extrair subcomponente client)
- `apps/web/src/app/dashboard/orders/[id]/page.tsx` — passar `canRefund` para
  `RefundTab` se necessário (já é calculado em L58–65)

**Out of scope** (não tocar, mesmo que pareça relacionado):

- Qualquer chamada à API Asaas — o dashboard nunca chama o Asaas diretamente
  (ADR-0008). `"approved"` grava a **decisão**; o movimento de dinheiro é externo.
- `packages/db/src/schema/orders.ts` — nenhuma mudança de schema necessária;
  os campos (`resolvedAt`, `rejectionReason`, `actorUserId`, etc.) já existem.
- `packages/db/src/schema/user-capability-override.ts` — `orders.refund`
  já existe no registry; não criar nova capability.
- Tabela de histórico dedicada para `refund_request` — não existe e não entra
  neste plano.
- `plans/README.md` — o executor atualiza somente a linha deste plano.

## Git workflow

- Branch: `advisor/035-refund-request-actions-spike`
- Commits em Conventional Commits PT, subject ≤ 50 chars:
  - `feat(orders): adicionar schemas de ação de refund_request`
  - `feat(orders): actions setRefundUnderReview/approve/reject`
  - `feat(orders): botões de ação na RefundTab`
- NÃO fazer push nem abrir PR sem instrução.

---

## BLOCO A — Design / Decisões

### Step A1: Verificar o estado atual do código

Confirmar que as três functions ainda não existem e que os arquivos batem com
os excerpts acima.

```bash
grep -rn "approveRefundRequest\|rejectRefundRequest\|setRefundUnderReview" \
  apps/web/src/app/dashboard/orders/
```

Confirmar que `orders.refund` está em `apps/web/src/lib/capabilities.ts`
como `defaultRoles: SA`.

```bash
grep -n "orders.refund" apps/web/src/lib/capabilities.ts
```

**Verify**: ambos os comandos batem com o descrito em "Current state". Se
divergirem → STOP.

### Step A2: Registrar as transições válidas de refund_request

As transições do status machine, derivadas de `refundStatusEnum` e do ciclo
documentado em `CONTEXT.md` L91, são:

| De             | Para           | Ação                          | Quem pode       |
| -------------- | -------------- | ----------------------------- | --------------- |
| `requested`    | `under_review` | `setRefundUnderReview`        | `orders.refund` |
| `requested`    | `approved`     | `approveRefundRequest`        | `orders.refund` |
| `requested`    | `rejected`     | `rejectRefundRequest`         | `orders.refund` |
| `under_review` | `approved`     | `approveRefundRequest`        | `orders.refund` |
| `under_review` | `rejected`     | `rejectRefundRequest`         | `orders.refund` |
| `approved`     | `refunded`     | *(fora do escopo — Asaas ext)* | —              |

`approved → refunded` não tem action no dashboard: `"approved"` é a decisão
interna; `"refunded"` é gravado externamente (ou manualmente quando o Asaas
integrar). Este plano NÃO implementa essa transição.

> **Open Question OQ-1**: O produto quer permitir `approved → refunded` manualmente
> via dashboard como ação de "confirmação de que o dinheiro saiu"? Se sim,
> isso expande o escopo. Decisão necessária antes de fechar o design.

> **Open Question OQ-2**: É necessário dois níveis de aprovação (ex: `admin`
> propõe/`super_admin` confirma)? Ou `orders.refund` (ambos `super_admin` e
> `admin`) pode aprovar diretamente? A capability atual não distingue.
> Se for necessário dois níveis, uma nova capability (ex: `orders.refund_approve`)
> seria necessária — isso impactaria o schema e a UI de permissões.

**Verify**: anotar as respostas às OQs antes de avançar para o Bloco B.
Se OQ-1 ou OQ-2 ficarem abertas → entregar Bloco A e reportar.

### Step A3: Definir as assinaturas das actions

```ts
// apps/web/src/app/dashboard/orders/schema.ts — schemas Zod a adicionar

export const setRefundUnderReviewSchema = z.object({
  orderId: z.string().uuid(),
  refundRequestId: z.string().min(1),
});
export type SetRefundUnderReviewInput = z.infer<typeof setRefundUnderReviewSchema>;

export const approveRefundRequestSchema = z.object({
  orderId: z.string().uuid(),
  refundRequestId: z.string().min(1),
  note: z.string().trim().max(500).optional(), // nota interna opcional
});
export type ApproveRefundRequestInput = z.infer<typeof approveRefundRequestSchema>;

export const rejectRefundRequestSchema = z.object({
  orderId: z.string().uuid(),
  refundRequestId: z.string().min(1),
  rejectionReason: z.string().trim().min(10, "Motivo mín. 10 caracteres").max(500),
});
export type RejectRefundRequestInput = z.infer<typeof rejectRefundRequestSchema>;
```

Rationale de campos:
- `orderId` presente em todas: necessário para `lockOrderAndAuthorize` (que
  opera no `order`, não no `refund_request`).
- `refundRequestId` como `z.string().min(1)` (não `.uuid()`) porque IDs de
  Better Auth/Drizzle são alfanuméricos (não UUID — ver `reference_better_auth`
  em MEMORY.md).
- `rejectionReason` obrigatório com min 10 — consistente com `DestructiveActionDialog`
  (`MIN_REASON_LENGTH = 10`, linha 31 do componente).

**Verify**: (conceptual) — confirmar que o schema é consistente com os tipos do
banco antes de avançar.

### Step A4: Definir a estrutura das actions

Padrão a espelhar: `refundOrder` em `actions.ts` (L552–618). As novas actions
devem seguir exatamente o mesmo skeleton:

```ts
// apps/web/src/app/dashboard/orders/actions.ts

export async function setRefundUnderReview(
  input: SetRefundUnderReviewInput
): Promise<ActionResult> { ... }

export async function approveRefundRequest(
  input: ApproveRefundRequestInput
): Promise<ActionResult> { ... }

export async function rejectRefundRequest(
  input: RejectRefundRequestInput
): Promise<ActionResult> { ... }
```

Corpo de cada action:
1. `safeParse` do schema correspondente.
2. `db.transaction(async (tx) => { ... })`:
   a. `lockOrderAndAuthorize(tx, "orders.refund", orderId)` — lock do pedido
      pai + branch-scope check.
   b. Verificar existência e status atual do `refund_request`:
      ```ts
      const [rr] = await tx
        .select({ status: refundRequest.status })
        .from(refundRequest)
        .where(and(
          eq(refundRequest.id, refundRequestId),
          eq(refundRequest.orderId, orderId),
        ))
        .for("update")  // lock junto com o order
        .limit(1);
      ```
   c. Validar transição: `VALID_REFUND_TRANSITIONS[rr.status]?.includes(toStatus)`.
   d. `tx.update(refundRequest).set({...}).where(eq(refundRequest.id, refundRequestId))`.
3. `revalidatePath(\`/dashboard/orders/${orderId}\`)`.
4. Catch: `logger.error(...)` + `isCapabilityError` check.

Campos a setar por action:

| Action               | status         | resolvedAt   | rejectionReason | actorType | actorUserId       |
| -------------------- | -------------- | ------------ | --------------- | --------- | ----------------- |
| setRefundUnderReview | `under_review` | null         | null            | `"user"`  | `session.user.id` |
| approveRefundRequest | `approved`     | `new Date()` | null            | `"user"`  | `session.user.id` |
| rejectRefundRequest  | `rejected`     | `new Date()` | input.rejectionReason | `"user"` | `session.user.id` |

Constante de transições a adicionar em `schema.ts`:

```ts
export const VALID_REFUND_TRANSITIONS: Partial<Record<RefundStatus, RefundStatus[]>> = {
  requested:    ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  // approved → refunded: fora do escopo (integração Asaas)
};
```

Importar `RefundStatus` de `@emach/db/schema/orders`.

**Verify**: (conceptual) — revisar que todos os campos obrigatórios pelo
`check refund_actor_coherence` estão cobertos:
`actorType = "user" AND actorUserId IS NOT NULL`. ✓

### Step A5: Definir as mudanças de UI em RefundTab

`refund-tab.tsx` é atualmente um Server Component (sem `"use client"`). Adicionar
botões de ação interativos exige um dos dois caminhos:

**Opção 1 (recomendada):** extrair um subcomponente `"use client"` chamado
`RefundActionButtons` que recebe `refundRequestId`, `orderId`, `currentStatus`
e `canRefund` como props; o Server Component `RefundTab` permanece server e
chama `RefundActionButtons`. Consistente com o padrão do projeto (Server Component
como shell, Client Component para interatividade).

**Opção 2:** converter `RefundTab` inteiro para `"use client"`. Mais simples mas
menos correto — o componente faz render puro de dados, não precisa de estado.

> **Open Question OQ-3**: Preferência de Opção 1 ou 2? Padrão da codebase
> favorece Opção 1 (ver `order-action-column.tsx` que é `"use client"` inteiro
> para facilitar `useTransition`, mas lida com muito mais interatividade). Para
> 3 botões simples, Opção 1 é mais limpa.

Layout dos botões por status:

| Status atual   | Botão "Em análise"  | Botão "Aprovar"       | Botão "Rejeitar"           |
| -------------- | ------------------- | --------------------- | -------------------------- |
| `requested`    | visível + ativo     | visível + ativo       | visível (DestructiveDialog) |
| `under_review` | oculto/disabled     | visível + ativo       | visível (DestructiveDialog) |
| `approved`     | oculto              | oculto (já aprovado)  | oculto                     |
| `rejected`     | oculto              | oculto                | oculto (terminal)          |
| `refunded`     | oculto              | oculto                | oculto (terminal)          |

"Rejeitar" usa `DestructiveActionDialog` com `reasonRequired=true` (motivo
mín. 10 chars). "Aprovar" usa `AlertDialog` simples (sem motivo obrigatório) ou
`DestructiveActionDialog` com `reasonRequired=false`.

A prop `canRefund: boolean` já é calculada em `page.tsx` (L62) via
`can(session, "orders.refund")`. Precisa ser passada para `RefundTab`
(que hoje não recebe essa prop — sua assinatura é só `refunds: OrderRefundItem[]`).

Mudança de assinatura de `RefundTab`:

```ts
// antes
interface RefundTabProps {
  refunds: OrderRefundItem[];
}

// depois
interface RefundTabProps {
  canRefund: boolean;
  orderId: string;
  refunds: OrderRefundItem[];
}
```

Em `page.tsx`, passar as novas props:
```tsx
content: <RefundTab
  canRefund={canRefund}
  orderId={id}
  refunds={order.refundRequests}
/>,
```

**Verify**: (conceptual) — confirmar que `canRefund` está disponível no escopo
do Server Component `page.tsx` (está: linha 62). ✓

---

## BLOCO B — Implementação

> **Pré-condição**: todas as OQs do Bloco A respondidas. Se OQ-1, OQ-2 ou OQ-3
> ficarem abertas, não executar o Bloco B.

### Step B1: Adicionar schemas e VALID_REFUND_TRANSITIONS em schema.ts

Abrir `apps/web/src/app/dashboard/orders/schema.ts` (Read obrigatório antes de
Edit). Adicionar no final do arquivo:

1. Import de `RefundStatus` de `@emach/db/schema/orders`.
2. Constante `VALID_REFUND_TRANSITIONS` conforme Step A4.
3. Schemas `setRefundUnderReviewSchema`, `approveRefundRequestSchema`,
   `rejectRefundRequestSchema` conforme Step A3.
4. Tipos exportados correspondentes.

**Verify**: `bun check-types` → exit 0.

### Step B2: Adicionar as 3 server actions em actions.ts

Abrir `apps/web/src/app/dashboard/orders/actions.ts` (Read obrigatório antes de
Edit). Adicionar imports necessários no topo:

```ts
import {
  refundRequest,
  type RefundStatus,
} from "@emach/db/schema/orders";
// ... já importado: order, orderStatusHistory, etc.
import { and } from "drizzle-orm"; // já importado: eq
import {
  type ApproveRefundRequestInput,
  approveRefundRequestSchema,
  type RejectRefundRequestInput,
  rejectRefundRequestSchema,
  type SetRefundUnderReviewInput,
  setRefundUnderReviewSchema,
  VALID_REFUND_TRANSITIONS,
} from "./schema";
```

Implementar as três functions conforme o skeleton do Step A4. Campos exatos a
setar por action conforme a tabela no Step A4. Usar `and(eq(...), eq(...))` para
filtrar `refund_request` por `id` **e** `orderId` (defesa contra IDOR).

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0.

### Step B3: Extrair RefundActionButtons e atualizar RefundTab

Abrir `apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx`
(Read obrigatório antes de Edit).

3a. Criar subcomponente `"use client"` `RefundActionButtons` no mesmo arquivo
    (ou em arquivo separado `refund-action-buttons.tsx` no mesmo diretório).
    Props: `canRefund: boolean`, `orderId: string`,
    `refundRequestId: string`, `currentStatus: RefundStatus`.

3b. Dentro de `RefundActionButtons`, usar `useTransition` + calls diretas às
    3 novas server actions. Padrão de toast: `notify.success(...)` /
    `notify.error(result.error)` + `router.refresh()` no sucesso.

3c. Renderizar botões conforme a tabela de layout do Step A5:
    - "Em análise": `<Button variant="secondary">` para `setRefundUnderReview`.
    - "Aprovar": `<Button variant="default">` com `DestructiveActionDialog`
      `reasonRequired=false` ou `AlertDialog` simples.
    - "Rejeitar": `<Button variant="destructive">` com `DestructiveActionDialog`
      `reasonRequired=true`.

3d. Atualizar assinatura de `RefundTab` para incluir `canRefund` e `orderId`
    conforme Step A5, e renderizar `<RefundActionButtons>` dentro do loop de
    refunds quando `canRefund` é true e o status não é terminal.

3e. Atualizar `page.tsx` para passar `canRefund={canRefund}` e `orderId={id}`
    para `<RefundTab>`.

**Anti-pattern a evitar**: não colocar `async` em Client Component, não usar
`useMemo`/`useCallback` (React Compiler ativo), não usar `key={index}` no map
de refunds (usar `key={refund.id}` — já está na implementação atual na L26).

**Verify**: `bun check-types` → exit 0; `bun check` → exit 0;
`bun guard:forms` → exit 0.

### Step B4: Smoke visual

`bun dev:web` + abrir `/dashboard/orders/[id]` com um pedido que tenha
`refund_request` em status `requested`. Verificar:
- Aba "Reembolso" aparece.
- Botões "Em análise", "Aprovar", "Rejeitar" aparecem.
- Clicar "Rejeitar" abre dialog com campo de motivo (mín. 10 chars).
- Após ação bem-sucedida, o card atualiza o status sem reload de página completo.

**Verify**: zero erros em `nextjs_call 3001 get_errors` após as ações.

---

## Test plan

Este é um spike de design; testes de integração das novas actions são
**desejáveis mas não bloqueantes** para fechar o plano se o executor de Bloco
B tiver restrições de tempo.

Se implementar testes, modelar a partir de
`apps/web/src/app/dashboard/_components/__tests__/activity.test.ts` (padrão de
mock `vi.hoisted` + `vi.mock` para `@emach/db`).

Casos a cobrir:
1. `setRefundUnderReview` — transição `requested → under_review` bem-sucedida.
2. `setRefundUnderReview` — transição inválida (`rejected → under_review`)
   retorna `{ ok: false }`.
3. `approveRefundRequest` — transição `under_review → approved` bem-sucedida.
4. `rejectRefundRequest` — campos `rejectionReason` + `resolvedAt` gravados.
5. Capability guard: session sem `orders.refund` → `{ ok: false, error: "Sem permissão..." }`.

**Verify**: `bun --cwd apps/web test` → todos passam, incluindo novos.

---

## Done criteria

Machine-checkable. ALL must hold após Bloco B:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0 (baseline ≥ 54 arquivos / 359 testes)
- [ ] `grep -rn "approveRefundRequest\|rejectRefundRequest\|setRefundUnderReview" apps/web/src/app/dashboard/orders/actions.ts` retorna as 3 functions
- [ ] `grep -n "VALID_REFUND_TRANSITIONS" apps/web/src/app/dashboard/orders/schema.ts` retorna 1 match
- [ ] `grep -n "canRefund" "apps/web/src/app/dashboard/orders/[id]/_components/tabs/refund-tab.tsx"` retorna ≥ 1 match
- [ ] `git diff --name-only HEAD` lista apenas arquivos dentro do in-scope
- [ ] `plans/README.md` status row atualizado para este plano

Para Bloco A apenas (sem Bloco B):
- [ ] OQs respondidas e documentadas neste arquivo (editar a seção "STOP conditions / OQ resolution" abaixo)
- [ ] `plans/README.md` status row atualizado

## STOP conditions

Parar e reportar (não improvisar) se:

1. O código nos caminhos citados em "Current state" não corresponde aos excerpts
   (codebase mudou desde a escrita do plano).
2. `orders.refund` não existe em `apps/web/src/lib/capabilities.ts` — a
   capability seria `STOP: propor nova entrada ao operator` antes de criar.
3. OQ-1 (transiton `approved → refunded` manual) não resolvida — não implementar
   o Bloco B com essa incerteza aberta.
4. OQ-2 (dois níveis de aprovação) não resolvida — poderia exigir nova capability.
5. Um step's verification falha duas vezes após tentativa razoável de correção.
6. O fix aparenta exigir tocar em arquivo fora do in-scope.

**OQ resolution** (preencher antes de executar Bloco B):

- OQ-1: ___
- OQ-2: ___
- OQ-3: ___

## Maintenance notes

- **Asaas integration (keystone):** quando a integração Asaas for implementada
  (ver `project_emach_pendencias.md`), a transição `approved → refunded` passará
  a ser disparada via webhook/callback Asaas. A action `approveRefundRequest`
  pode precisar disparar o call Asaas ali dentro, ou um cron pode monitorar
  registros `approved` sem `asaasRefundRef`. Decidir no plano de integração.
- **`refund_request.actorUserId`:** o campo representa quem **criou** a
  solicitação (o cliente, via e-commerce, com `actorType: "system"`). As novas
  actions não sobrescrevem esse campo — registram o ator da **resolução** apenas
  nos campos `resolvedAt` + `rejectionReason`. Se precisar de trilha completa
  de quem resolveu, considerar tabela de histórico dedicada em plano futuro.
- **Reviewer**: verificar que `rejectRefundRequest` grava `rejectionReason` e
  `resolvedAt` atomicamente na mesma transação; e que `approveRefundRequest`
  grava `resolvedAt` (terminal interno — não confundir com `refunded`).
- **Branch-scoping:** `lockOrderAndAuthorize` já cobre — nenhuma lógica extra
  necessária. Admin só age em pedidos da própria filial; super_admin em todos.

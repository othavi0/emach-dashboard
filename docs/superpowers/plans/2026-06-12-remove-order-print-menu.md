# Remove Order Print Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o menu `Imprimir` e as telas internas de impressão do detalhe de pedido.

**Architecture:** A mudança é subtractiva. O header do detalhe de pedido deixa de receber `actions`, a rota `/dashboard/orders/[id]/print` é removida, e os componentes usados só por essa rota são apagados. Links de DANFE/PDF fora do menu permanecem intactos.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Bun, Ultracite.

---

## File Structure

- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-identity.tsx` — remover import e uso de `PrintMenu`.
- Delete: `apps/web/src/app/dashboard/orders/[id]/_components/print-menu.tsx` — dropdown `Imprimir` do header.
- Delete: `apps/web/src/app/dashboard/orders/[id]/print/page.tsx` — rota interna de romaneio/etiqueta.
- Delete: `apps/web/src/app/dashboard/orders/_components/print-button.tsx` — botão client-only que chama `window.print()`.
- Delete: `apps/web/src/app/dashboard/orders/_components/print-picking-slip.tsx` — tela de romaneio.
- Delete: `apps/web/src/app/dashboard/orders/_components/print-shipping-label.tsx` — tela de etiqueta.

## Task 1: Remover fluxo de impressão do detalhe de pedido

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-identity.tsx`
- Delete: `apps/web/src/app/dashboard/orders/[id]/_components/print-menu.tsx`
- Delete: `apps/web/src/app/dashboard/orders/[id]/print/page.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/print-button.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/print-picking-slip.tsx`
- Delete: `apps/web/src/app/dashboard/orders/_components/print-shipping-label.tsx`

- [ ] **Step 1: RED — confirmar que o fluxo ainda existe**

Run:

```bash
rg "PrintMenu|PrintButton|PrintPickingSlip|PrintShippingLabel|/print\?type=" apps/web/src/app/dashboard/orders
```

Expected: FAIL lógico para o objetivo da task, com matches em `print-menu.tsx`, `page.tsx`, `print-button.tsx`, `print-picking-slip.tsx`, `print-shipping-label.tsx` e `order-identity.tsx`.

- [ ] **Step 2: Atualizar o header do pedido**

Em `apps/web/src/app/dashboard/orders/[id]/_components/order-identity.tsx`, remover:

```tsx
import { PrintMenu } from "./print-menu";
```

Trocar:

```tsx
<EntityIdentityHeader
	actions={<PrintMenu order={order} />}
	avatarFallback={getInitials(order.clientName)}
```

Por:

```tsx
<EntityIdentityHeader
	avatarFallback={getInitials(order.clientName)}
```

- [ ] **Step 3: Remover arquivos exclusivos de impressão**

Delete os arquivos:

```text
apps/web/src/app/dashboard/orders/[id]/_components/print-menu.tsx
apps/web/src/app/dashboard/orders/[id]/print/page.tsx
apps/web/src/app/dashboard/orders/_components/print-button.tsx
apps/web/src/app/dashboard/orders/_components/print-picking-slip.tsx
apps/web/src/app/dashboard/orders/_components/print-shipping-label.tsx
```

- [ ] **Step 4: GREEN — confirmar que não sobraram referências**

Run:

```bash
rg "PrintMenu|PrintButton|PrintPickingSlip|PrintShippingLabel|/print\?type=" apps/web/src/app/dashboard/orders
```

Expected: exit code `1`, sem matches.

- [ ] **Step 5: Verificar tipos**

Run:

```bash
bun check-types
```

Expected: exit code `0`.

- [ ] **Step 6: Verificar lint/format**

Run:

```bash
bun check
```

Expected: exit code `0`.

- [ ] **Step 7: Smoke visual**

Abrir um detalhe de pedido em dev server, por exemplo:

```text
/dashboard/orders/6a0fd88d-7952-4a61-b67f-8ce92879e544
```

Expected: a página carrega, o header não mostra `Imprimir`, e os blocos não relacionados à impressão continuam visíveis.

---

## Self-Review

- Spec coverage: cobre remoção do menu inteiro, rota `/print`, componentes exclusivos e preservação de DANFE/PDF fora do menu.
- Placeholder scan: sem `TBD`, `TODO` ou instruções vagas.
- Type consistency: nomes e caminhos batem com a exploração inicial.

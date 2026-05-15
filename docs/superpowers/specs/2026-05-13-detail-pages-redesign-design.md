# Spec C+E — Detail pages redesign (customer + order)

**Data:** 2026-05-13
**Escopo:** redesign de `/dashboard/orders/[id]` e `/dashboard/customers/[id]`. Padronizar header, polish timeline, consolidar KPIs.
**Precondições:** Specs A/B/D em main.
**Status:** design aprovado pelo user via Visual Companion.

## Contexto

`/dashboard/orders/[id]` usa header inline (não-padrão) e expõe botão "Voltar" redundante. `OrderTimeline` mistura history + notes mas usa dot uniforme (cor única `bg-primary`) — perde-se sinal visual entre tipos de evento.

`/dashboard/customers/[id]` mostra 5 KPI cards: LTV / Pedidos / Ticket / Último / Dias como Cliente. O 5º card ocupa espaço sem agregar muito (info estática, derivável). Os 4 primeiros são os de leitura operacional.

`<CustomerTabs>` já usa `<TabsList scrollable>` — comportamento mobile OK; nenhuma mudança necessária aqui (verificar via smoke; só ajustar se smoke revelar bug).

## Decisões

### 1. Order detail header → `<PageHeader>` + remover Voltar

`apps/web/src/app/dashboard/orders/[id]/page.tsx`:

```tsx
<PageHeader
	action={
		<Link
			className={buttonVariants({ variant: "secondary" })}
			href={`/dashboard/orders/${order.id}/print`}
		>
			Imprimir
		</Link>
	}
	description={`${order.clientName} • ${order.clientEmail}`}
	title={`Pedido ${order.number}`}
/>
```

Substitui o bloco inline (`<div className="flex items-start justify-between gap-4">...</div>`). Remove o `<Link>` "Voltar" — sidebar já navega.

`buttonVariants` + `Link` continuam usados (Imprimir). `PageHeader` é o componente compartilhado em `apps/web/src/components/page-header.tsx`.

### 2. `OrderTimeline` polish — dots coloridos + data mono direita

`apps/web/src/app/dashboard/orders/_components/order-timeline.tsx`:

- Cor da dot baseada no entry:
  - `kind === "note"` → `bg-info` (teal).
  - `kind === "history"` + `toStatus` em set "ok" (`paid`, `preparing`, `shipped`, `delivered`) → `bg-success`.
  - `kind === "history"` + `toStatus` em set "warning" (`pending_payment`) → `bg-warning`.
  - `kind === "history"` + `toStatus` em set "destructive" (`canceled`, `refunded`) → `bg-destructive`.
- Data alinhada à direita em `font-mono` (igual orders list).
- Layout: `flex justify-between gap-3` no item — dot + título à esquerda, data à direita.

Sem mudança na lógica (sort, merge history+notes). Apenas visual.

### 3. Customer KPIs 5→4

`apps/web/src/app/dashboard/customers/_components/customer-kpis-header.tsx`:

- Remover o 5º Card "Dias como Cliente".
- Trocar `grid grid-cols-2 md:grid-cols-5` → `grid grid-cols-2 md:grid-cols-4`.
- A info `daysSinceCreated` continua exposta no `CustomerKpis` type (não remover do data layer — outros consumidores podem usar; e o tab Perfil vai mostrar).

Em `apps/web/src/app/dashboard/customers/_components/customer-profile-form.tsx` (ou onde a tab Perfil renderiza), adicionar uma linha de metadado:

```
Dias como cliente: 182 (cadastrado em 12/05/2025)
```

Implementação prática: passar `kpis.daysSinceCreated` para o profile form via prop ou adicionar uma seção meta no top do form com `customer.createdAt`. Decisão na implementação: o mais simples é adicionar um pequeno bloco de metadados no top do `<CustomerProfileForm>` (ou no `CustomerHeader` se já tiver metadados expostos lá).

**Atalho aceito**: adicionar bloco "Cadastrado em DD/MM/YYYY · X dias como cliente" logo abaixo do nome no `<CustomerHeader>`. Não requer prop drilling adicional pois `CustomerHeader` já recebe o `customer` (com `createdAt`).

### 4. Customer tabs — confirmar (sem código)

`TabsList scrollable` já presente. Verificar via smoke se overflow mobile funciona. Se sim, não muda nada — apenas registrar na verificação.

## Não-objetivos

- Não toca `OrderActionsPanel` (seria spec separado — arquivo de 346 linhas exige análise dedicada).
- Não muda data layer (apenas presentation).
- Não adiciona feature nova (cancel/refund/etc).
- Não move `daysSinceCreated` para fora do `CustomerKpis` shape (mantém compat).

## Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/dashboard/orders/[id]/page.tsx` | usar `<PageHeader>`; remover "Voltar" |
| `apps/web/src/app/dashboard/orders/_components/order-timeline.tsx` | dot color por kind/status; data mono à direita |
| `apps/web/src/app/dashboard/customers/_components/customer-kpis-header.tsx` | 5→4 cards; remove "Dias como Cliente" |
| `apps/web/src/app/dashboard/customers/_components/customer-header.tsx` | bloco metadados "Cadastrado em + dias" |

## Verificação

1. `bun check-types` — pré-existentes drizzle dupe-version permitidos.
2. `bun dev:web` smoke:
   - `/dashboard/orders/[id]` (algum pedido seed): header padrão; só botão "Imprimir"; Timeline com dots coloridos.
   - `/dashboard/customers/[id]`: 4 KPI cards (grid 4-col em md+); header tem metadados "Cadastrado em … · N dias como cliente".
   - Tabs scrollable funciona em viewport estreito (resize browser).

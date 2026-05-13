# Spec D — Orders list redesign

**Data:** 2026-05-13
**Escopo:** redesign do `/dashboard/orders` (lista). Add KPIs operacionais no topo, polish Tabs, adicionar coluna "Itens" na tabela, remover "Voltar ao painel" do header.
**Precondições:** Specs A (filtros padronizados) + B (customers redesign + `<PendingList>` reuso) já em main.
**Status:** design aprovado pelo user via Visual Companion; aguardando revisão antes do plano.

## Contexto

`/dashboard/orders` já tem PendingList + ActivityFeed (introduzido antes do Spec B) — esses ficam intactos. O redesign foca em adicionar visibilidade de receita/conversão no topo (3 KPIs), polir as Tabs de status e enriquecer a tabela com a quantidade de itens por pedido. Também remove o botão "Voltar ao painel" (redundante — a sidebar tem link Dashboard).

## Decisões

### 1. Remover "Voltar ao painel" do header

Em `apps/web/src/app/dashboard/orders/page.tsx`, dentro da `action` do `<PageHeader>`, remover o `<Link>` "Voltar ao painel". Restará apenas o `<ExportCsvLink>` (condicionado por `canExport`).

### 2. KPI cards row (3 cards)

Adicionar uma `<section className="grid gap-3 md:grid-cols-3">` acima da seção `<PendingList>` + `<ActivityFeed>` com 3 cards:

| Card | Valor | Sub-label |
|------|-------|-----------|
| Receita Hoje | `SUM(totalAmount) WHERE status IN ('paid','preparing','shipped','delivered') AND date(createdAt) = current_date` | `+X% vs ontem` (delta em verde se positivo, vermelho se negativo) |
| Ticket Médio (30d) | `AVG(totalAmount) WHERE status IN ('paid','preparing','shipped','delivered') AND createdAt > now() - INTERVAL '30 days'` | `média mensal` |
| % Pagos (30d) | `COUNT FILTER (WHERE status IN ('paid','preparing','shipped','delivered')) / COUNT(*) * 100 WHERE createdAt > now() - INTERVAL '30 days'` | `últimos 30 dias` |

"Status pagos" = qualquer status pós-confirmação (paid, preparing, shipped, delivered). `canceled` e `refunded` ficam fora. `pending_payment` também fica fora — só conta receita confirmada.

Em `apps/web/src/app/dashboard/orders/data.ts`, adicionar:

```ts
export interface OrderKpis {
	revenueToday: number;
	revenueYesterday: number;
	averageTicket: number;
	paidPercent: number;
}

export async function getOrderKpis(): Promise<OrderKpis>;
```

Uma query com `COUNT(*) FILTER`/`SUM(...) FILTER`/`AVG(...) FILTER` agregando tudo em uma só execução.

Componente novo (não compartilhado): `apps/web/src/app/dashboard/orders/_components/order-kpis.tsx` — `<OrderKpis kpis={kpis} />`. Renderiza 3 `<Card>` com:
- Label uppercase pequeno
- Valor grande (`text-2xl font-medium tabular-nums`)
- Sub-label cinza ou colorido (delta)

Delta % vs ontem usa `Intl.NumberFormat("pt-BR", { signDisplay: "always" })`. Cor: `text-success` se ≥ 0, `text-destructive` se < 0. Se `revenueYesterday === 0`, mostrar "—" no sub-label.

### 3. Tabs polish

Em `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`, hoje cada tab usa `<TabsTrigger>` com `<Badge variant="secondary">{count}</Badge>` separado.

Manter o componente Tabs/TabsList existente (já é shadcn). Mudanças:
- Spacing: trocar `ml-1.5` da Badge para um `gap-2` no wrapper interno do trigger.
- Quando tab está ativa (`data-state=active`), o `count` ganha contraste maior (background mais saturado — usar `bg-primary text-primary-foreground` quando ativo, `bg-muted text-muted-foreground` quando inativo).
- Sem badge separado — usar `<span>` inline com background condicional via Tailwind, evita ruído visual de "componente dentro de componente".
- `TabsList` continua `scrollable` (já é). Não muda layout.

### 4. Tabela: +col "Itens"

Em `apps/web/src/app/dashboard/orders/_components/order-table.tsx`, adicionar coluna entre **Filial** e **Total**:

```tsx
<TableHead className="text-right">Itens</TableHead>
```

Cell:
```tsx
<TableCell className="text-right font-mono text-sm tabular-nums">
	{item.itemsCount}
</TableCell>
```

`OrderListItem` precisa ganhar `itemsCount: number`. Em `apps/web/src/app/dashboard/orders/data.ts`, adicionar à query SELECT um `(SELECT COUNT(*) FROM order_item oi WHERE oi.order_id = o.id)::int AS items_count` (ou um GROUP BY join — escolher o mais barato; o subquery é simples e cabe).

### 5. Tabela hint

Width recalibrado pela coluna adicional. `Itens` é numérico estreito (`w-16`/`text-right`). Demais larguras seguem o que está hoje — Tailwind grid responsivo cuida.

### 6. Preservar inalterado

- `<PendingList>` + `<ActivityFeed>` (mesmo padrão de orders).
- Filtros (search, datas, branch) — já padronizados no Spec A.
- Paginação (botões Próxima/Anterior).
- Server actions (cancelar, atualizar status, etc).

## Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/dashboard/orders/page.tsx` | remove "Voltar ao painel"; busca `getOrderKpis` no Promise.all; renderiza `<OrderKpisRow kpis={kpis} />` acima da seção PendingList |
| `apps/web/src/app/dashboard/orders/data.ts` | + `OrderKpis` interface + `getOrderKpis()`; + `itemsCount` no SELECT/mapping de `fetchOrdersPage` |
| `apps/web/src/app/dashboard/orders/_components/order-kpis.tsx` | **novo** — componente de 3 cards |
| `apps/web/src/app/dashboard/orders/_components/order-table.tsx` | +col "Itens" entre Filial e Total |
| `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` | Tabs polish (count inline com bg condicional, sem `<Badge>` separado) |

## Não-objetivos

- Não toca em `/dashboard/orders/[id]` (Spec C+E).
- Não muda contrato de tabs/querystring.
- Não adiciona KPI extra além dos 3.
- Não calcula KPIs por filial (só global).
- Não cache layer ainda (Next 16 `cacheTag` deixar p/ outro spec).

## Verificação

1. `bun check-types` — só pré-existente drizzle dupe-version permitido.
2. `bun dev:web` → `/dashboard/orders`:
   - Header sem "Voltar ao painel".
   - 3 KPI cards no topo (com valores reais ou "—" se sem dados).
   - PendingList + ActivityFeed intocados.
   - Tabs com count inline (ativo destacado).
   - Tabela tem coluna "Itens" entre Filial e Total.
3. `?tab=paid` — tabs muda foco, count integrado.
4. Filtros + paginação funcionam como antes.
5. `nextjs_call get_errors` retorna vazio.

## Próximos specs (referência)

- **Spec C+E** — Detalhes cliente/pedido (último do quarteto A/B/D/C+E).

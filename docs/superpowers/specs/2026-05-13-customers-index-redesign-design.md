# Spec B — Customers index redesign

**Data:** 2026-05-13
**Escopo:** redesign do `/dashboard/customers` (lista) para espelhar o padrão de header já usado em `/dashboard/orders` e melhorar a comunicação de status/saúde da base.
**Precondição:** Spec A já em main (DatePicker padrão + Limpar sempre visível + helpers de data extraídos).
**Status:** design aprovado pelo user via Visual Companion; aguardando revisão do spec antes do plano.

## Contexto

Hoje `/dashboard/customers` consiste apenas em `PageHeader → CustomerFilters → CustomerTable`. Não há overview operacional: o gestor precisa abrir a tabela e filtrar manualmente para descobrir bloqueados, cadastros incompletos, ou ver quem acaba de chegar à base.

`/dashboard/orders` resolve isso com um `<section className="grid lg:grid-cols-2">` contendo `PendingList` (buckets de pedidos aguardando ação) e `ActivityFeed` (mudanças de status recentes). Os dois componentes vivem em `apps/web/src/components/{pending-list,activity-feed}.tsx` e já são genéricos — basta alimentá-los com dados de cliente.

## Decisões

### 1. Header com 2 colunas (espelhando orders)

Acima dos filtros, adicionar:

```tsx
<section className="grid gap-3 lg:grid-cols-2">
  <PendingList title="Atenção em clientes" groups={pendingGroups} emptyMessage="..." />
  <ActivityFeed title="Atividade recente" events={activityEvents} emptyMessage="..." />
</section>
```

**Sem KPI cards numéricos acima.** A decisão segue "espelhar orders" — orders não tem KPI grid na listagem. KPI cards continuam restritos à página `[id]` (já existe `CustomerKpisHeader`).

#### PendingList — 4 buckets em 2 grupos

```ts
const pendingGroups: PendingGroup[] = [
  {
    title: "Aguardando ação",
    items: [
      { label: "Bloqueados", count: counts.blocked, href: "/dashboard/customers?status=blocked", role: "warning" },
      { label: "Sem documento (CPF/CNPJ)", count: counts.noDoc, href: "/dashboard/customers?missingDoc=1", role: "warning" },
    ],
  },
  {
    title: "Pendências",
    items: [
      { label: "Inativos c/ pedido em aberto", count: counts.inactiveWithOpenOrder, href: "/dashboard/customers?openOrderInactive=1", role: "info" },
      { label: "Novos sem email verificado", count: counts.unverifiedNew, href: "/dashboard/customers?unverifiedNew=1", role: "info" },
    ],
  },
];
```

#### ActivityFeed — 3 fontes mescladas

`getRecentCustomerActivity(limit = 8)` faz union/sort/take das 3 fontes:

- **`new_client`** — `SELECT id, name, createdAt FROM client ORDER BY createdAt DESC LIMIT N`.
- **`login`** — `SELECT clientId, MAX(createdAt) FROM clientSession GROUP BY clientId ORDER BY MAX(createdAt) DESC LIMIT N` joinado com `client.name`.
- **`first_order`** — pedidos cujo `clientId` aparece pela primeira vez (subquery `MIN(createdAt)`) e cuja primeira ocorrência foi nos últimos 7 dias.

Cada evento mapeia para `ActivityEvent`:

```ts
{ id, kind: "new_client" | "login" | "first_order", at: Date, primary: "Novo cadastro · {nome}" | "Login · {nome}" | "1ª compra · {nome}", href: "/dashboard/customers/{clientId}" }
```

Limit final = 8 após sort por `at desc`.

### 2. Tabela `customer-table.tsx`

- **Remover** coluna "Documento". O documento ainda é buscável via search (já entra no `q`) e visível no detalhe do cliente — não precisa da coluna principal.
- **Adicionar** coluna "Verificado" entre "Tipo" e "LTV", com badges duplos:
  - Email — `<Badge variant="success">✓ Email</Badge>` se `emailVerified=true`, senão `<Badge variant="secondary">✗ Email</Badge>`.
  - Documento — `<Badge variant="success">✓ Doc</Badge>` se `document != null`, senão `<Badge variant="secondary">— Doc</Badge>`.
- ARIA: label combinada na célula (`"Email verificado, documento pendente"`).

### 3. Querystring novos (sem UI nos filtros)

Acessíveis só via links do PendingList; não há controle no painel de filtros visual.

| Param | Comportamento |
|-------|---------------|
| `missingDoc=1` | `WHERE client.document IS NULL` |
| `openOrderInactive=1` | `WHERE client.status='inactive' AND EXISTS (SELECT 1 FROM "order" o WHERE o.client_id = client.id AND o.status IN ('pending_payment','preparing','shipped'))` |
| `unverifiedNew=1` | `WHERE client.emailVerified=false AND client.createdAt > now() - INTERVAL '14 days'` |

Atualizações:

- `apps/web/src/app/dashboard/customers/schema.ts` — adicionar `missingDoc`, `openOrderInactive`, `unverifiedNew` como booleans opcionais (coerce de `"1"|"0"`).
- `customer-filters.tsx` `TRACKED` keys — incluir os 3 (para o "Limpar filtros" limpá-los também).
- `data.ts` `listCustomers` — aplicar WHERE adicional quando flag presente.
- `page.tsx` `hasFilters` — incluir os 3.

### 4. Data layer (`customers/data.ts`)

Adicionar:

- `getCustomerPendingCounts()` → `Promise<{ blocked: number; noDoc: number; inactiveWithOpenOrder: number; unverifiedNew: number }>`. Uma query única com `COUNT(*) FILTER (WHERE ...)` para cada bucket.
- `getRecentCustomerActivity(limit = 8)` → `Promise<RecentClientActivity[]>` — union dos 3 SELECT, ordenado.
- Expor `emailVerified: boolean` em `CustomerListItem` (já está no schema; basta projetar).

### 5. `page.tsx`

```tsx
const [counts, recentActivity, result] = await Promise.all([
  getCustomerPendingCounts(),
  getRecentCustomerActivity(),
  listCustomers({ filters, cursor: null }),
]);
```

Renderizar a `<section grid lg:grid-cols-2>` antes dos filtros.

## Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/app/dashboard/customers/page.tsx` | adiciona section c/ PendingList + ActivityFeed; `Promise.all` p/ counts/activity |
| `apps/web/src/app/dashboard/customers/data.ts` | + `getCustomerPendingCounts`, `getRecentCustomerActivity`; `CustomerListItem.emailVerified`; aplica novos filtros em `listCustomers` |
| `apps/web/src/app/dashboard/customers/schema.ts` | + `missingDoc`, `openOrderInactive`, `unverifiedNew` (booleans coerce) |
| `apps/web/src/app/dashboard/customers/_components/customer-table.tsx` | -col Documento, +col Verificado (2 badges) |
| `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx` | TRACKED inclui os 3 novos flags |

## Não-objetivos

- Não toca a página `[id]` de cliente (Spec C+E).
- Não adiciona KPI cards numéricos no header.
- Não modifica auditoria de mudanças de status (tabela não existe; user não pediu).
- Não muda a paginação infinita.
- Não modifica o componente `<PendingList>` ou `<ActivityFeed>` — só consumimos.

## Verificação

1. `bun check-types`
2. `bun dev:web` → `/dashboard/customers` (sem querystring):
   - Header com 2 colunas: PendingList c/ 4 itens visíveis e contadores reais; ActivityFeed c/ 3 tipos de eventos mesclados.
   - Tabela: coluna "Documento" sumiu; coluna "Verificado" mostra 2 badges por linha.
3. Clicar cada link do PendingList → URL recebe o param correspondente; tabela aplica filtro; "Limpar filtros" volta a estado inicial.
4. `nextjs_call <port> get_errors` retorna vazio.

## Próximos specs (referência)

- **Spec D** — Orders list redesign (preservar PendingList + ActivityFeed; remover botão "Voltar ao painel").
- **Spec C+E** — Detalhes de cliente e pedido.

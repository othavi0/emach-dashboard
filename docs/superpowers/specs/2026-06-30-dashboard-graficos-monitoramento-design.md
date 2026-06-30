# Visão geral do dashboard: gráficos de monitoramento + filtros

> Spec de design. Redesenha a `/dashboard` para monitorar **Vendas, Pedidos e Estoque** de relance, cortando o que não serve, com filtro de período real e elevação visual (motion). Página de relatórios analíticos fica para depois (fora de escopo).

## 1. Objetivo

Hoje a `/dashboard` é uma tela única e densa: 5 KPIs, painel de pendências + feed, **6 gráficos** cobrindo 6 áreas com peso igual, e 1 filtro (filial) incompleto, sem filtro de período. O resultado mistura "o que preciso fazer agora" com "como o negócio vai" sem hierarquia — a queixa do dono: *coisa demais, relatório que não serve*.

Esta mudança foca a visão geral em **3 áreas de monitoramento** (Vendas, Pedidos, Estoque), adiciona o filtro que faltava (**período**), e eleva o tratamento visual dos gráficos que ficam. Curadoria + filtros + polimento — tudo dentro da `/dashboard`, sem rota nova.

### Não-objetivos (fora de escopo)

- **Página de relatórios analíticos dedicada** (`/relatorios`) — o dono fará depois. Os 4 gráficos cortados e suas queries **são preservados no código** (não deletar) para servirem de base a essa página futura.
- Mexer no par **Pendências + Atividade** (`PendingPanel` + `ActivityFeed`) — é acionável, ortogonal aos gráficos, e não era alvo da queixa. Mantido como está.
- Clientes, Reviews e Promoções como gráficos na overview — saem da tela (viram KPI/futura página).

## 2. Decisões (validadas com o dono)

| Eixo | Decisão |
|---|---|
| Uso | Painel de admin: serve operação **e** estratégia |
| Áreas monitoradas | **Vendas · Pedidos · Estoque** (núcleo). Clientes/Reviews/Promoções saem da overview |
| Arquitetura | Continua na `/dashboard` (sem rota nova); relatórios analíticos ficam para a página futura |
| KPIs | Tratamento **número + variação** (Δ% vs. período anterior). Sem sparkline em todos |
| Layout | **Principal + lateral**: Receita grande à esquerda + Funil de pedidos empilhado à direita; Estoque (fluxo + reposição) agrupado embaixo; par Pendências/Atividade no rodapé |
| Look de gráfico | **Rico**: gradiente coral, grid de referência sutil, média móvel tracejada, tooltip/crosshair no hover |
| Motion | Instalar **`motion`** (sucessor do framer-motion) para micro-interações, somado à animação nativa do recharts e ao `NumberTicker` |

## 3. O que sai, o que fica, o que entra

### Sai da composição da `/dashboard` (arquivos preservados)

- `NewClientsLine` (novos clientes/semana) + query `getNewClients`
- `RatingBars` (distribuição de notas) + query `getRatingDistribution`
- `StatusDonut` de ferramentas + query `getToolStatusBreakdown`
- `StatusDonut` de promoções + query `getPromotionStatusBreakdown`

Remove a `StrategicSection` inteira (menos o `StockFlowArea`, que migra para o bloco de Estoque) e o `RatingBars` da `TrendsSection`. **Os componentes lazy e as queries continuam no repositório** — apenas deixam de ser importados/compostos na `page.tsx`. Remover os imports correspondentes (senão `bun check`/biome quebra por import não-usado).

### Fica e é elevado (núcleo)

| Área | Componente | Mudança |
|---|---|---|
| Vendas | `RevenueArea` | Período-aware; look rico; bloco principal (col. esquerda 2/3) |
| Pedidos | `OrderFunnel` | Período-aware; empilhado na col. direita (1/3) |
| Estoque | `StockFlowArea` | Período-aware (ver §5 agregação); bloco de Estoque |
| Estoque | `ReorderTable` | Mantida; ao lado do `StockFlowArea` |

### Entra

1. **Filtro de período** — toggle `7d / 30d / 90d / 12m` na barra de filtros, via `?period=`. Refiltra todos os gráficos do núcleo **e** alimenta o Δ% dos KPIs (comparação com o período imediatamente anterior de mesma duração).
2. **KPIs recurados** — `Receita (período) +Δ%`, `Pedidos ativos`, `Rupturas de estoque`, `Ticket médio +Δ%`. Substituem os 5 KPIs atuais espalhados por 5 áreas.
3. **Motion** — biblioteca `motion`, aplicada com `MotionConfig reducedMotion="user"` no boundary do dashboard para herdar `prefers-reduced-motion`.

## 4. Arquitetura

### 4.1 Camada de dados (`packages/db/src/queries/dashboard.ts`)

> ⚠️ **Invariante (ADR-0009):** `queries/dashboard.ts` está na superfície de sync automática dashboard→ecommerce. Ele **não pode importar de fora de `queries/`** (incidente #88) e qualquer mudança abre PR no ecommerce. Manter helpers novos dentro de `queries/`.

- **Parametrizar o período.** As funções `getDailyRevenue`, `getOrderFunnel`, `getStockFlow` têm a janela hardcoded (`30 days`, `12 weeks`). Passam a receber um parâmetro de período. Definir um tipo único `DashboardPeriod = "7d" | "30d" | "90d" | "12m"` e um helper `periodToInterval(period)` (em `queries/`) que devolve `{ interval, bucket }` — `bucket` = `'day' | 'week' | 'month'` para a agregação adaptativa (§5).
- **Receita do período + Δ.** Hoje `getDashboardKpis` só tem `revenueToday`. Criar **`getDashboardSummary(db, branchId, period)`** que retorna os 4 KPIs do núcleo com valor do período corrente **e** do período anterior (para o Δ%): `revenue`, `orders` (vendas no período, base do ticket), `activeOrders`, `stockOutages`, `ticketMedio` (= revenue / orders, guardado contra divisão por zero). Comparação: período anterior = mesma duração imediatamente antes (`now() - 2*interval` a `now() - interval`).
- **`getReorderTable`** não é série temporal (é estado atual de estoque) → **não** recebe período; segue filtrável só por filial.
- `getDashboardKpis` original: se nada mais o consome após a recuração, removê-lo junto com o `KpiRow` antigo; senão, mantê-lo. Decidir no plano conferindo os call-sites.

### 4.2 Página (`apps/web/src/app/dashboard/page.tsx`)

- `searchParams` passa a ler `period` além de `branch`. Novo parser `parsePeriodParam` (default `30d`) em `_lib/`, espelhando `parseBranchParam`.
- Substituir `TrendsSection` + `StrategicSection` por duas seções enxutas:
  - **`SalesOrdersSection`** — grid `lg:grid-cols-[2fr_1fr]`: `RevenueArea` (card grande) à esquerda, `OrderFunnel` (card) à direita. Ambos recebem `period` + `branchId`.
  - **`StockSection`** — grid `lg:grid-cols-2`: `StockFlowArea` + `ReorderTable`. Aplicar a **section band** (`-mx-… border-y bg-muted/50`, DESIGN.md §5) numa das duas zonas de dado (máx 1 band por página) para ritmo vertical.
- `KpiRow` consome `getDashboardSummary`; renderiza os 4 KPIs do núcleo. Some o gating por `reviews/customers/promotions.read` da faixa de KPI (os 4 novos são do núcleo, sempre visíveis). O gating de capability continua valendo para o `PendingPanel` (abas de reviews/promoções).
- Barra de filtros do header ganha o **toggle de período** ao lado do `BranchFilter`.

### 4.3 Componentes

- **`PeriodFilter`** (novo, `_components/`) — toggle group no padrão do sistema (`Tabs` variant `default`, track `bg-muted` + ativa coral; DESIGN.md §4). Atualiza `?period=` preservando `?branch=` (e vice-versa no `BranchFilter`). Client component que faz `router.replace`.
- **`KpiCard`** — estender para aceitar `delta?: { pct: number; direction: "up" | "down" }` e renderizar a variação (verde `success` / vermelho `destructive`, **ícone + sinal + cor**, nunca só cor — DESIGN.md §7). Número segue com `NumberTicker`.
- **Charts elevados** (`RevenueArea`, `OrderFunnel`, `StockFlowArea`) — look rico via os wrappers `ChartContainer/ChartTooltip` do `@emach/ui` + tokens `--chart-1..5`. Gradiente coral no fill da área, grid horizontal sutil (`bg-border`), média móvel já existente como linha tracejada `--chart-2` (mustard), tooltip/crosshair no hover. Sem inventar paleta — usar os tokens.

### 4.4 Motion

- Adicionar `motion` ao `apps/web` (catalog se houver; senão versão fixada).
- Envolver a árvore do dashboard com `<MotionConfig reducedMotion="user">` para que toda animação `motion` herde `prefers-reduced-motion` (alinhado ao reset global de transitions do `globals.css` — DESIGN.md §7, AAA não-negociável).
- Uso **com propósito** (PRODUCT/register product: motion transmite estado, 150–250ms, sem orquestração decorativa de page-load):
  - Entrada em cascata leve dos KPI cards (stagger curto) na primeira renderização.
  - Transição suave do conteúdo dos gráficos ao **trocar o período/filial** (crossfade do dado), que é a interação onde o motion agrega.
  - Hover dos gráficos (crosshair/tooltip) — já coberto pelo recharts; motion só onde recharts não chega.
- **Não** animar para esconder conteúdo (reveal deve realçar default já visível — senão quebra em SSR/headless).

## 5. Agregação adaptativa (baixo volume)

Dado de produção é incerto (seed atual: 17 pedidos). Para o gráfico não ficar ralo nem ilegível, o `bucket` acompanha o período:

| Período | Bucket (`date_trunc`) | Eixo |
|---|---|---|
| 7d | `day` | dia |
| 30d | `day` | dia |
| 90d | `week` | semana |
| 12m | `month` | mês |

`StockFlowArea` hoje é sempre semanal; passa a seguir a mesma tabela. Datas de eixo via `localDate` (colunas `::date` viram string e `new Date('YYYY-MM-DD')` é meia-noite UTC → off-by-one em dev BR; DESIGN/db CLAUDE.md).

**Estados vazios** (período sem dado) ensinam, não dizem "vazio" (register product): cada card sem pontos mostra mensagem curta no idioma do domínio (ex: *"Sem vendas em 7 dias"*) em vez de eixo vazio. Skeleton no loading (já há `Suspense` por seção), nunca spinner no meio.

## 6. Gotchas / constraints

- **Sync ecommerce**: mudança em `queries/dashboard.ts` abre PR automático no ecommerce (ADR-0009). Sem import de fora de `queries/`.
- **`db.execute` raw**: timestamp vem como **string** e colunas em **snake_case** — aliasar `AS "camelCase"` e coercer datas (`localDate` para `::date`). Não `SELECT *`.
- **`"use server"`**: não re-exportar não-async de arquivo `"use server"` (quebra só no build). Reads de período ficam em `dashboard-data.ts` (server-only) e chamadas client passam por server action fina.
- **Sem PPR / sem `loading.tsx`** (ADR-0022): não habilitar `cacheComponents`; manter o padrão de navegação do #222.
- **Verificação obrigatória**: `tsc` não pega SQL inválido nem coluna removida. Após mexer em queries/SSR: `bun dev:web` + visitar `/dashboard` com cada período e filial, e o caminho sem dado. Gate final: `bun verify` (check-types + check + test) + `bun run build`.

## 7. Plano de verificação

1. `bun check-types` + `bun check` limpos (sem `any`, sem import órfão dos gráficos cortados).
2. Smoke visual na 3008 (dev server já rodando): cada período (7d/30d/90d/12m) × filial (todas / específica) refiltra os 3 gráficos e recalcula os KPIs + Δ%. Caminho de baixo volume mostra empty state, não erro.
3. `prefers-reduced-motion: reduce` (DevTools): nenhuma animação essencial some; transições zeram.
4. `bun run build` passa (gate de `"use server"`).
5. AAA preservado: contraste dos KPIs/Δ, foco visível, status = ícone+label+cor.

## 8. Sequência de implementação (alto nível; detalhar no plano)

1. Camada de dados: `DashboardPeriod` + `periodToInterval` + parametrizar `getDailyRevenue/getOrderFunnel/getStockFlow` + `getDashboardSummary` (com Δ e ticket).
2. `PeriodFilter` + `parsePeriodParam`; fiar `?period=` na página e nos fetchers.
3. Recurar `KpiRow`/`KpiCard` (4 KPIs + Δ) sobre `getDashboardSummary`.
4. Recompor `page.tsx` (layout C); remover `StrategicSection`/`RatingBars` da composição + imports.
5. Elevar look dos 3 gráficos (gradiente/grid/tooltip) com tokens.
6. `motion` + `MotionConfig`; stagger de KPI + transição de troca de filtro.
7. Empty states + smoke + `bun verify` + `build`.

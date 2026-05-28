# Spec — Redesign Sidebar + Dashboard

> Data: 2026-05-28
> Status: aprovado (brainstorming) → pronto para writing-plans
> Apps afetados: `apps/web` (dashboard admin), `packages/ui`, `packages/db/queries`
> Issue relacionada: [#77 — Refactor /dashboard/tools](https://github.com/othavioquiliao/emach-dashboard/issues/77) (fora de escopo deste spec)

## 1. Objetivo

Refatorar a navegação (sidebar) e a tela inicial (`/dashboard`) do dashboard
admin Emach. Hoje a sidebar não tem ícones, não colapsa no desktop, esconde
rotas operacionais (Estoque) e agrupa entidades de forma incoerente com o fluxo
de trabalho. O dashboard não tem nenhum gráfico nem KPI, subutilizando um schema
rico em dados operacionais (pedidos, estoque, clientes, avaliações, promoções).

O redesign entrega: navegação reagrupada por workflow com ícones + animações +
command palette (Cmd+K), e um dashboard orientado a ação com KPIs, gráficos e
filtro por filial, construído sobre Cache Components do Next 16 para performance
em uso intenso.

## 2. Não-objetivos (out of scope)

- **Refactor de `/dashboard/tools`** (separar cadastro de perfil de view de
  estoque) — rastreado na issue #77.
- **Implementar as rotas Banners e Notificações** — entram na sidebar como
  itens `disabled` ("em breve"); controlarão o site ecommerce quando existirem.
- **Religar os gates role-based (ADR-0012)** — o código já prevê branch-scoping
  (selector de filial), mas a aplicação de escopo por usuário continua no-op até
  a reativação documentada em `docs/adr/0012-disable-role-based-gates.md`.
- **Anonimização LGPD** e outros gaps pré-produção listados em `packages/db/CLAUDE.md`.

## 3. Decisões travadas (brainstorming)

| Tema | Decisão |
|---|---|
| Escopo | Sidebar + dashboard num único spec |
| Lib de animação | `motion` (sucessor do framer-motion) como base + magicui **pontual** (copiar componente shadcn-style, sem instalar registry inteiro) |
| Modo desktop da sidebar | Toggle expanded (256px) ↔ icon-only (64px); estado em cookie; tooltip no hover em icon-only |
| Cmd+K | Completo: navegação + busca de entidades + ações rápidas |
| Footer | Avatar (iniciais) + dropdown (Perfil, Sair); **sem** toggle de tema |
| Tom do motion | Sutil e rápido (150–250ms ease-out); respeita `prefers-reduced-motion` |
| Escopo dashboard | Completo, **faseado** no plano de implementação (F1/F2/F3) |
| Filtro de filial | Selector global no topo, persistido em URL param |
| Estratégia de dados | Cache Components Next 16 (`use cache` + `cacheLife` + `cacheTag`/`revalidateTag`) + Suspense streaming |

## 4. Sidebar

### 4.1 Information Architecture

```
VISÃO              OPERAÇÃO           CATÁLOGO          RELACIONAMENTO         ADMINISTRAÇÃO
□ Dashboard        □ Pedidos    [N]   □ Ferramentas     □ Clientes             □ Usuários  [N]
                   □ Estoque    [N]   □ Categorias      □ Avaliações  [N]
                   □ Filiais          □ Fornecedores    □ Promoções
                                                        ○ Banners      (em breve)
                                                        ○ Notificações (em breve)
```

Mudanças vs. estado atual:

- **Estoque** entra no menu como rota canônica `/dashboard/stock` (hoje só
  acessível pelos atalhos do dashboard). O badge "repor" migra de Ferramentas
  para Estoque — semanticamente o sinal de reposição é de estoque, não de
  catálogo.
- **Filiais** move de Catálogo → Operação (filial é entidade operacional:
  endereço, gerente, faixa de CEP, estoque próprio).
- **Promoções** move de "Site" → Relacionamento. O grupo "Site" é extinto.
- **Banners** e **Notificações** entram em Relacionamento como `disabled`; quando
  implementados, controlarão banners e notificações do site ecommerce.
- O grupo **Administração** (era "Internos") só renderiza quando `canManageUsers`.

### 4.2 Comportamento

- **Desktop:** `Sidebar collapsible="icon"` (shadcn). Botão de toggle no header
  alterna expanded/icon-only. Estado persistido em cookie (padrão `SidebarProvider`
  do shadcn já suporta via `defaultOpen` + cookie). Em icon-only, cada item mostra
  só o ícone; hover dispara `Tooltip` com label + badge.
- **Mobile:** sheet overlay (mantém comportamento atual).
- **Ícones:** `lucide-react` (já instalado), um por item de nav.
- **Active indicator:** `motion` com `layoutId` compartilhado deslizando suave
  entre itens ao trocar de rota (sutil).
- **Footer (`sidebar-footer-user.tsx`):** `Avatar` com iniciais + nome + `RoleBadge`.
  Clique abre `DropdownMenu` com **Perfil** (`/dashboard/users/[selfId]` ou rota de
  perfil) e **Sair** (lógica de signOut atual preservada). Em icon-only, mostra só
  o avatar; dropdown abre ao clicar.

### 4.3 Badges

Calculados server-side e passados como props (como hoje `pendingCount`/`reporCount`):

| Item | Badge | Fonte |
|---|---|---|
| Pedidos | pendentes (pending_payment + paid + preparing) | `counts.orders` (existe) |
| Estoque | repor + ruptura | `stock_level` (qty ≤ reorder_point; qty = 0) |
| Avaliações | moderação | `counts.reviews` (existe) |
| Usuários | pending approval | `pendingCount` (existe) |

### 4.4 Command palette (Cmd+K)

- Botão de busca no topo da sidebar + atalho global `Cmd/Ctrl+K`.
- Usa `command.tsx` (shadcn) já instalado, dentro de um `Dialog`.
- Três grupos:
  1. **Navegação** — rotas do menu (pular para Pedidos, Estoque, etc.).
  2. **Busca** — ferramentas / pedidos / clientes por nome, via server action
     `globalSearch(query)` com debounce (~250ms). Resultados levam à rota da entidade.
  3. **Ações** — atalhos: novo pedido, nova ferramenta, nova promoção, etc.
- `globalSearch` segue padrão `ActionResult<T>`; preparado para branch-scoping
  quando os gates religarem (assinatura já recebe contexto de filial).

## 5. Dashboard

### 5.1 Layout faseado

**Fase 1 — núcleo operacional (entrega valor imediato):**

- **Linha 1 — Hero KPIs (6 cards):**
  | KPI | Fonte | Observação |
  |---|---|---|
  | Receita do Dia | `order` (status paid/preparing/shipped/delivered) | `SUM(total_amount)` do dia |
  | Pedidos Ativos | `counts.orders` (existe) | card clicável → aba Pedidos |
  | Reviews Pendentes | `counts.reviews` + `MIN(created_at)` | subtexto "mais antiga: Xh" (SLA) |
  | Rupturas de Estoque | `stock_level` (qty = 0) | cor destructive |
  | Clientes Ativos | `client` (status = active) | contexto de base |
  | Promoções Ativas | `promotion` | badge "+N expirando 7d" |
- **Linha 2 — ação imediata (mantém layout atual, 2 colunas):**
  - `PendingPanel` evoluído → 4 abas: **Estoque** (ruptura vermelho ≠ repor laranja,
    contadores separados) · **Pedidos** · **Moderação** · **Promoções expirando** (≤7d).
  - `ActivityFeed` mantido como está.
- **Selector global de filial** logo abaixo do hero text, acima dos KPIs;
  persistido em URL param; todos os charts/tabelas das fases seguintes respondem a ele.

**Fase 2 — tendências:**

- **Receita Diária 30d** (area, full width) — com média móvel 7d.
- **Funil de Status de Pedidos** (funnel, half) — `GROUP BY status` ordenado por
  `ARRAY_POSITION` (enum tem ordem de ADD VALUE, não lógica).
- **Distribuição de Notas 1–5★** (bar, half) — reviews aprovadas últimos 30d.
- **Itens Abaixo do Ponto de Reposição por Filial** (tabela, full) — cada linha é
  uma ordem de compra; linhas com qty = 0 em vermelho.

**Fase 3 — contexto estratégico:**

- **Ferramentas por Status** (donut, third) — draft/active/discontinued/out_of_stock.
- **Novos Clientes 90d** (line, third) — `DATE_TRUNC('week')`.
- **Status de Promoções** (donut, third) — ativa/agendada/expirada.
- **Entradas × Saídas de Estoque 12 semanas** (area, full) — `SUM(delta)` por
  reason group em `stock_movement`.

### 5.2 Métricas deliberadamente fora do dashboard

Movidas para telas específicas por serem caras, vanity ou pouco acionáveis no
dia a dia (decisão da análise de dados):

- **Margem bruta** (Top Ferramentas por Receita): `order_item.cost` é nullable →
  `COALESCE(cost,0)` produz margem falsa. Vai para `/dashboard/tools` com tooltip
  de aviso, se implementada.
- Tempo médio entre transições de status → `/dashboard/orders` (precisa índice
  adicional em `order_status_history`).
- Taxa de aprovação de reviews, nota média por produto → `/dashboard/reviews`.
- PF vs PJ, distribuição geográfica → `/dashboard/customers`.
- Ranking de usuários ativos, ações destrutivas por filial, feed por ator →
  `/dashboard/audit` ou `/dashboard/users/[id]`.
- Histórico de criação de promoções, cobertura de catálogo → telas respectivas.

### 5.3 Componentes de gráfico

- Usar `chart.tsx` (wrapper shadcn sobre Recharts) já instalado em `@emach/ui`.
- Cada chart é client island recebendo dados já agregados via props (Server
  Component faz o fetch).

## 6. Performance

- **Cache Components (Next 16):** queries de tendência usam `use cache` +
  `cacheLife` (5–15min) + `cacheTag` por domínio (`'orders'`, `'stock'`,
  `'reviews'`, `'clients'`, `'promotions'`). Mutations chamam `revalidateTag`
  (padrão já existente no projeto em orders/customers).
- **KPIs realtime** ficam dinâmicos (PPR) — não cacheiam, ou cacheiam por ~60s.
- **Suspense streaming:** cada seção (KPIs, painéis, cada grupo de charts) em
  `<Suspense>` com skeleton; KPIs aparecem primeiro, charts depois.
- **Boundaries de dados:** queries via `db.execute` coercem timestamp com `toDate`
  (`@emach/db/utils`) e usam alias `AS "camelCase"` (gotchas mapeados em
  `packages/db/CLAUDE.md`). Preferir `db.select().from(...)` onde possível para
  passar pelo column mapper.
- A página deixa de ser `force-dynamic` global.

## 7. Sistema de animação

- **Dependência nova:** `motion` (adicionar ao catalog do workspace).
- Import `motion/react` em client islands; usar `motion/react-client` onde der
  para reduzir JS entregue.
- **`LazyMotion` + `domAnimation`** para bundle enxuto (usar `m.*` em vez de
  `motion.*` nos componentes cobertos).
- **`useReducedMotion`** global — quando ativo, troca animações de posição (x/y,
  collapse) por fade de opacity. Há exemplo oficial de Sidebar na doc.
- Compatível com React Compiler (motion não depende de `useMemo` manual; o
  compiler memoiza automaticamente).
- **Aplicações:** collapse da sidebar (width), fade de tooltip, stagger leve ao
  montar grupos de nav, active indicator com `layoutId`, `NumberTicker`
  (magicui copiado) nos KPIs. magicui só pontual; avaliar `BorderBeam` em alerta
  crítico de ruptura.

## 8. Arquivos e mudanças previstas

**Novos / refatorados (sidebar):**
- `apps/web/src/app/dashboard/_components/nav-config.ts` — config tipada
  (grupos, itens, ícones, badges, scope, flag disabled).
- `nav-group.tsx`, `nav-item.tsx` — extraídos de `app-sidebar.tsx`.
- `sidebar-footer-user.tsx` — avatar + dropdown.
- `command-palette.tsx` — Cmd+K.
- `app-sidebar.tsx` — orquestra os acima (mais enxuto).

**Novos (dashboard):**
- `apps/web/src/app/dashboard/page.tsx` — reescrito com Suspense + selector filial.
- `_components/kpi-cards.tsx`, `_components/charts/*.tsx` (um por gráfico),
  `_components/branch-filter.tsx`.
- `packages/db/src/queries/dashboard.ts` — queries agregadas (com gotchas tratados),
  assinatura `db` parametrizado, sem `select *`.
- `apps/web/src/app/dashboard/actions.ts` — novas actions (`globalSearch`, fetchers
  dos charts) seguindo `ActionResult<T>`.

**Dependências:**
- `motion` (catalog). Avaliar instalar em `packages/ui` (compartilhável) vs `apps/web`.

## 9. Critérios de aceitação

- Sidebar reagrupada nos 5 grupos, com ícones, badges corretos, e toggle
  expanded/icon-only persistido em cookie, com tooltips em icon-only.
- Cmd+K abre via atalho e botão, navega rotas e busca entidades.
- Footer com avatar + dropdown (Perfil, Sair), sem toggle de tema.
- Dashboard F1 entregue: 6 KPIs + PendingPanel de 4 abas + ActivityFeed +
  selector de filial funcional.
- Charts F2/F3 renderizam com dados reais, respondem ao filtro de filial.
- `bun check-types` passa; nenhuma violação dos anti-patterns banidos
  (`console.*`, `any`, `key={index}`, `<img>` puro, `useMemo` manual, etc.).
- `prefers-reduced-motion` respeitado.
- Verificação visual nas rotas afetadas (não confiar só em check-types — gotcha
  de SQL em template strings).

## 10. Riscos e mitigações

- **Cache Components ainda evoluindo no Next 16** — seguir skill
  `next-cache-components`; começar conservador (cacheLife curto) e ajustar.
- **`db.execute` snake_case / timestamp string** — risco de runtime invisível ao
  tsc; mitigar com `toDate` + alias e smoke run em cada rota.
- **Bundle do motion** — mitigar com `LazyMotion`/`m.*` e client islands focados.
- **Branch filter sem gates** — hoje todo user vê todas filiais; o selector é
  cosmético até religar ADR-0012, mas deixa o terreno pronto. Documentar isso.
- **Escopo grande** — plano faseado (F1/F2/F3) permite parar com valor entregue
  a qualquer momento.

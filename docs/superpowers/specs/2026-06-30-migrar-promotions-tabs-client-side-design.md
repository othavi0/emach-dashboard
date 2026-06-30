# Design — Migrar `promotions/[id]` para tabs client-side (Fase 1 do #261)

**Data:** 2026-06-30
**Status:** Aprovado (pendente review do spec)
**Issue:** #261 (épico) — Fase 1
**Relaciona:** ADR-0024, spec/plano da fundação (`docs/superpowers/{specs,plans}/2026-06-29-generalizar-tabs-client-side*`). PR #264 (fundação, mergeável).

## Contexto

A fundação (`EntityClientTabs` + `useLazyTab`/`LazyTab` + `useActiveTab`/`useSetActiveTab` + `buildTabHref`) está pronta e provada no piloto `tools/[id]`. `promotions/[id]` é a 1ª das 8 migrações — a mais simples: 2 tabs, ambas derivam de `getPromotion(id)` (zero fetch separado), nenhuma tab condicional, nenhum search param além de `?tab=`.

## Decisão

Migrar `promotions/[id]` de `EntityTabs` (server-nav) para `EntityClientTabs` (client-side), seguindo o playbook do plano-mãe. Quatro mudanças:

### 1. Shell (`page.tsx`)

Trocar `EntityTabs` → `EntityClientTabs`. O `<PromotionIdentity actions={...} detail={...} />` (header) passa a ser renderizado **dentro** da prop `header` do shell (para o Context de tab ativa alcançar a ação). `initialTab` clampado no server (`KNOWN_TABS = {overview, tools}`, default `overview`). `clearParams` omitido (promotions só tem `?tab=`).

### 2. Tabs (eager + render-lazy)

- `overview` — eager: `content: <OverviewTab detail={detail} />` (markup montado desde o início).
- `tools` — `lazy: true`, **sem loader/action**: `content: <ToolsTab detail={detail} />`. O dado já está em `detail.tools`; o `lazy: true` do shell só adia o *montar do markup* até a 1ª ativação — reproduzindo o atual `isToolsTab ? <ToolsTab/> : null`, agora 100% client-side. Badge de contagem (`detail.tools.length`) permanece na definição da tab.

### 3. Header reativo (`PromotionDetailActions`, novo `"use client"`)

Espelha `ToolDetailActions` do piloto. Lê `useActiveTab()`:
- tab `tools` → `<Link href="/dashboard/promotions/${id}/edit">Gerenciar ferramentas</Link>`.
- caso contrário → `<PromotionHeaderActions canDelete={canDelete} promotion={detail} />`.

A decisão sai do server (`isToolsTab`) e vai para o cliente. O `page.tsx` passa esse componente (mais o `id`/`canDelete`/`detail` que ele precisa) ao `actions` do `PromotionIdentity`.

### 4. `switchTab` no `KpiItem` (fundação — reutilizável)

O KPI "Alcance" (`overview-tab.tsx`) hoje usa `href: ?tab=tools` quando `!appliesToAll` — dispararia RSC. Adicionar à fundação:

- `KpiItem` ganha campo opcional **`switchTab?: string`** (`components/entity/entity-kpis-row.tsx`).
- Quando `item.switchTab` está presente, o `EntityKpisRow` (Server Component) envolve o card num pequeno **`KpiSwitchTabLink`** (`"use client"`, novo): um `<button>` que chama `useSetActiveTab(item.switchTab)` no clique. Precedência: `switchTab` > `href` > sem wrapper.
- `overview-tab.tsx`: o KPI "Alcance" troca `href: .../?tab=tools` por `switchTab: "tools"`.

Aditivo e de baixo risco (campo opcional; as 7 páginas que usam `EntityKpisRow` não passam `switchTab` → comportamento idêntico). O `KpiSwitchTabLink` só funciona dentro de um `EntityClientTabs` (que provê o Context) — o que é o caso aqui.

## Raio de impacto

**Criar:**
- `promotions/[id]/_components/promotion-detail-actions.tsx` (`"use client"`).
- `components/entity/kpi-switch-tab-link.tsx` (`"use client"`).

**Alterar:**
- `promotions/[id]/page.tsx` — shell, header dentro, `initialTab`, ação client.
- `promotions/[id]/_components/overview-tab.tsx` — KPI "Alcance" `href` → `switchTab`.
- `components/entity/entity-kpis-row.tsx` — campo `switchTab` + branch de render.

**Intacto:** `OverviewTab`/`ToolsTab` (continuam Server Components, passados como `content`); `PromotionHeaderActions`; `getPromotion`; `EntityTabs` (ainda usado pelas outras 7 páginas).

## Trade-offs

- A 1ª carga renderiza o markup da overview (eager) + adia o de tools (lazy-render) — igual ou melhor que hoje.
- Tocar `EntityKpisRow` (compartilhado) é o único risco; mitigado por ser campo opcional e o branch novo só ativar com `switchTab`.

## Verificação

- `bun verify` (check-types + check + test) **e** `bun run build`.
- Smoke no browser (dev `:3007`): trocar overview↔tools = **0 requests** RSC; URL `?tab=tools` via `history.replaceState`; deep-link `?tab=tools` abre direto; header alterna (Gerenciar ferramentas só em tools); KPI "Alcance" (quando `!appliesToAll`) troca para a tab tools **sem RSC**; ações de promoção (pausar/duplicar/excluir) seguem funcionando.

## Fora de escopo

- As outras 7 páginas (Fases 2–8).
- Mover `SwitchTabButton` (do #260) para a fundação — separado; aqui só o caminho de KPI.

# Migrar `promotions/[id]` para tabs client-side — Plano (Fase 1 do #261)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (escolhido: inline) para implementar task-a-task. Steps usam checkbox (`- [ ]`).

**Goal:** Migrar `promotions/[id]` de `EntityTabs` (server-nav) para `EntityClientTabs` (client-side), com o KPI "Alcance" trocando de tab sem RSC.

**Architecture:** Espelha o piloto `tools/[id]`. Adiciona à fundação um caminho de KPI→tab (`switchTab` no `KpiItem` + `KpiSwitchTabLink` client). O header vira reativo via `useActiveTab`. As duas tabs derivam de `getPromotion` (zero fetch lazy).

**Tech Stack:** Next 16, React 19 (Compiler ativo), Base UI Tabs, vitest `environment: node` (markup via `renderToStaticMarkup`), `EntityClientTabs`/`useActiveTab`/`useSetActiveTab` (fundação, `components/entity/`).

## Global Constraints

- Sem `: any`/`as any`/`@ts-ignore`. Sem `console.*`. React Compiler (sem `useMemo`/`useCallback`/`forwardRef`). `key` estável.
- `"use client"` no topo de componentes com hook. Client Component nunca importa fn `server-only`/`@emach/db` (tipos via `import type`).
- Gate: `bun --cwd apps/web check-types && bun check && bun --cwd apps/web test && bun run build` (este último é o gate do `"use server"`). CWD = raiz do monorepo.
- Verificação de comportamento client = smoke no browser (dev `:3007`): eager 0 requests; deep-link; header reativo; KPI sem RSC. `check-types` não pega runtime.
- `KpiSwitchTabLink` só funciona dentro de um `EntityClientTabs` (provê o Context de `useSetActiveTab`).

---

## File Structure

- **Criar** `apps/web/src/components/entity/kpi-switch-tab-link.tsx` — wrapper client que troca a tab no clique.
- **Modificar** `apps/web/src/components/entity/entity-kpis-row.tsx` — campo `switchTab?` + branch de render.
- **Criar/Modificar** `apps/web/src/components/entity/entity-kpis-row.test.tsx` — markup do branch switchTab.
- **Criar** `apps/web/src/app/dashboard/promotions/[id]/_components/promotion-detail-actions.tsx` — ação de header reativa.
- **Modificar** `apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx` — KPI "Alcance" `href` → `switchTab`.
- **Modificar** `apps/web/src/app/dashboard/promotions/[id]/page.tsx` — shell `EntityClientTabs`, header dentro, `initialTab`, tabs eager/lazy-render, ação client.

---

### Task 1: `switchTab` no `KpiItem` + `KpiSwitchTabLink` (fundação)

**Files:**
- Create: `apps/web/src/components/entity/kpi-switch-tab-link.tsx`
- Modify: `apps/web/src/components/entity/entity-kpis-row.tsx`
- Test: `apps/web/src/components/entity/entity-kpis-row.test.tsx`

**Interfaces:**
- Consumes: `useSetActiveTab(): (tab: string) => void` de `./entity-client-tabs`.
- Produces: `KpiItem` ganha `switchTab?: string`. `KpiSwitchTabLink({ tab, className, children })` client.

- [ ] **Step 1: Escrever o teste de markup (falha)**

```tsx
// apps/web/src/components/entity/entity-kpis-row.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EntityKpisRow } from "./entity-kpis-row";

describe("EntityKpisRow", () => {
  it("renderiza um <a> quando o item tem href", () => {
    const html = renderToStaticMarkup(
      <EntityKpisRow items={[{ label: "Alcance", value: 3, href: "/x?tab=tools" }]} />
    );
    expect(html).toContain("<a");
    expect(html).toContain('href="/x?tab=tools"');
  });

  it("renderiza um <button> (não <a>) quando o item tem switchTab", () => {
    const html = renderToStaticMarkup(
      <EntityKpisRow items={[{ label: "Alcance", value: 3, switchTab: "tools" }]} />
    );
    expect(html).toContain("<button");
    expect(html).not.toContain("<a");
  });

  it("switchTab tem precedência sobre href", () => {
    const html = renderToStaticMarkup(
      <EntityKpisRow
        items={[{ label: "Alcance", value: 3, href: "/x", switchTab: "tools" }]}
      />
    );
    expect(html).toContain("<button");
    expect(html).not.toContain("<a");
  });
});
```

- [ ] **Step 2: Rodar — deve falhar** — `bun --cwd apps/web test entity-kpis-row` → FAIL (sem `switchTab`/`<button>`).

- [ ] **Step 3: Criar `kpi-switch-tab-link.tsx`**

```tsx
// apps/web/src/components/entity/kpi-switch-tab-link.tsx
"use client";

import type { ReactNode } from "react";
import { useSetActiveTab } from "./entity-client-tabs";

interface Props {
  children: ReactNode;
  className?: string;
  tab: string;
}

/**
 * Envolve um card de KPI num botão que troca a tab ativa do EntityClientTabs
 * client-side (via useSetActiveTab → history.replaceState), sem disparar RSC.
 */
export function KpiSwitchTabLink({ children, className, tab }: Props) {
  const setActiveTab = useSetActiveTab();
  return (
    <button className={className} onClick={() => setActiveTab(tab)} type="button">
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Modificar `entity-kpis-row.tsx`** — adicionar `switchTab?: string` ao `KpiItem` e o branch de render (precedência `switchTab` > `href`).

No `interface KpiItem`, após `href?: string;` adicionar `switchTab?: string;`. No retorno do `.map`, trocar o bloco `{item.href ? (...) : inner}` por:

```tsx
{item.switchTab ? (
  <KpiSwitchTabLink
    className="block h-full w-full text-left transition-opacity hover:opacity-80"
    tab={item.switchTab}
  >
    {inner}
  </KpiSwitchTabLink>
) : item.href ? (
  <Link
    className="block h-full transition-opacity hover:opacity-80"
    href={item.href}
  >
    {inner}
  </Link>
) : (
  inner
)}
```

E adicionar o import no topo: `import { KpiSwitchTabLink } from "./kpi-switch-tab-link";`

- [ ] **Step 5: Rodar — deve passar** — `bun --cwd apps/web test entity-kpis-row` → PASS (3 testes). Depois `bun --cwd apps/web check-types`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/entity/kpi-switch-tab-link.tsx apps/web/src/components/entity/entity-kpis-row.tsx apps/web/src/components/entity/entity-kpis-row.test.tsx
git commit -m "feat(entity): switchTab no KpiItem (atalho KPI->tab client-side)"
```

---

### Task 2: `PromotionDetailActions` (header reativo)

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/[id]/_components/promotion-detail-actions.tsx`

**Interfaces:**
- Consumes: `useActiveTab(): string` de `@/components/entity/entity-client-tabs`; `PromotionHeaderActions` (existente); `PromotionDetail` (tipo).
- Produces: `PromotionDetailActions({ canDelete, detail })` client — espelha `ToolDetailActions`.

**Verificação:** sem teste unit (depende do Context de `useActiveTab` + renderiza `PromotionHeaderActions`, que usa `useRouter`/`useTransition` — frágil em `renderToStaticMarkup`). Verificado no smoke (Gate final).

- [ ] **Step 1: Ler os arquivos de referência** — `tools/[id]/_components/tool-detail-actions.tsx` (padrão) e `promotions/[id]/_components/promotion-header-actions.tsx` (props exatos: `canDelete`, `promotion`). E `page.tsx` para o tipo de `detail` (`PromotionDetail`) e o `id`.

- [ ] **Step 2: Criar `promotion-detail-actions.tsx`**

```tsx
// apps/web/src/app/dashboard/promotions/[id]/_components/promotion-detail-actions.tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { useActiveTab } from "@/components/entity/entity-client-tabs";
import type { PromotionDetail } from "../../_lib/promotions-data";
import { PromotionHeaderActions } from "./promotion-header-actions";

interface Props {
  canDelete: boolean;
  detail: PromotionDetail;
}

/**
 * Ação contextual do header. Na tab "tools" mostra "Gerenciar ferramentas"
 * (rota /edit); nas demais, as ações de promoção. A tab ativa vem do contexto
 * client do EntityClientTabs (sem re-render do servidor ao trocar de tab).
 */
export function PromotionDetailActions({ canDelete, detail }: Props) {
  const tab = useActiveTab();
  if (tab === "tools") {
    return (
      <Link
        className={buttonVariants({ variant: "default" })}
        href={`/dashboard/promotions/${detail.id}/edit`}
      >
        <Settings2 aria-hidden className="mr-1.5 size-4" />
        Gerenciar ferramentas
      </Link>
    );
  }
  return <PromotionHeaderActions canDelete={canDelete} promotion={detail} />;
}
```

> Ajustar o `import type { PromotionDetail } from ...` para o caminho real onde `PromotionDetail` é exportado (descobrir no Step 1 — provavelmente `../../_lib/promotions-data` ou similar).

- [ ] **Step 3: `check-types`** — `bun --cwd apps/web check-types` → limpo. (Sem commit isolado; fecha junto com a Task 3, que é o consumidor.)

---

### Task 3: Migrar `page.tsx` + KPI "Alcance" (shell client)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx`

**Interfaces:**
- Consumes: `EntityClientTabs`, `EntityClientTab` de `@/components/entity/entity-client-tabs`; `PromotionDetailActions` (Task 2).

- [ ] **Step 1: Ler `page.tsx` e `overview-tab.tsx` atuais** antes de editar (Read; não editar de memória).

- [ ] **Step 2: `overview-tab.tsx`** — no KPI "Alcance", trocar a propriedade `href: detail.appliesToAll ? undefined : \`/dashboard/promotions/${detail.id}?tab=tools\`` por `switchTab: detail.appliesToAll ? undefined : "tools"`. Remover o cálculo de `href` desse item.

- [ ] **Step 3: `page.tsx`** — aplicar a migração:
  1. Trocar import `{ type EntityTab, EntityTabs }` de `@/components/entity/entity-tabs` por `{ type EntityClientTab, EntityClientTabs }` de `@/components/entity/entity-client-tabs`.
  2. Trocar o tipo `tabs: EntityTab[]` → `EntityClientTab[]`. Na tab `tools`, trocar `content: isToolsTab ? <ToolsTab detail={detail} /> : null` por `content: <ToolsTab detail={detail} />` **e** adicionar `lazy: true`. Remover o `isToolsTab` (não mais necessário para `content`).
  3. Calcular `initialTab` no server: `const KNOWN_TABS = new Set(["overview", "tools"]); const initialTab = sp.tab && KNOWN_TABS.has(sp.tab) ? sp.tab : "overview";`.
  4. Trocar `headerAction` (o ternário `isToolsTab ? <Link/> : <PromotionHeaderActions/>`) por `<PromotionDetailActions canDelete={canDelete} detail={detail} />`. Remover os imports agora órfãos no `page.tsx` (`Link`, `buttonVariants`, `Settings2`, `PromotionHeaderActions`) **se** não usados em outro ponto.
  5. Render: mover o `<PromotionIdentity actions={...} detail={detail} />` para **dentro** da prop `header` do `EntityClientTabs`, e trocar `<EntityTabs defaultValue="overview" tabs={tabs} />` por:

  ```tsx
  <EntityClientTabs
    defaultValue="overview"
    header={
      <PromotionIdentity
        actions={<PromotionDetailActions canDelete={canDelete} detail={detail} />}
        detail={detail}
      />
    }
    initialTab={initialTab}
    tabs={tabs}
  />
  ```

  (O wrapper `<div className="flex flex-col gap-6 p-6">` externo permanece; o `EntityClientTabs` já tem seu próprio `gap-4` interno entre header e tabs.)

- [ ] **Step 4: Gate estático** — da raiz:

```bash
bun --cwd apps/web check-types && bun check && bun --cwd apps/web test && bun run build
```
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions
git commit -m "feat(promotions): migra detalhe para tabs client-side (Fase 1 do #261)"
```

---

### Gate final — smoke de equivalência no browser (controller)

Com dev `:3007` de pé e autenticado, abrir `http://localhost:3007/dashboard/promotions/<id>` (escolher uma promoção com `!appliesToAll` para exercitar o KPI "Alcance"). Via network/Resource Timing:

- [ ] Trocar overview ↔ tools (triggers de tab) → **0 requests** RSC; URL vira `?tab=tools` via `history.replaceState` (sem `_rsc=`).
- [ ] Header alterna: "Gerenciar ferramentas" só na tab tools; ações de promoção (Editar/Pausar/Duplicar/Excluir) nas demais.
- [ ] Deep-link `?tab=tools` abre a tab tools direto.
- [ ] KPI "Alcance" (quando `!appliesToAll`) → clicar troca para a tab tools **sem request RSC**.
- [ ] Voltar/avançar do browser (popstate) sincroniza a tab.
- [ ] Ações de promoção (pausar/duplicar) seguem revalidando.

Qualquer divergência = regressão; corrigir antes de fechar.

---

## Self-review

- **Cobertura do spec:** shell (Task 3) ✓ · tabs eager+lazy-render (Task 3) ✓ · header reativo (Task 2) ✓ · `switchTab`/`KpiSwitchTabLink` (Task 1) ✓ · KPI "Alcance" migrado (Task 3) ✓.
- **Sem placeholders:** código completo nas peças novas; Edits descritos com precedência e local exatos (page/overview lidos no Step 1 de cada).
- **Consistência de tipos:** `switchTab`/`KpiSwitchTabLink`/`PromotionDetailActions`/`EntityClientTab` usados de forma consistente. `PromotionDetail` import a confirmar no Step 1 da Task 2.
- **Constraints:** TDD via markup onde dá (Task 1); header/page por smoke+build; `bun run build` no gate.

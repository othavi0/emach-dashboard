# Generalizar tabs client-side — Plano de implementação (Fase 0: Fundação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair a fundação compartilhada de tabs client-side (`EntityClientTabs` + `useLazyTab`/`<LazyTab>` + `buildTabHref`) do piloto `tools/[id]` e religar o piloto a ela, provando equivalência antes de migrar as outras 8 páginas.

**Architecture:** Promover o shell client do piloto (`tool-detail-tabs.tsx`) a um componente compartilhado em `components/entity/`, generalizando `paramName`/`clearParams`. Extrair o ciclo load/error/retry/skeleton dos loaders lazy num hook + componente reutilizável com uma view de apresentação pura (testável por markup). O helper de URL vira função pura compartilhada. O piloto passa a consumir tudo isso; os arquivos locais somem.

**Tech Stack:** Next 16 (App Router), React 19 (Compiler ativo), Base UI Tabs (`@emach/ui`), vitest `environment: node` (testes via `renderToStaticMarkup` para markup, asserts puros para lógica), `"use server"` actions.

## Global Constraints

- `"use server"`: só async functions exportadas — **não** re-exportar tipo/const de arquivo `"use server"` (quebra só no `bun run build`, não no `check-types`/lint). Gate obrigatório após mexer em `"use server"`: `bun run build`.
- React Compiler ativo — **sem** `useMemo`/`useCallback`/`forwardRef` manuais.
- Client Component **nunca** importa fn de módulo `server-only`/`@emach/db` — dados lazy via `"use server"` action; tipos via `import type` (apagado no compile).
- Invariante P0: `requireCapability(cap)` no início de toda `"use server"` action (mantido nas actions existentes do piloto).
- Sem `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`. Sem `console.*` (usar `logger`). `key` estável em `.map()`.
- Verificação client (interação) é **smoke no browser** — `check-types` não pega hook client em Server Component nem comportamento de runtime. Gate de cada task client inclui o smoke já medido no piloto: troca entre tabs eager = **0 requests**; tab lazy = **1 action** na 1ª abertura.
- CWD dos comandos é a **raiz do monorepo**; o app é `apps/web`. Testes: `bun --cwd apps/web test`.

## Escopo deste plano (multi-subsistema)

O spec cobre a fundação + 8 migrações de página independentes. Este plano detalha **somente a Fase 0 (fundação + refactor do piloto)** — o subsistema que desbloqueia todos os outros e produz software testável por si só (o piloto continua funcionando, agora sobre a fundação compartilhada).

As **Fases 1–8** (uma página cada) viram **sub-issues** do épico #261, cada uma com seu próprio plano escrito just-in-time no momento de executá-la — porque os planos de página dependem da API final da fundação, que só se firma ao fim da Fase 0. O roteiro está no apêndice. Ordem: `promotions` → `orders` → `carriers` → `suppliers` → `categories` → `users` → `customers` → `branches`.

---

## File Structure (Fase 0)

- **Criar** `apps/web/src/components/entity/tab-url.ts` — `buildTabHref` puro (compartilhado).
- **Criar** `apps/web/src/components/entity/tab-url.test.ts` — testes da função pura.
- **Criar** `apps/web/src/components/entity/lazy-tab.tsx` — `useLazyTab` (hook) + `<LazyTab>` (wiring) + `<LazyTabView>` (apresentação pura).
- **Criar** `apps/web/src/components/entity/lazy-tab.test.tsx` — markup de `<LazyTabView>` (loading/error/ready).
- **Criar** `apps/web/src/components/entity/entity-client-tabs.tsx` — shell client + `useActiveTab`.
- **Criar** `apps/web/src/components/entity/entity-client-tabs.test.tsx` — markup inicial (mock de `next/navigation`).
- **Modificar** `apps/web/src/app/dashboard/tools/[id]/page.tsx` — consumir `EntityClientTabs`/tipos compartilhados.
- **Modificar** `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx` — importar `useActiveTab` do compartilhado.
- **Reescrever** `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx` e `reviews-tab-loader.tsx` — usar `<LazyTab>`.
- **Remover** `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx` e `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts`.

---

### Task 1: `buildTabHref` compartilhado (função pura)

**Files:**
- Create: `apps/web/src/components/entity/tab-url.ts`
- Test: `apps/web/src/components/entity/tab-url.test.ts`

**Interfaces:**
- Produces: `buildTabHref(pathname: string, params: URLSearchParams, tab: string, defaultValue: string, paramName?: string, clearParams?: string[]): string`. Generaliza o helper do piloto: `paramName` default `"tab"`; `clearParams` (default `[]`) é a lista de search params a remover ao trocar de tab (o piloto passava `["variant"]` fixo).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/components/entity/tab-url.test.ts
import { describe, expect, it } from "vitest";
import { buildTabHref } from "./tab-url";

describe("buildTabHref", () => {
  it("remove o paramName quando a tab é o default", () => {
    const sp = new URLSearchParams("tab=estoque");
    expect(buildTabHref("/x", sp, "visao-geral", "visao-geral")).toBe("/x");
  });

  it("seta o paramName quando a tab não é o default", () => {
    const sp = new URLSearchParams();
    expect(buildTabHref("/x", sp, "estoque", "visao-geral")).toBe("/x?tab=estoque");
  });

  it("preserva outros params e remove os de clearParams", () => {
    const sp = new URLSearchParams("variant=v1&q=furadeira");
    expect(
      buildTabHref("/x", sp, "estoque", "visao-geral", "tab", ["variant"])
    ).toBe("/x?q=furadeira&tab=estoque");
  });

  it("respeita um paramName customizado", () => {
    const sp = new URLSearchParams();
    expect(buildTabHref("/x", sp, "b", "a", "view")).toBe("/x?view=b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test tab-url`
Expected: FAIL — `buildTabHref` não existe / módulo não encontrado.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/components/entity/tab-url.ts
export function buildTabHref(
  pathname: string,
  params: URLSearchParams,
  tab: string,
  defaultValue: string,
  paramName = "tab",
  clearParams: string[] = []
): string {
  const sp = new URLSearchParams(params);
  for (const p of clearParams) {
    sp.delete(p);
  }
  if (tab === defaultValue) {
    sp.delete(paramName);
  } else {
    sp.set(paramName, tab);
  }
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test tab-url`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/entity/tab-url.ts apps/web/src/components/entity/tab-url.test.ts
git commit -m "feat(entity): buildTabHref compartilhado com clearParams"
```

---

### Task 2: `<LazyTabView>` + `useLazyTab` + `<LazyTab>`

**Files:**
- Create: `apps/web/src/components/entity/lazy-tab.tsx`
- Test: `apps/web/src/components/entity/lazy-tab.test.tsx`

**Interfaces:**
- Produces:
  - `type LazyTabStatus = "loading" | "error" | "ready"`.
  - `function useLazyTab<T>(load: () => Promise<T>): { status: LazyTabStatus; data: T | null; retry: () => void }` — dispara `load` na montagem e em cada `retry`; guarda `load` em ref (não re-dispara por identidade do thunk).
  - `function LazyTabView<T>(props: { status: LazyTabStatus; data: T | null; onRetry: () => void; skeleton?: ReactNode; children: (data: T) => ReactNode }): ReactNode` — apresentação **pura** (sem hooks): `error` → alerta + botão "Tentar novamente"; `loading`/`data==null` → `skeleton` (default: bloco `animate-pulse`); `ready` → `children(data)`.
  - `function LazyTab<T>(props: { load: () => Promise<T>; skeleton?: ReactNode; children: (data: T) => ReactNode }): ReactNode` — fia `useLazyTab` + `LazyTabView`.

**Nota de teste:** `useLazyTab` usa `useEffect` (não roda em `renderToStaticMarkup`), então o teste cobre o componente **puro** `<LazyTabView>` nos 3 estados. O wiring real (efeito dispara a action, retry refaz) é verificado por browser no Task 4 (smoke do piloto: tab lazy = 1 action).

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/entity/lazy-tab.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LazyTabView } from "./lazy-tab";

const noop = () => undefined;

describe("LazyTabView", () => {
  it("mostra o skeleton enquanto carrega", () => {
    const html = renderToStaticMarkup(
      <LazyTabView status="loading" data={null} onRetry={noop}>
        {(d: string) => <span>{d}</span>}
      </LazyTabView>
    );
    expect(html).toContain("animate-pulse");
  });

  it("mostra alerta de erro com botão de retry", () => {
    const html = renderToStaticMarkup(
      <LazyTabView status="error" data={null} onRetry={noop}>
        {(d: string) => <span>{d}</span>}
      </LazyTabView>
    );
    expect(html).toContain("Tentar novamente");
  });

  it("renderiza os children com os dados quando ready", () => {
    const html = renderToStaticMarkup(
      <LazyTabView status="ready" data="OK" onRetry={noop}>
        {(d: string) => <span>{d}</span>}
      </LazyTabView>
    );
    expect(html).toContain("<span>OK</span>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test lazy-tab`
Expected: FAIL — `LazyTabView` não existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/entity/lazy-tab.tsx
"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type LazyTabStatus = "loading" | "error" | "ready";

export function useLazyTab<T>(load: () => Promise<T>): {
  status: LazyTabStatus;
  data: T | null;
  retry: () => void;
} {
  const [status, setStatus] = useState<LazyTabStatus>("loading");
  const [data, setData] = useState<T | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setData(null);
    loadRef.current()
      .then((result) => {
        if (active) {
          setData(result);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return { status, data, retry: () => setAttempt((a) => a + 1) };
}

interface ViewProps<T> {
  status: LazyTabStatus;
  data: T | null;
  onRetry: () => void;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

export function LazyTabView<T>({
  status,
  data,
  onRetry,
  skeleton,
  children,
}: ViewProps<T>): ReactNode {
  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between gap-3">
          <span>Não foi possível carregar.</span>
          <Button onClick={onRetry} size="sm" variant="outline">
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "loading" || data === null) {
    return (
      skeleton ?? (
        <div aria-busy="true" className="h-32 animate-pulse rounded-md bg-muted" />
      )
    );
  }
  return <>{children(data)}</>;
}

export function LazyTab<T>({
  load,
  skeleton,
  children,
}: {
  load: () => Promise<T>;
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}): ReactNode {
  const { status, data, retry } = useLazyTab(load);
  return (
    <LazyTabView data={data} onRetry={retry} skeleton={skeleton} status={status}>
      {children}
    </LazyTabView>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test lazy-tab`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/entity/lazy-tab.tsx apps/web/src/components/entity/lazy-tab.test.tsx
git commit -m "feat(entity): useLazyTab + LazyTab com view de apresentacao pura"
```

---

### Task 3: `EntityClientTabs` (shell client compartilhado)

**Files:**
- Create: `apps/web/src/components/entity/entity-client-tabs.tsx`
- Test: `apps/web/src/components/entity/entity-client-tabs.test.tsx`

**Interfaces:**
- Consumes: `buildTabHref` (Task 1).
- Produces:
  - `interface EntityClientTab { value: string; label: ReactNode; icon?: ReactNode; badge?: ReactNode; content: ReactNode; lazy?: boolean }`.
  - `function EntityClientTabs(props: { tabs: EntityClientTab[]; defaultValue: string; initialTab: string; header: ReactNode; paramName?: string; clearParams?: string[] }): ReactNode`.
  - `function useActiveTab(): string`.
- Comportamento (idêntico ao piloto, generalizado): estado `active` init de `initialTab`; `onValueChange` → `setActive` + `activate` + `window.history.replaceState(null, "", buildTabHref(...))`; listener `popstate` ressincroniza a tab pela URL; set `activated` monta tabs `lazy` só após 1ª ativação e mantém montadas (`keepMounted`); header renderizado dentro do `TabActiveContext.Provider`.

**Nota de teste:** o componente usa `usePathname`/`useSearchParams` (`next/navigation`) — o teste mocka esse módulo e cobre o **markup inicial** (header presente, triggers das tabs, tab inicial ativa, tab lazy não-ativada renderiza `null`). Interação (replaceState/popstate/troca) é browser smoke no Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/components/entity/entity-client-tabs.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/x/1",
  useSearchParams: () => new URLSearchParams(),
}));

import { EntityClientTabs } from "./entity-client-tabs";

describe("EntityClientTabs", () => {
  const tabs = [
    { value: "a", label: "Aba A", content: <p>conteudo-a</p> },
    { value: "b", label: "Aba B", content: <p>conteudo-b</p>, lazy: true },
  ];

  it("renderiza o header e os rótulos das tabs", () => {
    const html = renderToStaticMarkup(
      <EntityClientTabs
        defaultValue="a"
        header={<header>HEADER</header>}
        initialTab="a"
        tabs={tabs}
      />
    );
    expect(html).toContain("HEADER");
    expect(html).toContain("Aba A");
    expect(html).toContain("Aba B");
  });

  it("não monta o conteúdo de uma tab lazy não-ativada", () => {
    const html = renderToStaticMarkup(
      <EntityClientTabs
        defaultValue="a"
        header={<header>HEADER</header>}
        initialTab="a"
        tabs={tabs}
      />
    );
    expect(html).toContain("conteudo-a");
    expect(html).not.toContain("conteudo-b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test entity-client-tabs`
Expected: FAIL — `EntityClientTabs` não existe.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apps/web/src/components/entity/entity-client-tabs.tsx
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@emach/ui/components/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { buildTabHref } from "./tab-url";

const TabActiveContext = createContext<string>("");

export function useActiveTab(): string {
  return useContext(TabActiveContext);
}

export interface EntityClientTab {
  badge?: ReactNode;
  content: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  lazy?: boolean;
  value: string;
}

interface Props {
  clearParams?: string[];
  defaultValue: string;
  header: ReactNode;
  initialTab: string;
  paramName?: string;
  tabs: EntityClientTab[];
}

export function EntityClientTabs({
  clearParams,
  defaultValue,
  header,
  initialTab,
  paramName = "tab",
  tabs,
}: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [active, setActive] = useState(initialTab);
  const [activated, setActivated] = useState<Set<string>>(
    () => new Set([initialTab])
  );

  const activate = (next: string) => {
    setActivated((prev) => {
      if (prev.has(next)) {
        return prev;
      }
      const updated = new Set(prev);
      updated.add(next);
      return updated;
    });
  };

  const handleChange = (next: string) => {
    setActive(next);
    activate(next);
    const href = buildTabHref(
      pathname,
      new URLSearchParams(params),
      next,
      defaultValue,
      paramName,
      clearParams
    );
    window.history.replaceState(null, "", href);
  };

  useEffect(() => {
    const onPop = () => {
      const tab =
        new URLSearchParams(window.location.search).get(paramName) ??
        defaultValue;
      setActive(tab);
      activate(tab);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [defaultValue, paramName]);

  return (
    <TabActiveContext.Provider value={active}>
      <div className="flex flex-col gap-4">
        {header}
        <Tabs className="w-full" onValueChange={handleChange} value={active}>
          <TabsList className="w-full justify-start" scrollable>
            {tabs.map((tab) => (
              <TabsTrigger
                className="flex items-center gap-1.5"
                key={tab.value}
                value={tab.value}
              >
                {tab.icon}
                {tab.label}
                {tab.badge}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((tab) => (
            <TabsContent className="mt-4" keepMounted key={tab.value} value={tab.value}>
              {tab.lazy && !activated.has(tab.value) ? null : tab.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </TabActiveContext.Provider>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test entity-client-tabs`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/entity/entity-client-tabs.tsx apps/web/src/components/entity/entity-client-tabs.test.tsx
git commit -m "feat(entity): EntityClientTabs shell client compartilhado"
```

---

### Task 4: Religar o piloto `tools/[id]` à fundação + gate de equivalência

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-actions.tsx`
- Rewrite: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-loader.tsx`
- Rewrite: `apps/web/src/app/dashboard/tools/[id]/_components/reviews-tab-loader.tsx`
- Delete: `apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx`
- Delete: `apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts`

**Interfaces:**
- Consumes: `EntityClientTabs`, `EntityClientTab`, `useActiveTab` (Task 3); `LazyTab` (Task 2).

> Ler cada arquivo antes de Edit (`cat`/`sed`/`head` NÃO contam para o harness); se Edit falhar com `string not found`, re-Read antes de re-tentar — nunca editar de memória.

- [ ] **Step 1: Repontar `tool-detail-actions.tsx` para o `useActiveTab` compartilhado**

Trocar o import `import { useActiveTab } from "./tool-detail-tabs";` por:

```tsx
import { useActiveTab } from "@/components/entity/entity-client-tabs";
```

Run: `bun --cwd apps/web check-types`
Expected: ainda falha enquanto `page.tsx` referencia `ToolDetailTabs` (resolvido no Step 2). Confirme que o erro restante é só sobre `tool-detail-tabs`/`ToolDetailTabs`, não sobre `useActiveTab`.

- [ ] **Step 2: Trocar o shell em `page.tsx`**

Em `tools/[id]/page.tsx`: trocar o import `{ type ToolDetailTab, ToolDetailTabs }` de `./_components/tool-detail-tabs` por `{ type EntityClientTab, EntityClientTabs }` de `@/components/entity/entity-client-tabs`. Renomear o tipo da const `tabs: ToolDetailTab[]` → `EntityClientTab[]`. Trocar o JSX `<ToolDetailTabs .../>` por `<EntityClientTabs ... clearParams={["variant"]} />` (mesmos props `defaultValue`/`header`/`initialTab`/`tabs`; `clearParams={["variant"]}` reproduz o comportamento do piloto de limpar `?variant=`).

- [ ] **Step 3: Reescrever os loaders lazy com `<LazyTab>`**

`activity-tab-loader.tsx` passa a:

```tsx
"use client";

import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
import { LazyTab } from "@/components/entity/lazy-tab";
import { fetchToolActivityInitAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

interface InitData {
  branches: ActiveBranchOption[];
  items: ToolActivityRow[];
  nextCursor: string | null;
}

export function ActivityTabLoader({ toolId }: { toolId: string }) {
  return (
    <LazyTab load={() => fetchToolActivityInitAction(toolId)}>
      {(data: InitData) => (
        <ActivityTabClient
          branches={data.branches}
          initialCursor={data.nextCursor}
          initialItems={data.items}
          toolId={toolId}
        />
      )}
    </LazyTab>
  );
}
```

Aplicar a mesma forma a `reviews-tab-loader.tsx` (envolver `fetchToolReviewsAction(toolId)` num `<LazyTab>`, renderizando `ToolReviewsSection` com os dados — preservando os mesmos props que ele passa hoje).

- [ ] **Step 4: Remover os arquivos locais órfãos**

```bash
git rm apps/web/src/app/dashboard/tools/[id]/_components/tool-detail-tabs.tsx \
       apps/web/src/app/dashboard/tools/[id]/_lib/tab-url.ts
```

Run: `rg -n "tool-detail-tabs|_lib/tab-url" apps/web/src`
Expected: nenhuma referência restante.

- [ ] **Step 5: Gate estático — types, lint, testes, build**

```bash
bun --cwd apps/web check-types && bun check && bun --cwd apps/web test && bun run build
```

Expected: tudo verde. (`bun run build` é o gate do `"use server"` — re-export não-async quebraria aqui.)

- [ ] **Step 6: Gate de equivalência — smoke no browser (dev :3007)**

Com o dev server na 3007 (já de pé) e autenticado, abrir `http://localhost:3007/dashboard/tools/<id>` e, via network/Resource Timing:

1. Trocar Visão geral → Variantes → Estoque → **0 requests** RSC/action (só assets).
2. URL acompanha via `history.replaceState` (`?tab=estoque`), sem `_rsc=`.
3. Abrir Atividade (lazy) → **1 server action POST** (renderiza a timeline; 2× em dev = StrictMode).
4. Abrir Avaliações (lazy) → 1 action; reabrir Atividade → **0 requests** (cacheada).
5. Voltar/avançar do browser (`popstate`) sincroniza a tab.
6. "Editar ferramenta" aparece só na Visão geral (header reativo via `useActiveTab`).

Expected: idêntico ao baseline medido antes do refactor. Qualquer divergência = regressão; corrigir antes de commitar.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools apps/web/src/components/entity
git commit -m "refactor(tools): religa o piloto a fundacao compartilhada de tabs"
```

---

## Self-review (Fase 0)

- **Cobertura do spec (fundação):** `buildTabHref` (Task 1) ✓ · `useLazyTab`/`LazyTab` (Task 2) ✓ · `EntityClientTabs`/`useActiveTab` (Task 3) ✓ · refactor do piloto + gate de equivalência (Task 4) ✓.
- **Sem placeholders:** todo step tem código/comando real e output esperado.
- **Consistência de tipos:** `EntityClientTab`/`EntityClientTabs`/`useActiveTab`/`buildTabHref`/`useLazyTab`/`LazyTab`/`LazyTabView`/`LazyTabStatus` usados com a mesma assinatura entre tasks.
- **Constraints honradas:** TDD onde o env permite (pura + markup); interação por browser smoke; `bun run build` no gate; `requireCapability` permanece nas actions do piloto (intocadas).

---

## Apêndice — Roteiro das Fases 1–8 (sub-issues do #261)

Cada fase é uma sub-issue + plano próprio (escrito just-in-time sobre a API final da fundação). Todas seguem o **playbook** do spec (§Playbook de migração): trocar `EntityTabs`→`EntityClientTabs`; header dentro do shell; classificar eager/lazy; ação via `useActiveTab`; clampar `initialTab`; atalhos in-content pelo switcher client; cada tab lazy = `"use server"` action com `requireCapability` + `<LazyTab>`. Gate por página: `bun verify` + `bun run build` + smoke (eager 0 req / lazy 1 action / deep-link / popstate / header / mutações revalidam).

1. **promotions** — overview+tools eager (de `getPromotion`), 0 loaders lazy; header overview→actions, tools→`<Link>` `/edit`.
2. **orders** — todas as 6 eager; adicionar leitura de `?tab=` (clamp) + deep-link/popstate; mata o `router.replace` inútil; `reembolso` condicional; ações no `OrderActionColumn` (não muda).
3. **carriers** — sobretaxas eager; zonas/preview lazy; header não varia (ação sempre `EditCarrierButton`); `?edit=1` ortogonal permanece.
4. **suppliers** — overview eager; estoque/history lazy (history era serial → action); `?q=` do estoque vira estado client + refetch.
5. **categories** — visão-geral eager (incl. `getCategoryAttributes`); produtos/subcategorias lazy; header 3 estados; links p/ outras rotas.
6. **users** — profile/branches/security eager; activity/sessions/permissões lazy; `availableBranches` busca na abertura do painel; `permissões` tab condicional.
7. **customers** — perfil eager; 6 tabs lazy; `?auditAction=` da auditoria vira estado client.
8. **branches** — overview eager; team/orders/stock/activity lazy; **filtros internos server-driven** (categoria/busca/sort/status/período/tipo/toolId) viram estado client + refetch (confirmar quanto já é client via infinite scroll). Maior desvio — por último.

**Virar canônico** (após a Fase 5, 5/8 migradas): atualizar `DESIGN.md §4` + `apps/web/CLAUDE.md` + nota de superação no ADR-0024 (server-nav → client-side default). **Remover** `components/entity/entity-tabs.tsx` na Fase 8 (gate: `rg` sem usos).

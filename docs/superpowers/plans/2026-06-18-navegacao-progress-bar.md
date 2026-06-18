# Barra de progresso de navegação — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o skeleton-por-rota (`loading.tsx`) por uma barra de progresso fina no topo, que corre enquanto a navegação segura a página atual.

**Architecture:** Remover os `loading.tsx` faz a navegação soft do Next congelar a página atual até o commit (comportamento nativo). `@bprogress/next` provê a barra global, que completa no commit da URL — logo corre exatamente durante o "segurar". Suprimida em mudanças que só mexem no search param.

**Tech Stack:** Next 16 App Router, React 19, `@bprogress/next@^3.2.12`, Tailwind v4, bun.

## Global Constraints

- Cor da barra: `oklch(0.65 0.13 38)` (coral `--primary`).
- Altura: `2px`. Sem spinner. `delay: 0` (mostrar imediato).
- Barra **só em mudança de pathname** — suprimir mudanças same-path/search-only.
- Sem `console.*` (usar `logger` se precisar). Sem `: any`/`as any`/`@ts-ignore`.
- React Compiler ativo: **não** usar `useMemo`/`useCallback` manuais.
- Verificação obrigatória antes de cada commit: `bun check-types` e `bun check`.
- Não há harness de teste para comportamento visual de navegação; a verificação de comportamento é **smoke no browser** (`localhost:3006`, tab já aberta) + type-check + lint. Não inventar testes unitários frágeis para a barra.
- Server já roda em `localhost:3006` (Next dev, Turbopack).

---

### Task 1: Instalar dependência e montar o ProgressProvider

Adiciona `@bprogress/next` e monta a barra global no `Providers`. Nesta task os `loading.tsx` ainda existem — a barra coexiste com o skeleton (estado intermediário). Objetivo: confirmar que a barra dispara em navegação de pathname e é suprimida em mudança de search.

**Files:**
- Modify: `apps/web/package.json` (dependência)
- Modify: `apps/web/src/components/providers.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `Providers` (default export) passa a renderizar `<ProgressProvider>` envolvendo `children`. Nenhuma assinatura nova exportada.

- [ ] **Step 1: Instalar a dependência**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun add --cwd apps/web @bprogress/next@^3.2.12
```

Expected: `@bprogress/next` aparece em `apps/web/package.json` → `dependencies`; lockfile atualizado.

- [ ] **Step 2: Reescrever `providers.tsx`**

Substituir o conteúdo de `apps/web/src/components/providers.tsx` por:

```tsx
"use client";

import { ProgressProvider } from "@bprogress/next/app";
import { isSameURLWithoutSearch } from "@bprogress/react";
import { Toaster } from "@emach/ui/components/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ProgressProvider
			color="oklch(0.65 0.13 38)"
			delay={0}
			height="2px"
			options={{ showSpinner: false }}
			targetPreprocessor={(target) =>
				isSameURLWithoutSearch(target, new URL(window.location.href))
					? null
					: target
			}
		>
			{children}
			<Toaster richColors />
		</ProgressProvider>
	);
}
```

Notas:
- `isSameURLWithoutSearch(target, current)` retorna `true` quando os dois têm o mesmo pathname/origin ignorando search → retornamos `null` para **suprimir** a barra (só search mudou).
- `targetPreprocessor` recebe a URL alvo; a atual vem de `window.location` (executa no client).

- [ ] **Step 3: Verificar tipos e lint**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Expected: PASS nos dois. Se `isSameURLWithoutSearch` não vier de `@bprogress/react`, conferir o export correto via `rg "isSameURLWithoutSearch" node_modules/@bprogress` e ajustar o import (pode estar em `@bprogress/core`).

- [ ] **Step 4: Smoke no browser**

Na tab `localhost:3006` (já aberta), via ferramentas do browser:
1. Clicar num item da sidebar para **outra rota** (ex: Ferramentas → Pedidos).
   - Expected: barra coral fina (2px) aparece no topo durante o carregamento e completa quando a página troca. (Nesta task o skeleton **também** aparece — normal, será removido na Task 2.)
2. Abrir um detalhe de entidade que tenha abas (ex: detalhe de filial) e trocar de aba via `?tab=`.
   - Expected: **sem** barra (mudança só de search param).
3. Verificar o console do browser (`read_console_messages`, onlyErrors) — sem erros novos do BProgress.

- [ ] **Step 5: Commit**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && git add apps/web/package.json apps/web/src/components/providers.tsx bun.lock && git commit -m "feat(web): barra de progresso de navegação (BProgress)"
```

(Se o lockfile tiver outro nome, ajustar; `git status` confirma o que mudou.)

---

### Task 2: Remover os 35 `loading.tsx`

Remove todos os skeletons de rota. Com eles fora, a navegação soft passa a congelar a página atual + barra; hard load mostra sidebar + conteúdo em branco até a query.

**Files:**
- Delete (35 arquivos):
  - `apps/web/src/app/dashboard/branches/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/branches/[id]/stock/loading.tsx`
  - `apps/web/src/app/dashboard/branches/loading.tsx`
  - `apps/web/src/app/dashboard/branches/new/loading.tsx`
  - `apps/web/src/app/dashboard/categories/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/categories/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/categories/loading.tsx`
  - `apps/web/src/app/dashboard/categories/new/loading.tsx`
  - `apps/web/src/app/dashboard/customers/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/customers/loading.tsx`
  - `apps/web/src/app/dashboard/orders/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/orders/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/loading.tsx`
  - `apps/web/src/app/dashboard/promotions/new/loading.tsx`
  - `apps/web/src/app/dashboard/reviews/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/reviews/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/loading.tsx`
  - `apps/web/src/app/dashboard/site/banners/new/loading.tsx`
  - `apps/web/src/app/dashboard/site/settings/loading.tsx`
  - `apps/web/src/app/dashboard/stock/branches/loading.tsx`
  - `apps/web/src/app/dashboard/stock/movements/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/loading.tsx`
  - `apps/web/src/app/dashboard/suppliers/new/loading.tsx`
  - `apps/web/src/app/dashboard/tools/[id]/edit/loading.tsx`
  - `apps/web/src/app/dashboard/tools/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/tools/[id]/stock/loading.tsx`
  - `apps/web/src/app/dashboard/tools/loading.tsx`
  - `apps/web/src/app/dashboard/tools/new/loading.tsx`
  - `apps/web/src/app/dashboard/users/[id]/loading.tsx`
  - `apps/web/src/app/dashboard/users/loading.tsx`

**Interfaces:**
- Consumes: a barra montada na Task 1 (fornece o feedback que o skeleton dava).
- Produces: nenhum `loading.tsx` em `apps/web/src/app/**`.

- [ ] **Step 1: Confirmar a lista e remover**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bfs apps/web/src/app -name loading.tsx | wc -l
```

Expected: `35`. Se divergir, listar com `bfs apps/web/src/app -name loading.tsx` e ajustar antes de remover.

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bfs apps/web/src/app -name loading.tsx -exec rm {} +
```

- [ ] **Step 2: Confirmar que sumiram**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bfs apps/web/src/app -name loading.tsx | wc -l
```

Expected: `0`.

- [ ] **Step 3: Verificar que nada importava esses arquivos**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && rg -n "from .*loading\"" apps/web/src || echo "nenhum import — ok"
```

Expected: `nenhum import — ok` (`loading.tsx` são convenções do Next, ninguém importa).

- [ ] **Step 4: Verificar tipos e lint**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Expected: PASS.

- [ ] **Step 5: Smoke no browser (o coração da mudança)**

Na tab `localhost:3006`:
1. Navegar pela sidebar entre rotas (ex: Pedidos → Clientes → Ferramentas).
   - Expected: **sem skeleton**. A página anterior fica visível e intacta; só a barra coral corre no topo; a tela troca de uma vez quando os dados chegam.
2. Dar **F5** numa rota de listagem.
   - Expected: **sem skeleton**; sidebar + área de conteúdo em branco até a query, depois conteúdo.
3. Usar **voltar/avançar** do browser entre duas rotas.
   - Expected: barra aparece; página troca no commit.
4. `read_console_messages` (onlyErrors) — sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && git add -A && git commit -m "feat(web): remover skeletons de rota (loading.tsx) em favor da barra de progresso"
```

---

### Task 3: Anúncio de navegação para leitor de tela (a11y)

A barra visual é invisível a leitor de tela. Adiciona uma região `aria-live` que anuncia a mudança de rota (feedback que o usuário de SR perde com a remoção do skeleton). Abordagem nativa via `usePathname` — independe de internals do BProgress.

**Files:**
- Create: `apps/web/src/components/navigation-announcer.tsx`
- Modify: `apps/web/src/components/providers.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `NavigationAnnouncer` (named export, sem props), montado dentro de `Providers`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/components/navigation-announcer.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Região aria-live que anuncia mudanças de rota para leitores de tela.
 * A barra de progresso visual é aria-hidden; este é o equivalente acessível.
 */
export function NavigationAnnouncer() {
	const pathname = usePathname();
	const [message, setMessage] = useState("");

	useEffect(() => {
		// Limpa e re-seta para garantir que o SR releia mesmo navegações repetidas.
		setMessage("");
		const id = window.setTimeout(() => setMessage("Página carregada"), 100);
		return () => window.clearTimeout(id);
	}, [pathname]);

	return (
		<span aria-live="polite" className="sr-only" role="status">
			{message}
		</span>
	);
}
```

Notas:
- `sr-only` é a classe utilitária padrão (Tailwind) de visualmente-escondido. Confirmar que existe no projeto: `rg -n "sr-only" apps/web/src packages/ui/src | head -1`. Se não houver, usar as classes inline equivalentes do Tailwind v4 (`className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"`).
- Anuncia na **conclusão** da navegação (pathname commitou) — que é o momento útil para o SR. Detectar o início exigiria internals do BProgress; conclusão é suficiente e robusto.

- [ ] **Step 2: Montar no `Providers`**

Em `apps/web/src/components/providers.tsx`, importar e renderizar `<NavigationAnnouncer />` dentro do `ProgressProvider` (junto do `Toaster`):

```tsx
"use client";

import { ProgressProvider } from "@bprogress/next/app";
import { isSameURLWithoutSearch } from "@bprogress/react";
import { Toaster } from "@emach/ui/components/sonner";
import { NavigationAnnouncer } from "@/components/navigation-announcer";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ProgressProvider
			color="oklch(0.65 0.13 38)"
			delay={0}
			height="2px"
			options={{ showSpinner: false }}
			targetPreprocessor={(target) =>
				isSameURLWithoutSearch(target, new URL(window.location.href))
					? null
					: target
			}
		>
			{children}
			<NavigationAnnouncer />
			<Toaster richColors />
		</ProgressProvider>
	);
}
```

- [ ] **Step 3: Verificar tipos e lint**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && bun check-types && bun check
```

Expected: PASS.

- [ ] **Step 4: Smoke no browser**

Na tab `localhost:3006`, navegar entre rotas e inspecionar o DOM (`read_page` ou `find`): após a troca, o `<span role="status">` contém "Página carregada". Sem regressão visual (a região é `sr-only`, invisível).

- [ ] **Step 5: Commit**

```bash
cd /home/othavio/Projects/emach/emach-dashboard && git add apps/web/src/components/navigation-announcer.tsx apps/web/src/components/providers.tsx && git commit -m "feat(web): anúncio aria-live de navegação para leitor de tela"
```

---

## Self-Review

**Spec coverage:**
- Dependência + `ProgressProvider` (cor coral, 2px, sem spinner, delay 0) → Task 1. ✓
- Suprimir mudanças same-path/search-only via `isSameURLWithoutSearch` → Task 1, Step 2. ✓
- Remover todos os `loading.tsx` → Task 2 (35 arquivos, lista exata). ✓
- Manter `<Suspense>` de `dashboard/page.tsx` → não tocado por nenhuma task (só removemos `loading.tsx`). ✓
- a11y `aria-live` → Task 3. ✓
- `prefers-reduced-motion`: spec decidiu "manter a barra, sem efeitos extras" → nenhuma ação necessária (default do BProgress é transição de posição suave). ✓
- Pontos de melhoria fora do escopo (gargalo do `DashboardLayout`, indicador inline same-path, `useProgress` em submit) → registrados no spec, **não** viram task. ✓

**Placeholder scan:** sem TBD/TODO; todo passo tem comando ou código concreto. O único ponto condicional (`isSameURLWithoutSearch` poder vir de outro subpath; `sr-only` poder não existir) tem o comando de verificação + fallback explícito. ✓

**Type consistency:** `Providers` mantém a assinatura `({ children }: { children: React.ReactNode })` nas Tasks 1 e 3; `NavigationAnnouncer` é named export sem props, consistente entre criação (Task 3 Step 1) e uso (Task 3 Step 2). ✓

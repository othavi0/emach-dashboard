# Padrão de Tabs do Dashboard — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar todos os filter-tabs do dashboard num único shape visual (gap-1, badge secondary uniforme), converter PendingPanel ToggleGroup→Tabs, e igualar a altura do par PendingPanel+ActivityFeed em /orders, /customers, /dashboard, /users.

**Architecture:** Padrão centralizado em `@emach/ui/components/tabs.tsx` — adicionar `gap-1` na variant `default` do `tabsListVariants` e exportar helper `TabsCountBadge` com badge `variant="secondary"` + `ml-1.5 tabular-nums` embutido. Call-sites trocam `<Badge>` manual pelo helper. Componentes sem badge (`EntityTabs`, `CustomerTabs`) herdam `gap-1` automaticamente.

**Tech Stack:** Next 16 / React 19, Tailwind, `@emach/ui` (cva + @base-ui/react), Bun, Drizzle (irrelevante aqui), check-types como única verificação (sem suite de testes UI no projeto).

**Spec de referência:** `docs/superpowers/specs/2026-05-26-tabs-padrao-dashboard-design.md`

---

## File Structure (mapa de mudanças)

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `packages/ui/src/components/tabs.tsx` | modify | Tokens visuais (gap-1) + helper TabsCountBadge |
| `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` | modify | Migra pra helper (atualmente já visual igual, código duplicado) |
| `apps/web/src/app/dashboard/users/page.tsx` | modify | Migra 3 badges + adiciona wrapper altura ActivityFeed |
| `apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx` | modify | Migra badge ternário |
| `apps/web/src/components/pending-panel.tsx` | modify | Refactor: ToggleGroup → Tabs (sub-tabs internas) |
| `apps/web/src/app/dashboard/customers/page.tsx` | modify | Adiciona wrapper altura ActivityFeed |
| `apps/web/src/app/design/page.tsx` | modify | Showcase reflete padrão final |

**Tasks são independentes na ordem:** Task 1 é foundation (todos os call-sites dependem dela). Tasks 2-5 são paralelizáveis (call-sites distintos). Tasks 6-7 são independentes. Task 8 valida o todo.

---

## Pré-requisitos da sessão

- Branch: `main` (sem worktree — usuário aprovou trabalhar direto em main no fluxo anterior).
- Dev server em `localhost:3001` deve estar rodando antes de smoke (já está, PID 387135).
- Monitor `bwk9q44y6` ativo em `/tmp/emach-next-3001.log`.
- Brave "Notbook" tab `226463900` selecionado.
- ❗ NUNCA commitar/pushar sem aprovação explícita do usuário em cada commit (regra global).

---

## Task 1: Foundation — gap-1 default + TabsCountBadge

**Files:**
- Modify: `packages/ui/src/components/tabs.tsx`

- [ ] **Step 1: Ler estado atual**

Run: `Read packages/ui/src/components/tabs.tsx`

Confirmar que `tabsListVariants` está em torno da linha 26 e que `Badge` ainda **não** é importado lá.

- [ ] **Step 2: Adicionar `gap-1` na variant default do tabsListVariants**

Edit `packages/ui/src/components/tabs.tsx`:

```
old: 				default: "bg-muted ring-1 ring-border/60",
new: 				default: "gap-1 bg-muted ring-1 ring-border/60",
```

- [ ] **Step 3: Adicionar import de Badge e cn**

Edit `packages/ui/src/components/tabs.tsx` no bloco de imports do topo:

```
old: import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@emach/ui/lib/utils";

new: import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Badge } from "@emach/ui/components/badge";
import { cn } from "@emach/ui/lib/utils";
```

(`cn` já existe — só adicionar o `Badge` entre eles em ordem alfabética.)

- [ ] **Step 4: Adicionar export TabsCountBadge antes do `export { Tabs, ...}` final**

Edit `packages/ui/src/components/tabs.tsx`, inserir antes da linha `function TabsContent`:

```tsx
function TabsCountBadge({
	value,
	className,
}: {
	className?: string;
	value: number;
}) {
	return (
		<Badge
			className={cn("ml-1.5 tabular-nums", className)}
			variant="secondary"
		>
			{value}
		</Badge>
	);
}

```

- [ ] **Step 5: Adicionar TabsCountBadge ao export final**

Edit `packages/ui/src/components/tabs.tsx` no `export {...}` final:

```
old: export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
new: export {
	Tabs,
	TabsContent,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
	tabsListVariants,
};
```

(O auto-format do Biome vai re-quebrar a linha se ficar longa — sem problema.)

- [ ] **Step 6: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 7: Commit (pedir aprovação primeiro)**

Pedir ao usuário: "Task 1 pronta — Foundation TabsCountBadge + gap-1 default. Tipos passam. Posso commitar?"

Após aprovação:

```bash
git add packages/ui/src/components/tabs.tsx
git commit -m "feat(ui): TabsCountBadge helper + gap-1 default em TabsList

- Novo export TabsCountBadge wrapping Badge variant=secondary com
  ml-1.5 tabular-nums embutido. Centraliza padrão dos filter-tabs.
- Variant default do tabsListVariants ganha gap-1 (já existia em line).
  Propaga gap pra todo TabsList default automaticamente."
```

---

## Task 2: Migrar `/orders` filter pra TabsCountBadge

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`

**Contexto:** `/orders` já está visualmente correto (foi referência da spec). Esta task remove código duplicado migrando pro helper centralizado e remove `className="gap-1"` manual (vira default).

- [ ] **Step 1: Adicionar TabsCountBadge ao import existente**

Edit `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`:

```
old: import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
new: import { Tabs, TabsCountBadge, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
```

- [ ] **Step 2: Remover import não usado de Badge**

Edit o mesmo arquivo:

```
old: import { Badge } from "@emach/ui/components/badge";

new:
```

(Apaga a linha inteira; após Step 3 não terá mais uso de `Badge` direto.)

- [ ] **Step 3: Substituir bloco do Badge pelo TabsCountBadge + remover gap-1 manual**

Edit o mesmo arquivo:

```
old: 			<Tabs value={currentTab}>
				<TabsList className="gap-1" scrollable>
					{ORDER_TABS.map((tab) => {
						const count = tabCount(counts, tab.key, tab.statuses);
						const isActive = currentTab === tab.key;
						return (
							<TabsTrigger
								key={tab.key}
								nativeButton={false}
								render={<Link href={buildTabHref(filters, tab.key)} />}
								value={tab.key}
							>
								<span>{tab.label}</span>
								{(isActive || count > 0) && (
									<Badge
										className="ml-1.5 tabular-nums"
										variant="secondary"
									>
										{count}
									</Badge>
								)}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>

new: 			<Tabs value={currentTab}>
				<TabsList scrollable>
					{ORDER_TABS.map((tab) => {
						const count = tabCount(counts, tab.key, tab.statuses);
						const isActive = currentTab === tab.key;
						return (
							<TabsTrigger
								key={tab.key}
								nativeButton={false}
								render={<Link href={buildTabHref(filters, tab.key)} />}
								value={tab.key}
							>
								<span>{tab.label}</span>
								{(isActive || count > 0) && <TabsCountBadge value={count} />}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>
```

- [ ] **Step 4: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 5: Smoke visual em /orders**

Recarregar `http://localhost:3001/dashboard/orders` no Brave "Notbook" tab 226463900 e screenshot.
Esperado: tabs idênticas à versão anterior (gap entre triggers, badges secondary em todas).

- [ ] **Step 6: Commit (pedir aprovação primeiro)**

Após aprovação:

```bash
git add apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx
git commit -m "refactor(orders): filter-tabs usam TabsCountBadge

Visual idêntico — remove Badge manual + className gap-1 (vira default
do TabsList agora)."
```

---

## Task 3: Migrar `/users` filter pra TabsCountBadge

**Files:**
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

**Contexto:** Hoje badge ativo = `variant="default"` (dourado), inativo = `variant="outline"` (borda). Após migração: ambos `secondary` (cinza uniforme).

- [ ] **Step 1: Adicionar TabsCountBadge ao import**

Edit `apps/web/src/app/dashboard/users/page.tsx`:

```
old: import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
new: import { Tabs, TabsCountBadge, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
```

- [ ] **Step 2: Remover import não usado de Badge (se ficar sem uso após Step 3)**

Verificar se `Badge` é usado em outro lugar do arquivo:

Run: `ugrep -n 'Badge' apps/web/src/app/dashboard/users/page.tsx`

Se as únicas ocorrências estão nas 3 substituições do Step 3, apagar:

```
old: import { Badge } from "@emach/ui/components/badge";

new:
```

(Se houver outro uso, manter o import.)

- [ ] **Step 3: Substituir os 3 blocos Badge nas TabsTrigger**

Edit `apps/web/src/app/dashboard/users/page.tsx` — bloco 1 (Ativos):

```
old: 						Ativos
						<Badge
							className="ml-1.5 tabular-nums"
							variant={status === "active" ? "default" : "outline"}
						>
							{kpis.active}
						</Badge>

new: 						Ativos
						<TabsCountBadge value={kpis.active} />
```

Edit — bloco 2 (Pendentes):

```
old: 						Pendentes
						<Badge
							className="ml-1.5 tabular-nums"
							variant={status === "pending" ? "default" : "outline"}
						>
							{kpis.pending}
						</Badge>

new: 						Pendentes
						<TabsCountBadge value={kpis.pending} />
```

Edit — bloco 3 (Suspensos):

```
old: 						Suspensos
						<Badge
							className="ml-1.5 tabular-nums"
							variant={status === "suspended" ? "default" : "outline"}
						>
							{kpis.suspended}
						</Badge>

new: 						Suspensos
						<TabsCountBadge value={kpis.suspended} />
```

- [ ] **Step 4: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 5: Smoke visual em /users**

Recarregar `http://localhost:3001/dashboard/users` no Brave e screenshot.
Esperado: badges agora todos secondary (cinza), gap-1 visível entre tabs.

- [ ] **Step 6: Commit (pedir aprovação primeiro)**

```bash
git add apps/web/src/app/dashboard/users/page.tsx
git commit -m "refactor(users): filter-tabs usam TabsCountBadge

Badges uniformes em secondary (ativo + inativo). Hierarquia visual
fica no container da tab, não no badge."
```

---

## Task 4: Migrar `/reviews` filter pra TabsCountBadge

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx`

**Contexto:** Hoje badge ativo = `default`, inativo = `secondary`. Após: ambos `secondary`.

- [ ] **Step 1: Adicionar TabsCountBadge ao import**

Edit `apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx`:

```
old: import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
new: import { Tabs, TabsCountBadge, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
```

- [ ] **Step 2: Verificar e remover import Badge se sem uso**

Run: `ugrep -n 'Badge' apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx`

Se única ocorrência é a do bloco substituído no Step 3, apagar:

```
old: import { Badge } from "@emach/ui/components/badge";

new:
```

- [ ] **Step 3: Substituir o Badge ternário pelo TabsCountBadge**

Edit `apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx`:

```
old: 						return (
							<TabsTrigger
								key={tab.key}
								nativeButton={false}
								render={<Link href={buildTabHref(tab.key, filters)} />}
								value={tab.key}
							>
								<span>{tab.label}</span>
								<Badge
									className="ml-2"
									variant={isActive ? "default" : "secondary"}
								>
									{count}
								</Badge>
							</TabsTrigger>
						);

new: 						return (
							<TabsTrigger
								key={tab.key}
								nativeButton={false}
								render={<Link href={buildTabHref(tab.key, filters)} />}
								value={tab.key}
							>
								<span>{tab.label}</span>
								<TabsCountBadge value={count} />
							</TabsTrigger>
						);
```

- [ ] **Step 4: Limpar `isActive` se ficou sem uso**

Run: `ugrep -n 'isActive' apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx`

Se aparece só na linha `const isActive = currentTab === tab.key;`, apagar essa linha:

```
old: 						const isActive = currentTab === tab.key;
						const count = counts[tab.key] ?? 0;

new: 						const count = counts[tab.key] ?? 0;
```

(Se `isActive` é usado em outro lugar, manter.)

- [ ] **Step 5: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 6: Smoke visual em /reviews**

Navegar `http://localhost:3001/dashboard/reviews` no Brave e screenshot.
Esperado: badges secondary em todos os estados, gap-1 visível.

- [ ] **Step 7: Commit (pedir aprovação primeiro)**

```bash
git add apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx
git commit -m "refactor(reviews): filter-tabs usam TabsCountBadge

Badges uniformes em secondary."
```

---

## Task 5: Refactor PendingPanel ToggleGroup → Tabs

**Files:**
- Modify: `apps/web/src/components/pending-panel.tsx`

**Contexto:** Componente compartilhado por /orders, /dashboard, /customers, /users (via UsersPendingCard). Hoje sub-tabs internas usam `<ToggleGroup>` (componente diferente). Refactor pra `<Tabs>` com `TabsCountBadge`. Drop intencional da cor por `tab.role` no badge das sub-tabs (continua nos badges do header).

- [ ] **Step 1: Ler estado atual do PendingPanel pra confirmar imports e estrutura**

Run: `Read apps/web/src/components/pending-panel.tsx`

Confirmar:
- Import `ToggleGroup, ToggleGroupItem` está presente
- Função `PendingPanel` renderiza `<ToggleGroup>` por volta da linha 140-160
- `BADGE_COLORS` é usado nos badges do header (linha ~153) — não dropar

- [ ] **Step 2: Trocar imports — remover ToggleGroup, adicionar Tabs + TabsCountBadge**

Edit `apps/web/src/components/pending-panel.tsx`:

```
old: import {
	ToggleGroup,
	ToggleGroupItem,
} from "@emach/ui/components/toggle-group";

new: import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
```

- [ ] **Step 3: Substituir o bloco ToggleGroup por Tabs**

Edit `apps/web/src/components/pending-panel.tsx`:

```
old: 				<ToggleGroup
					className="min-w-0 max-w-full flex-wrap justify-start"
					onValueChange={(v) => {
						const next = v[0];
						if (next) {
							setActiveId(next);
						}
					}}
					value={[activeId]}
				>
					{tabs.map((tab) => (
						<ToggleGroupItem key={tab.id} value={tab.id}>
							{tab.label}
							<Badge
								className={cn("ml-1.5", BADGE_COLORS[tab.role ?? "default"])}
								variant="outline"
							>
								{tab.count}
							</Badge>
						</ToggleGroupItem>
					))}
				</ToggleGroup>

new: 				<Tabs
					onValueChange={(v) => {
						if (v) {
							setActiveId(v);
						}
					}}
					value={activeId}
				>
					<TabsList className="max-w-full">
						{tabs.map((tab) => (
							<TabsTrigger key={tab.id} value={tab.id}>
								<span>{tab.label}</span>
								<TabsCountBadge value={tab.count} />
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
```

- [ ] **Step 4: Confirmar que Badge e cn continuam usados pelo header (BADGE_COLORS)**

Run: `ugrep -n 'Badge\|BADGE_COLORS\|cn(' apps/web/src/components/pending-panel.tsx`

Esperado: várias ocorrências (header dos painéis e role colors). Se `Badge`/`cn`/`BADGE_COLORS` virou sem uso, apagar imports/const inutilizados. Em particular, o `cn` que estava sendo usado dentro do `ToggleGroupItem` agora pode estar sem uso — verificar.

- [ ] **Step 5: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 6: Smoke visual em /orders e /dashboard**

Recarregar `http://localhost:3001/dashboard/orders` e screenshot.
Esperado: sub-tabs "Aguardando ação / Em fluxo" agora num container muted (igual filter-tabs externos), gap-1 entre triggers, badge secondary.

Repetir em `http://localhost:3001/dashboard`.

Repetir em `http://localhost:3001/dashboard/customers`.

- [ ] **Step 7: Verificar console no Brave**

Run via `mcp__claude-in-chrome__read_console_messages` com pattern `Hydration|Error` em cada uma das 3 rotas.
Esperado: sem hydration errors novos.

- [ ] **Step 8: Commit (pedir aprovação primeiro)**

```bash
git add apps/web/src/components/pending-panel.tsx
git commit -m "refactor(pending-panel): sub-tabs viram Tabs reais

Substitui ToggleGroup por Tabs + TabsCountBadge — sub-tabs internas
ganham o mesmo shape visual dos filter-tabs externos.

Drop intencional: cor por tab.role no badge das sub-tabs. Hierarquia
visual fica no container da tab. BADGE_COLORS continua usado no
header do painel."
```

---

## Task 6: Wrappers de altura em /customers e /users

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/page.tsx`
- Modify: `apps/web/src/app/dashboard/users/page.tsx`

**Contexto:** /orders e /dashboard já têm wrapper `min-h-[18rem]`. /customers e /users não — ActivityFeed cresce com conteúdo. Adicionar wrapper consistente.

- [ ] **Step 1: Adicionar wrapper em /customers**

Edit `apps/web/src/app/dashboard/customers/page.tsx`:

```
old: 			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<PendingPanel
					compact
					emptyMessage="Nenhum cliente aguardando ação."
					tabs={pendingTabs}
					title="Atenção em clientes"
				/>
				<ActivityFeed
					emptyMessage="Sem atividade recente."
					fetchPage={fetchCustomerActivityPage}
					initialCursor={activity.nextCursor}
					initialEvents={activity.items}
					title="Atividade recente"
				/>
			</section>

new: 			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<PendingPanel
					compact
					emptyMessage="Nenhum cliente aguardando ação."
					tabs={pendingTabs}
					title="Atenção em clientes"
				/>
				<div className="relative min-h-[18rem] min-w-0">
					<div className="absolute inset-0">
						<ActivityFeed
							emptyMessage="Sem atividade recente."
							fetchPage={fetchCustomerActivityPage}
							initialCursor={activity.nextCursor}
							initialEvents={activity.items}
							title="Atividade recente"
						/>
					</div>
				</div>
			</section>
```

- [ ] **Step 2: Adicionar wrapper em /users**

Edit `apps/web/src/app/dashboard/users/page.tsx`:

```
old: 			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<UsersPendingCard
					count={kpis.pending}
					initial={pending.items}
					initialCursor={pending.nextCursor}
				/>
				<ActivityFeed
					emptyMessage="Sem atividade recente de usuários."
					fetchPage={fetchUserActivityFeedPage}
					initialCursor={null}
					initialEvents={activityEvents}
					title="Atividade recente"
				/>
			</section>

new: 			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<UsersPendingCard
					count={kpis.pending}
					initial={pending.items}
					initialCursor={pending.nextCursor}
				/>
				<div className="relative min-h-[18rem] min-w-0">
					<div className="absolute inset-0">
						<ActivityFeed
							emptyMessage="Sem atividade recente de usuários."
							fetchPage={fetchUserActivityFeedPage}
							initialCursor={null}
							initialEvents={activityEvents}
							title="Atividade recente"
						/>
					</div>
				</div>
			</section>
```

- [ ] **Step 3: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 4: Smoke visual em /customers e /users**

Recarregar ambas no Brave e screenshot.
Esperado: ActivityFeed agora com altura igual ao PendingPanel compact. Comparar lado a lado com /orders pra confirmar consistência.

- [ ] **Step 5: Commit (pedir aprovação primeiro)**

```bash
git add apps/web/src/app/dashboard/customers/page.tsx apps/web/src/app/dashboard/users/page.tsx
git commit -m "style(layout): altura uniforme PendingPanel + ActivityFeed

Wrapper min-h-[18rem] em /customers e /users — bate com /orders e
/dashboard. Par sempre visualmente balanceado independente do volume
de eventos no ActivityFeed."
```

---

## Task 7: Atualizar showcase em /design

**Files:**
- Modify: `apps/web/src/app/design/page.tsx`

**Contexto:** Página de design system tem 6 exemplos de Tabs. Atualizar pra usar `TabsCountBadge` quando aplicável (substitui strings `"Ativos · 24"` por label + helper) e demonstrar o padrão real.

- [ ] **Step 1: Ler bloco de Tabs no showcase**

Run: `Read apps/web/src/app/design/page.tsx` offset=593 limit=110

Confirmar quais blocos têm contagens (linha 637-643 "active/pending/suspended", linha 647-658 "todos/pendentes/aprovados").

- [ ] **Step 2: Adicionar TabsCountBadge ao import**

Edit `apps/web/src/app/design/page.tsx`:

```
old: 	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
new: 	Tabs,
	TabsContent,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
```

(Manter ordem alfabética dentro do bloco.)

- [ ] **Step 3: Atualizar exemplo "filter com contagem" (active/pending/suspended)**

Edit `apps/web/src/app/design/page.tsx`:

```
old: 					<Tabs className="w-full" defaultValue="active">
						<TabsList>
							<TabsTrigger value="active">Ativos · 24</TabsTrigger>
							<TabsTrigger value="pending">Pendentes · 3</TabsTrigger>
							<TabsTrigger value="suspended">Suspensos · 1</TabsTrigger>
						</TabsList>
					</Tabs>

new: 					<Tabs className="w-full" defaultValue="active">
						<TabsList>
							<TabsTrigger value="active">
								Ativos
								<TabsCountBadge value={24} />
							</TabsTrigger>
							<TabsTrigger value="pending">
								Pendentes
								<TabsCountBadge value={3} />
							</TabsTrigger>
							<TabsTrigger value="suspended">
								Suspensos
								<TabsCountBadge value={1} />
							</TabsTrigger>
						</TabsList>
					</Tabs>
```

- [ ] **Step 4: Atualizar exemplo "todos/pendentes/aprovados" se também tem contagens inline**

Edit `apps/web/src/app/design/page.tsx`:

Ler o bloco entre linhas 647-658 (`Tabs defaultValue="todos"`). Se algum trigger tem badge inline custom (Badge component direto), substituir pra `<TabsCountBadge value={N} />`. Se for puramente labels sem contagem, **não mudar**.

Se houver um `<Badge>` ou `<span className="rounded-full ...">` inline com número, substituir por `<TabsCountBadge value={N} />` mantendo a label.

- [ ] **Step 5: Validar tipos**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 6: Smoke visual em /design**

Navegar `http://localhost:3001/design` no Brave, rolar até a seção "Tabs" e screenshot.
Esperado: exemplos com `TabsCountBadge` renderizam badge secondary + gap-1.

- [ ] **Step 7: Commit (pedir aprovação primeiro)**

```bash
git add apps/web/src/app/design/page.tsx
git commit -m "docs(design): showcase reflete TabsCountBadge

Exemplos de filter-tabs com contagem agora usam o helper real
em vez de strings inline."
```

---

## Task 8: Validação final cross-route

**Files:**
- (nenhuma modificação — só verificação)

- [ ] **Step 1: Validar tipos full**

Run: `bun check-types`
Expected: `Tasks: 5 successful, 5 total`

- [ ] **Step 2: Smoke matrix — recarregar e screenshot cada rota**

Recarregar via Brave tab 226463900:
- `http://localhost:3001/dashboard` — par compact, sub-tabs PendingPanel viraram Tabs
- `http://localhost:3001/dashboard/orders` — filter-tabs + sub-tabs PendingPanel
- `http://localhost:3001/dashboard/customers` — par compact + altura wrapper, sub-tabs PendingPanel
- `http://localhost:3001/dashboard/users` — filter-tabs + sub-tab PendingPanel (1 só) + altura wrapper
- `http://localhost:3001/dashboard/reviews` — filter-tabs
- `http://localhost:3001/design` — showcase atualizado

Em cada uma confirmar visualmente:
- `gap-1` entre triggers (espaço pequeno mas visível)
- Badge `secondary` (cinza warm-neutral) em ambos estados ativo/inativo
- Altura uniforme do par PendingPanel + ActivityFeed (onde aplicável)

- [ ] **Step 3: Verificar console — sem hydration mismatch nas rotas com PendingPanel**

Em cada rota acima, via `mcp__claude-in-chrome__read_console_messages` com pattern `Hydration|mismatch|Error` e `onlyErrors: true`.
Esperado: 0 erros novos.

- [ ] **Step 4: Verificar DOM do PendingPanel é Tabs (não ToggleGroup)**

Via `mcp__claude-in-chrome__javascript_tool` em `/dashboard/orders`:

```javascript
document.querySelector('[data-slot="tabs-list"]')?.outerHTML?.slice(0, 200)
```

Esperado: HTML com `data-slot="tabs-list"` presente (confirma que sub-tabs do PendingPanel são `<Tabs>` agora).

- [ ] **Step 5: Pedir aprovação pra push final**

Pedir ao usuário: "Smoke matrix completo. 7 commits prontos pra push origin/main. Aprova?"

Após aprovação:

```bash
git push origin main
```

---

## Self-Review checklist

**1. Spec coverage:**
- ✅ Token gap-1: Task 1
- ✅ TabsCountBadge: Task 1
- ✅ Migração orders/users/reviews: Tasks 2, 3, 4
- ✅ PendingPanel ToggleGroup→Tabs com drop role: Task 5
- ✅ Wrapper min-h-[18rem] em /customers e /users: Task 6
- ✅ Showcase /design: Task 7
- ✅ Smoke matrix + DOM check: Task 8
- ✅ EntityTabs / CustomerTabs: não tocados, herdam gap-1 (verificado no smoke matrix)

**2. Placeholder scan:** todos os steps têm código exato ou comandos exatos. Sem TBD/TODO.

**3. Type consistency:** `TabsCountBadge` assinatura `{ value: number; className?: string }` consistente em todas as menções (Tasks 1, 2, 3, 4, 5, 7). Import `from "@emach/ui/components/tabs"` consistente. Wrapper de altura idêntico em Tasks 6 e Task 8 (já existente em /orders e /dashboard).

**Sem gaps detectados.**

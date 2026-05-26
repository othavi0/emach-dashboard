# Padrão de Tabs do Dashboard — Design

**Status:** draft
**Data:** 2026-05-26
**Origem:** `/dashboard/orders` ficou com tabs visualmente boas após ajustes (gap-1, badge secondary uniforme, container muted). Usuário pediu pra promover esse shape ao padrão do sistema inteiro e igualar a altura do par PendingPanel + ActivityFeed em todas as rotas que usam esse layout.

## Problema

O sistema tem 5 padrões diferentes de Tabs convivendo:

| Local | Badge ativo | Badge inativo | Gap | Observação |
|---|---|---|---|---|
| `/orders` (filter status) | `secondary` | `secondary` | `gap-1` | Padrão a propagar |
| `/users` (filter status) | `default` (dourado) | `outline` (borda) | sem gap | Divergente |
| `/reviews` (filter status) | `default` (dourado) | `secondary` (cinza) | sem gap | Divergente |
| `/customers/[id]` (CustomerTabs) | — | — | sem gap | Só labels |
| `EntityTabs` (tool/supplier/branch detail) | livre | livre | `gap-1.5` no trigger | Genérico, caller decide |
| `PendingPanel` (sub-tabs internas) | `ToggleGroup` (componente diferente!) | — | — | Não é Tabs |

E a altura do par `PendingPanel + ActivityFeed`:

- `/orders` — wrapper `min-h-[18rem]` no ActivityFeed
- `/customers` — sem wrapper (altura natural; cresce com conteúdo)
- `/dashboard` (home) — wrapper `min-h-[18rem]` (já correto)
- `/users` — sem wrapper

Resultado: visual incoerente entre rotas que mostram a mesma metáfora ("o que precisa de ação à esquerda, o que aconteceu à direita").

## Objetivo

1. **Um padrão único de Tabs filter de status:** mesmo gap, mesma cor de badge, mesmo posicionamento.
2. **Hierarquia visual no container:** a tab ativa muda pra `bg-primary`. O badge dentro **não** duplica essa diferença — sempre `variant="secondary"`.
3. **Sub-tabs internas (PendingPanel) com o mesmo shape** que filter-tabs externos.
4. **Altura igual** do par PendingPanel + ActivityFeed em todas as rotas que têm esse layout.

## Tokens visuais (o padrão)

| Token | Valor | Onde aplica |
|---|---|---|
| `gap` entre triggers | `gap-1` | `TabsList` (variant `default`) — hoje só existe no `line` |
| Badge variant (ativo + inativo) | `secondary` | Helper `<TabsCountBadge>` |
| Espaçamento label→badge | `ml-1.5` | Helper `<TabsCountBadge>` |
| Tipografia do número | `tabular-nums` | Helper `<TabsCountBadge>` |
| Altura trigger | `h-[calc(100%-0.5px)]` (default existente) | Inalterado |
| Bg trigger ativo | `bg-primary text-primary-foreground` (default existente) | Inalterado |
| Wrapper altura ActivityFeed | `min-h-[18rem]` | `<div className="relative min-h-[18rem] min-w-0">` + `<div className="absolute inset-0">` |

## Arquitetura

Padrão centralizado em **um arquivo** do `@emach/ui` — `packages/ui/src/components/tabs.tsx`:

1. **`tabsListVariants` ganha `gap-1` na variant default.** Propaga gap pra todo `<TabsList>` que não passa variant explícito.
2. **Novo export `<TabsCountBadge value={number} className?={string} />`.** Wrapper sobre `<Badge variant="secondary">` com `ml-1.5 tabular-nums` embutido. Filter call-sites trocam o `<Badge>` manual por esse helper.

```tsx
// packages/ui/src/components/tabs.tsx — diff conceitual

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-md p-[3px] text-muted-foreground data-[variant=line]:rounded-none group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted ring-1 ring-border/60 gap-1", // <- gap-1 novo
        line: "gap-1 border-border border-b bg-transparent p-0",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export function TabsCountBadge({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn("ml-1.5 tabular-nums", className)}>
      {value}
    </Badge>
  );
}
```

Tudo o mais é call-site. Componentes que **não** usam badge (`EntityTabs`, `CustomerTabs`) herdam o `gap-1` automaticamente sem nenhuma mudança no código deles.

## Call-sites afetados

| Arquivo | Mudança | Impacto |
|---|---|---|
| `packages/ui/src/components/tabs.tsx` | +`gap-1` no variant default + export `TabsCountBadge` | Propaga `gap-1` pra **TUDO** que usa `<TabsList>` default |
| `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` | `<Badge variant="secondary" className="ml-1.5 tabular-nums">{count}</Badge>` → `<TabsCountBadge value={count} />`; remover `className="gap-1"` manual da `TabsList` (vira default) | Comportamento visual idêntico; código mais limpo |
| `apps/web/src/app/dashboard/users/page.tsx` | 3× `<Badge variant={status === X ? "default" : "outline"} ...>` → `<TabsCountBadge value=...>` | Hoje ativo=`default`/inativo=`outline` → vira uniforme `secondary` |
| `apps/web/src/app/dashboard/reviews/_components/reviews-filters.tsx` | Badge ternário `variant={isActive ? "default" : "secondary"}` → `<TabsCountBadge value={count} />`; remover `className="ml-2"` | Hoje ativo=`default`/inativo=`secondary` → vira uniforme `secondary` |
| `apps/web/src/components/pending-panel.tsx` | Refactor: `<ToggleGroup>` → `<Tabs>` + `<TabsList>` + `<TabsTrigger>`. Badge da contagem usa `TabsCountBadge`. Mantém `useState(activeId)` controlado. Drop da cor por `role` no badge (consistência > sinalização redundante) | Sub-tabs internas dos painéis ficam visualmente idênticas aos filter-tabs externos |
| `apps/web/src/app/dashboard/customers/page.tsx` | Wrap `<ActivityFeed>` em `<div className="relative min-h-[18rem] min-w-0"><div className="absolute inset-0">…</div></div>` | Altura igual a `/orders` |
| `apps/web/src/app/dashboard/users/page.tsx` | Mesmo wrap no `<ActivityFeed>` | Altura igual a `/orders` |
| `apps/web/src/app/dashboard/page.tsx` (home) | Já tem wrapper `min-h-[18rem]` ✅ — nenhuma mudança | Conferir apenas |
| `apps/web/src/app/design/page.tsx` (showcase) | Atualizar os 6 exemplos de Tabs pra usar `TabsCountBadge` quando aplicável; remover strings tipo `"Ativos · 24"` no label | Showcase reflete padrão real |

**Não toco:** `EntityTabs`, `CustomerTabs` (sem badge), `chrome` de detail-pages — herdam `gap-1` automaticamente, sem trabalho.

## Refactor PendingPanel ToggleGroup → Tabs

Único refactor não-trivial. Diff conceitual em `apps/web/src/components/pending-panel.tsx`:

```tsx
// ANTES
import { ToggleGroup, ToggleGroupItem } from "@emach/ui/components/toggle-group";
// ...
<ToggleGroup
  className="min-w-0 max-w-full flex-wrap justify-start"
  onValueChange={(v) => { const next = v[0]; if (next) setActiveId(next); }}
  value={[activeId]}
>
  {tabs.map((tab) => (
    <ToggleGroupItem key={tab.id} value={tab.id}>
      {tab.label}
      <Badge className={cn("ml-1.5", BADGE_COLORS[tab.role ?? "default"])} variant="outline">
        {tab.count}
      </Badge>
    </ToggleGroupItem>
  ))}
</ToggleGroup>

// DEPOIS
import { Tabs, TabsList, TabsTrigger, TabsCountBadge } from "@emach/ui/components/tabs";
// ...
<Tabs value={activeId} onValueChange={(v) => v && setActiveId(v)}>
  <TabsList className="min-w-0 max-w-full">
    {tabs.map((tab) => (
      <TabsTrigger key={tab.id} value={tab.id}>
        <span>{tab.label}</span>
        <TabsCountBadge value={tab.count} />
      </TabsTrigger>
    ))}
  </TabsList>
</Tabs>
```

**Drop intencional:** a cor por `role` (warning/success/info) do badge é descartada. O usuário pediu uniformidade. Se sinalização de severidade for necessária no futuro, fica na própria tab (ex.: bolinha de cor antes do label) ou no header do painel, não no badge.

`BADGE_COLORS` continua usado nos badges do header do `PendingPanel` (linha 153 do arquivo atual) — não é dropado inteiro, só não aplica mais às sub-tabs.

## Altura — wrapper consistente

Todas as 4 rotas (`/orders`, `/customers`, `/dashboard`, `/users`) usam exatamente este shape:

```tsx
<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  <PendingPanel compact ... />
  <div className="relative min-h-[18rem] min-w-0">
    <div className="absolute inset-0">
      <ActivityFeed ... />
    </div>
  </div>
</section>
```

`ActivityFeed` mantém `h-full` no `Card` raiz (já é). Wrapper `min-h-[18rem]` é o piso; `PendingPanel compact` (`max-h-60 min-h-44`) bate ~18rem com headers/padding. Resultado: altura visualmente alinhada em todas as rotas que têm o par.

## O que está fora de escopo

- Mudar variant `line` do `TabsList` — só `default` ganha `gap-1`.
- Mudar `EntityTabs` ou `CustomerTabs` (que não têm badge).
- Mudar tabs detail-page de orders/users/customers (são `EntityTabs`/`CustomerTabs`).
- Tooltip/hover state custom — fica como está.
- Animação de troca de tab — fica como está.
- Comportamento de URL/searchParams nos filter-tabs — fica como está.
- Re-introdução da sinalização por `role` em PendingPanel sub-tabs (drop intencional desta spec).

## Critérios de aceitação

1. `bun check-types` passa em `@emach/ui` e `web`.
2. Smoke visual em `/orders`, `/customers`, `/dashboard`, `/users`, `/reviews`:
   - Todos os filter-tabs têm `gap-1` entre triggers.
   - Todos os badges de contagem são `secondary` (ativo e inativo).
   - Altura do par PendingPanel + ActivityFeed é a mesma nas 4 rotas com esse layout.
3. PendingPanel renderiza sub-tabs como `<Tabs>` (DOM inspecionável via DevTools).
4. `/design/page.tsx` showcase reflete o padrão final.
5. Sem hydration warnings em DevTools.

## Decisões registradas

- **Badge uniforme `secondary`** (ativo + inativo). Hierarquia vem do container, não do badge. (Aprovado pelo usuário 2026-05-26.)
- **Sub-tabs do PendingPanel viram Tabs reais.** Drop da cor por `role` no badge. (Aprovado pelo usuário 2026-05-26.)
- **Wrapper `min-h-[18rem]`** em todas as 4 rotas. (Aprovado pelo usuário 2026-05-26.)
- **Helper `TabsCountBadge`** no `@emach/ui` é a fonte da verdade. Não hard-codar `<Badge variant="secondary">` em call-sites novos. (Aprovado pelo usuário 2026-05-26.)

# Design — Scroll interno no card de Atividade da dashboard

**Data:** 2026-05-18
**Status:** aprovado

## Problema

O card `ActivityFeed` na `/dashboard` cresce verticalmente conforme o número
de eventos, esticando a linha do grid e desalinhando do card de pendências ao
lado. Não há `max-height` nem scroll interno.

A query `fetchRecentActivity` (`apps/web/src/app/dashboard/page.tsx`) já tem
teto fixo de `LIMIT 15` — o "crescimento infinito" é só ausência de scroll, não
volume real de dados. Por isso **não há** lazy loading nem paginação neste
escopo (decisão explícita do usuário).

## Objetivo

O `ActivityFeed` nunca dita a altura da linha do grid: ele acompanha a altura
do card de pendências e, se os eventos passarem disso, rola internamente.

## Layout

Os dois cards vivem em `<section className="grid gap-4 lg:grid-cols-2">`. O
grid já estica ambos para a mesma altura (`align-items: stretch`); o problema é
que o `ActivityFeed` passa a ser o card alto quando tem muitos eventos.

Solução: tirar o `ActivityFeed` do cálculo de altura via wrapper posicionado.

```jsx
// dashboard/page.tsx — coluna direita do grid
<div className="relative min-h-[24rem]">
  <div className="absolute inset-0">
    <ActivityFeed events={activity} />
  </div>
</div>
```

- O wrapper contribui só `min-h-[24rem]` (piso) para o sizing da linha. O
  `PendingList` passa a ditar a altura quando for mais alto.
- No mobile (1 coluna) o piso de 24rem evita o card colapsar (o filho
  `absolute` tem altura intrínseca zero).
- O filho `absolute inset-0` preenche exatamente a célula do grid, qualquer que
  seja a altura final.

## Mudanças no `ActivityFeed` (`apps/web/src/components/activity-feed.tsx`)

- `<Card>` → `className="flex h-full flex-col"`: preenche o wrapper absoluto,
  vira coluna flex.
- `<CardHeader>` fica fixo no topo (não rola) — contador "N eventos" sempre
  visível.
- `<CardContent>` → `flex-1 min-h-0 overflow-y-auto`: região rolável. O
  `min-h-0` permite encolher abaixo do conteúdo e ativar o scroll.
- Scrollbar fina e discreta, coerente com a paleta warm-dark do design system.

Permanece Server Component puro — sem interatividade client-side.

## Fora de escopo

- Alterar a query `fetchRecentActivity` (continua `LIMIT 15`).
- Server action / endpoint de paginação.
- Lazy loading ou botão "carregar mais".
- Fade na borda inferior (YAGNI — scrollbar nativo basta).

## Testes

Mudança puramente apresentacional (CSS). Validação:

- `bun check-types`
- Smoke em `bun dev:web` na rota `/dashboard`: scroll com poucos e muitos
  eventos, simetria de altura com o card de pendências, comportamento mobile.

Sem teste unitário novo.

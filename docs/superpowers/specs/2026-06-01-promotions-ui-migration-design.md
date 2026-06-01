# Spec — Migração de Promoções para o padrão Entity/CRUD

> Data: 2026-06-01
> Status: aprovado (design), pronto para plano de implementação
> Referência canônica: `DESIGN.md` §4 (Entity detail / CRUD pattern, catálogo de cards, tríade de mutação) + `apps/web/CLAUDE.md` (Entity detail / CRUD pattern)
> Padrão-fonte: filiais (`apps/web/src/app/dashboard/branches`)

## Contexto

O entity/CRUD pattern foi consolidado em 2026-06-01 a partir do redesign das tabs de
filial e é, por decisão de produto, **o padrão do sistema**. O módulo de promoções
(`apps/web/src/app/dashboard/promotions`) precede esse padrão e diverge dele. Esta spec
descreve a migração de promoções para o padrão de filiais, **adaptando ao domínio**
(uma promoção é mais simples que uma filial: menos sub-recursos).

### Estado atual (promoções)

- **Listagem** com cards que carregam **barra de ações inline** (Pausar/Ativar + editar
  + duplicar + excluir) no rodapé — viola "cards de listagem não têm ação inline".
- **Footer do card não é edge-to-edge** (barra de botões recuada dentro de `p-4`).
- **Status badge sem ícone** (só cor + label) — viola color-blind safety.
- **Filtros** Tipo/Status em `Select` dropdowns + toggle "Filtros avançados".
- **Sem página de detalhe**: clicar abre `view-sheet` drawer (`?view=`) read-only.
- **Form de criação** em card único estreito, sem section markers.
- Header da listagem (`PageHeader` serif + CTA coral) — **já alinhado**.

### Já alinhado (reaproveitar)

- `PromotionEditSheet` já usa `EntityEditSheet` (`@/components/entity/entity-edit-sheet`).
- `DeletePromotionDialog` já é `AlertDialog` controlado.
- `PromotionFormFields` é compartilhado entre criar e editar.
- Lógica de `togglePromotionActive` / `duplicatePromotion` / `deletePromotion` existe em
  `actions.ts` (server) e em `promotion-quick-actions.tsx` (client wiring) — será relocada.

### Decisões tomadas (brainstorming)

1. **Detalhe** = página `[id]` com `EntityTabs` (alinhamento total com filiais).
2. **Tabs** = `Visão geral` + `Ferramentas` (sem tab "Resgates" — não há dado).
3. **Ações do card** = todas movidas para o detalhe/drawer (card 100% limpo).
4. **Filtros Status** = pill tabs com `TabsCountBadge` (convenção orders/users).

### Fora de escopo (achado de dados)

Tab "Resgates/uso" de cupom: **inexistente no modelo**. Schema é só `promotion` +
`promotionTool` (`packages/db/src/schema/promotions.ts`) — sem tabela de redemptions,
contador de uso ou limite. Construí-la exigiria infraestrutura de backend (escrita viria
do app ecommerce). Fica como evolução futura.

## Estrutura de arquivos

```
promotions/
  page.tsx                       [ALTERAR] cards limpos + filtros pill tabs; remove ?view e selectedPromotion
  actions.ts                     [ALTERAR] novos KPIs/contagens p/ filtros e overview (ver §7)
  [id]/page.tsx                  [NOVO]    Server Component: identity header + EntityTabs (?tab=)
  [id]/_components/
    promotion-identity.tsx       [NOVO]    EntityIdentityHeader wrapper (avatar ícone, badges, actions)
    overview-tab.tsx             [NOVO]    EntityKpisRow + descrição + bloco execução + histórico
    tools-tab.tsx                [NOVO]    grid de media-cards das ferramentas vinculadas (lazy)
    promotion-header-actions.tsx [NOVO]    client: toggle/editar/duplicar/excluir no header
  new/page.tsx                   [ALTERAR] form full-width seccionado (layout branch-new)
  _components/
    promotion-card.tsx           [REESCREVER] stat-card limpo, navega p/ [id], sem ações inline
    promotion-status-badge.tsx   [ALTERAR] adiciona ícone por status
    promotions-filters.tsx       [ALTERAR] Status → pill tabs c/ TabsCountBadge; resto secundário
    promotions-grid.tsx          [ALTERAR] remove view-sheet; mantém infinite scroll
    promotion-form-fields.tsx    [REUSAR]  (sem mudança de lógica; só reembalado em new)
    promotion-edit-sheet.tsx     [REUSAR]  renderizado a partir do detalhe (?edit=1)
    delete-promotion-dialog.tsx  [REUSAR]  acionado pelo header do detalhe
    promotion-quick-actions.tsx  [REMOVER] lógica migra p/ promotion-header-actions
    promotion-sheet.tsx          [REMOVER] view-sheet substituído pela página de detalhe
    copy-code-button.tsx         [REUSAR]  no card e no header de identidade (cupom)
```

## 1. Listagem — card (`promotion-card.tsx`, reescrita)

Adota o **shell stat-card** (referência `branches/_components/branch-card.tsx`):
`overflow-hidden`, `rounded-[10px] border border-border bg-card`, hover border-shift,
`focus-visible:ring-2 ring-ring`, `opacity-70` quando `status` é `inactive`/`expired`.

- **Header** `flex items-start gap-3 px-4 pt-4 pb-3`:
  - Avatar quadrado `size-12 rounded-[10px] border bg-muted` com ícone:
    `Tag` (type `promotion`) ou `Ticket` (type `promocode`).
  - `min-w-0 flex-1`: título (`font-semibold text-[15px] line-clamp-1`) + subtitle
    com o tipo ("Automática" / "Cupom"); chip de código mono (`CopyCodeButton`) quando cupom.
  - Badge de status (com ícone, ver §5) no topo à direita.
- **Corpo** `px-4 pb-3`: desconto `font-medium text-[32px] text-primary tabular-nums` +
  janela de datas (`formatJanela`) em `text-[11px] text-muted-foreground`.
- **Footer edge-to-edge** `grid grid-cols-2 border-t` (cada célula `flex flex-col items-center py-3`,
  divisória `border-r` na primeira):
  - `Ferramentas` = `promotion.tools.length` (tone default; `text-warning` se 0)
  - `Dias restantes` = dias até `endsAt` (ou "Sem prazo" / "Agendada" / "Expirada")
  - valor `font-bold text-[20px] tabular-nums`, label `text-[10px] uppercase tracking-wider`.
- Card inteiro: `<Link href={/dashboard/promotions/${id}}>` (ou `role=button`+onClick se
  precisar de algum stopPropagation interno — preferir `<Link>` já que não há mais ações internas).
- **Remover** `PromotionQuickActions` do card.

`promotions-grid.tsx`: continua usando `useInfiniteList` + `<InfiniteSentinel>`; remove a
renderização de `PromotionSheet` (view) e de `selectedPromotion`. `editPromotion`/edit-sheet
saem da listagem (passam a viver no detalhe). Skeleton no shape do novo card.

## 2. Listagem — filtros (`promotions-filters.tsx`, alterada)

- **Status → pill tabs** (`Tabs` variant default) com `<TabsCountBadge value={N} />`:
  `Todos` · `Ativa` · `Agendada` · `Expirada` · `Inativa`. Sincroniza `?status=`
  (default `all` omite o param). Contagens vêm de um agregado server-side (ver §7).
- **Busca** (debounced), **Tipo** (Automática/Cupom) e **Filtros avançados**
  (desconto min/máx, ferramenta) permanecem como controles secundários **abaixo** das tabs,
  no `FiltersBar` existente.
- Mantém `useFilterState` / `useDebouncedParam`.

## 3. Detalhe — `[id]/page.tsx` (Server Component)

Espelha `branches/[id]/page.tsx`.

- `requireCapability("promotions.manage")` (ou `requireCurrentSession` + `can`, igual à listagem).
- `getPromotion(id)` → `notFound()` se nulo. Carregar KPIs/agregados do overview (ver §7).
- `EntityIdentityHeader`:
  - `avatarFallback` = ícone `Tag`/`Ticket` conforme tipo.
  - `title` = `promotion.title`.
  - `subtitle` = tipo ("Automática" / "Cupom") + janela; código mono com `CopyCodeButton` se cupom.
  - `badges` = `<PromotionStatusBadge status={...} />`.
  - `actions` = `<PromotionHeaderActions tab={sp.tab} promotion={...} />` (contextual).
- `EntityTabs` (`defaultValue="overview"`, sincroniza `?tab=`):

| Tab | value | badge | Conteúdo | Ação no header |
|---|---|---|---|---|
| Visão geral | `overview` | — | `OverviewTab` | Editar + Ativar/Pausar + ⋮ (Duplicar/Excluir) |
| Ferramentas | `tools` | `secondary` N | `ToolsTab` (lazy: só quando `sp.tab==='tools'`) | Gerenciar ferramentas (`?edit=1`) |

- `PromotionEditSheet` renderizado quando `sp.edit === "1"` (igual `BranchEditSheet`).

### `promotion-header-actions.tsx` (client)

Migra a lógica de `promotion-quick-actions.tsx`. Recebe `tab` e decide:
- **overview**: botão **Editar** (`Link` `?edit=1`, variant default/coral) +
  **Ativar/Pausar** (`togglePromotionActive`, variant secondary, ícone `PlayCircle`/`PauseCircle`) +
  **menu ⋮** (`DropdownMenu`) com **Duplicar** (`duplicatePromotion` → `push([novoId]?edit=1)`) e
  **Excluir** (abre `DeletePromotionDialog`; sucesso → `push('/dashboard/promotions')`).
- **tools**: botão **Gerenciar ferramentas** (`Link` `?edit=1`, variant default).

> Nota: o padrão de filiais usa **uma** ação primária por tab. Promoções têm mais ações de
> alto uso (toggle, duplicar). Mantemos a ação primária coral (Editar) + secundárias no
> mesmo slot `actions` (que é `flex flex-wrap gap-2`), com Duplicar/Excluir colapsadas no ⋮
> para não poluir. É a adaptação ao domínio permitida pelo pattern.

### `overview-tab.tsx`

- `EntityKpisRow` com 4 itens:
  1. **Desconto** — `discountPct` formatado (`15,00%`), tone `default`, ícone `Percent`.
  2. **Ferramentas** — `tools.length`, tone `default` (`warning` se 0), ícone `Wrench`,
     `href="?tab=tools"`.
  3. **Início** — `startsAt` formatado ou "Imediato", ícone `CalendarPlus`.
  4. **Término** — `endsAt` formatado ou "Sem prazo"; `hint` = dias restantes;
     tone `warning` se faltam <7 dias, `danger` se expirada, ícone `CalendarClock`.
- **Descrição** — bloco de texto (`description` ou placeholder "Sem descrição").
- **Bloco "Execução"** — card com toggle Ativa/Pausar + texto
  "Aparece no site para clientes elegíveis" (reaproveita visual do view-sheet atual).
- **Histórico** — "Criada em … por …" / "Atualizada em … por …" (`createdByName`/`updatedByName`).

### `tools-tab.tsx`

- Grid de **media-cards** das ferramentas vinculadas espelhando o card de estoque
  (`stock/_components/branch-stock-card.tsx`): thumb (`thumbUrl`, `next/image` ou `<img>`
  Supabase com biome-ignore), nome linkado (`/dashboard/tools/[id]`), SKU mono,
  chip "−{discountPct}%".
- Empty state quando `tools.length === 0`: aviso "Nenhuma ferramenta vinculada" + CTA
  "Gerenciar ferramentas" (`?edit=1`).
- Carregamento **lazy** (a tab só monta quando `sp.tab==='tools'`).

## 4. Criação — `new/page.tsx` (alterada)

Reaproveita `PromotionFormFields` (sem mudança de lógica), reembalado no layout do
`branches/new`: full-width, section markers caps (`TIPO` · `IDENTIDADE` · `DESCONTO &
VIGÊNCIA` · `FERRAMENTAS`), helper text sob campos relevantes, footer Criar promoção
(coral) + Cancelar. Mantém página `/new` (consistência com filiais), mesmo o form sendo enxuto.

## 5. Status badge (`promotion-status-badge.tsx`, alterada)

Adiciona ícone (color-blind safe — ícone + label + cor):

| Status | variant | ícone (lucide) |
|---|---|---|
| `active` | `success` | `CheckCircle2` |
| `scheduled` | `info` | `Clock` |
| `expired` | `secondary` | `CalendarX` |
| `inactive` | `outline` | `PauseCircle` |

## 6. Polish (`/impeccable`)

Após o esqueleto funcional e smoke visual (3007), passada de `/impeccable` no card e no
detalhe: hierarquia, espaçamento, ring/focus, motion, alinhamento dos KPIs. **Não** antes
do funcional. Verificação visual obrigatória antes de claim de conclusão (regra de UI).

## 7. Server / data (`actions.ts`)

- **Contagens por status** para as pill tabs: um agregado server-side (ex:
  `getPromotionStatusCounts()`) retornando `{ all, active, scheduled, expired, inactive }`,
  computado com os mesmos predicados SQL de `fetchPromotionsPage` (reaproveitar a lógica de
  `computeStatus`/predicados). Chamado na `page.tsx` da listagem.
- `getPromotion(id)` já retorna o necessário para o overview (incluindo `tools`,
  `createdByName`, `updatedByName`, `toolIds`). KPIs derivam de campos já presentes —
  sem nova query além das contagens.
- Sem mudança nos contratos de mutação (`createPromotion`/`updatePromotion`/
  `togglePromotionActive`/`duplicatePromotion`/`deletePromotion`).

## Riscos / atenção

- **`check-types` não pega** import de hook client em Server Component nem fronteira
  RSC/client — smoke visual obrigatório no browser após mexer em página/tab
  (`apps/web/CLAUDE.md`). Validar `?tab=tools` lazy e `?edit=1` no detalhe.
- **Hook auto-format PostToolUse** (`bun fix`) pode reordenar campos — re-ler se um Edit
  subsequente falhar `old_string`.
- **Permissões**: `promotions.manage` está sob ADR-0012 (gates no-op) — manter as chamadas
  `requireCapability`/`can` como guard-rails; não remover.
- **IDs**: `crypto.randomUUID()` no caller (já é o padrão em `actions.ts`).
- Após mudanças, rodar `bun check-types` antes de qualquer commit.

## Critérios de aceite

1. Card de promoção sem ações inline, footer edge-to-edge, navega para `[id]`.
2. Página `[id]` com identity header + tabs `Visão geral`/`Ferramentas`, ações
   contextuais por tab, edição em drawer (`?edit=1`), excluir via AlertDialog.
3. Filtro de status em pill tabs com contagens corretas.
4. Status badge com ícone em todos os 4 estados.
5. Form de criação seccionado full-width.
6. `bun check-types` passa; smoke visual nas rotas afetadas na 3007.

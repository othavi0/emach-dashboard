# Design System — emach dashboard (Editorial workshop, dark-only, coral + serif)

> Dashboard interno emach. Dark-mode único, AAA, voz híbrida editorial-meets-workshop. Re-aproxima a paleta Anthropic (coral + Cormorant em h1/h2 + ritmo de surfaces) sem perder o dark-only nem a voz industrial. Substitui a iteração "industrial neutrals + copper" — copper hue 45 sai, coral hue 38 entra; serif ganha espaço sistêmico em h1/h2 (não mais restrito a login).

## 1. Visão & Atmosfera

Dashboard emach é ferramenta de oficina **com voz editorial discreta**. Painel de controle warm-dark, headlines em serif (Cormorant Garamond), corpo e UI chrome em humanist sans (Inter), cor-como-sistema — cada role tem matiz própria reconhecível à distância. A inspiração de paleta vem da Anthropic (coral + ritmo de surfaces); a inspiração de densidade e voz vem do workshop industrial.

Assinatura visual:

1. **Canvas warm-dark** com **6 níveis de elevação** distintos (surface-deep → background → muted → card → border → input/secondary). Toda neutra tem chroma warm (oklch hue ~70).
2. **Primary coral** `oklch(0.65 0.13 38)` ≈ `#cc785c` — coral Anthropic literal, hue 38, levemente rosado, distinto de copper queimado. Aparece em CTA primário, focus ring, brand stamp.
3. **6 roles cromáticos** com matizes separadas por ≥20° de hue circle: coral / mustard / pure red / teal / jade / warm graphite. Estado se lê pelo rabo do olho.
4. **Tipografia editorial-funcional.** Serif (Cormorant Garamond weight 400, tracking-tight) em h1 + h2 de todas as páginas — é a voz do dashboard, não mais exceção. Sans (Inter) em h3, body, UI chrome, sidebar.
5. **AAA + reduced motion** não-negociável. Contraste 7:1 em body, focus ring sólido 2px, animações respeitam `prefers-reduced-motion`.
6. **Depth via surface contrast**, não shadow. Hairline borders + ring sutil + bg-shift fazem o trabalho de elevação. Surface-deep (`0.11`) cria "wells" para code/log/featured no meio de surfaces normais.

## 2. Paleta

Tokens em `packages/ui/src/styles/globals.css`, escopados em `.dark`. Use Tailwind tokens (`bg-card`, `text-foreground`, `bg-warning`, `bg-surface-deep`, etc.) — **nunca** hardcode hex.

### Surfaces (escuro → claro)

| Token | OKLCH | Hex aprox | Uso |
|---|---|---|---|
| `--surface-deep` | `0.11 0.005 70` | `#141210` | "Well" para code blocks, terminal/log viewers, hero de empty state, featured-card-dark |
| `--sidebar` | `0.13 0.004 70` | `#171612` | Sidebar — mais escuro que background |
| `--background` | `0.16 0.005 70` | `#1d1b18` | Page floor |
| `--muted` | `0.18 0.004 70` | `#221f1c` | Inset: tracks slider, skeletons, code inline, tab list bg |
| `--card` / `--popover` / `--accent` | `0.20 0.005 70` | `#262320` | Cards, popovers, dialogs — surface elevated |
| `--border` | `0.36 0.008 70` | `#4a4641` | Hairline visível sobre background e card — degrau elevação |
| `--input` | `0.42 0.010 70` | `#57524c` | Borda inputs/selects/textareas — 1 degrau acima do border (affordance) |
| `--secondary` | `0.42 0.020 70` | `#5c554d` | Botão secundário, surface ênfase média |

### Roles cromáticos (6 distintos)

| Role | Token | OKLCH | Hex | FG | Uso |
|---|---|---|---|---|---|
| **Primary (coral)** | `--primary` | `0.65 0.13 38` | `#cc785c` | `#fefefe` | CTA primário, focus ring, brand stamp, chart-1, callout-card-coral |
| **Secondary** | `--secondary` | `0.42 0.020 70` | `#5c554d` | `#faf9f5` | Ações neutras, badges sem destaque |
| **Destructive (pure red)** | `--destructive` | `0.55 0.20 15` | `#c24a40` | `#fefefe` | Erro, cancelado, deletar, falha de validação |
| **Warning (mustard)** | `--warning` | `0.78 0.15 85` | `#cfa845` | `#1d1b18` | Estoque mínimo, ação reversível precisa atenção, deadline próximo |
| **Info (teal)** | `--info` | `0.65 0.10 200` | `#5da8ac` | `#1d1b18` | Notificação neutra, link secundário, status "em processamento" |
| **Success (jade)** | `--success` | `0.62 0.13 155` | `#3fa580` | `#fefefe` | Confirmação, status "entregue/pago", saldo positivo |

**Distinção de hue:** primary 38 → destructive 15 → warning 85 → info 200 → success 155 → secondary 70. Mínimo 20° entre matizes vizinhas no círculo cromático. Coral (38) vs destructive (15) tem 23° — preservado mesmo com hue do primary descendo.

### Foreground

| Token | OKLCH | Uso |
|---|---|---|
| `--foreground` | `0.97 0.008 85` | Texto primário on-dark |
| `--muted-foreground` | `0.70 0.010 75` | Secondary text, captions, metadata |

### Charts (5 séries)

`--chart-1` coral · `--chart-2` mustard · `--chart-3` teal · `--chart-4` jade · `--chart-5` pure red. Cada série tem matiz própria — distintas mesmo em escala de cinza (luminância separada por ≥0.06).

### Ring

`--ring` = primary 75% alpha. Componentes aplicam **`ring-1 ring-ring ring-offset-1 ring-offset-transparent`** — hairline coral 1px afastado 1px do elemento. Single line, sem border flip (border flip + ring criava efeito duplo feio). Para AAA estrito (WCAG 2.2 SC 2.4.13), o halo de 2px transparente + ring 1px ocupa área equivalente a 2px perimeter colorido com separação do bg. SC 2.4.7 (foco visível) atendido confortavelmente.

## 3. Tipografia

Carregada via `next/font/google` em `apps/web/src/app/layout.tsx`:

- **Sans (body, UI chrome, h3+, sidebar):** Inter variable. Token `font-sans`, var `--font-sans-loaded`.
- **Serif (h1 + h2 de todas as páginas, login hero, capa de relatório):** Cormorant Garamond. Token `font-serif`, var `--font-serif-loaded`. **É a voz do dashboard** — não mais momento isolado. Substituto open-source do Copernicus/Tiempos Headline da Anthropic.
- **Mono (código):** stack do sistema. Token `font-mono`.

### Hierarquia funcional

Display e h1/h2 em **serif weight 400** com `tracking-tight` (-0.025em). Sans 400/500 em tudo abaixo. A divisão display/body é editorial:

| Função | Classes Tailwind | Notas |
|---|---|---|
| Display (overview, hero) | `font-serif text-5xl font-medium tracking-tight` | 48px / weight 500. Páginas de overview, login hero, capa de relatório. |
| h1 página | `font-serif text-4xl font-medium tracking-tight` | 36px / weight 500. Cormorant em **todas** as páginas. Weight 500 compensa thinness do Cormorant em dark. |
| h2 seção | `font-serif text-2xl font-medium tracking-tight` | 24px / weight 500. Cormorant em headers de seção. |
| h3 sub-seção | `font-sans text-sm font-semibold uppercase tracking-wider` | 14px caps — section marker (sans, não serif) |
| Title prominent | `font-sans text-base font-medium` | 16px — card titles em listas, dentro de tabelas |
| Body padrão | `font-sans text-sm leading-relaxed` | **14px / 1.625** — UI chrome, baseline do dashboard |
| Body alternativo | `font-sans text-base leading-relaxed` | 16px — páginas de leitura intensa (descrição de ferramenta) |
| Caption | `font-sans text-xs text-muted-foreground` | 12px — metadata, helpers, footers de tabela |
| Caption uppercase | `font-sans text-[11px] tracking-widest uppercase font-medium` | Section marker, badge text |
| Code | `font-mono text-xs` | SKU, IDs, atalhos, valores literais |

### Princípios

- **Serif = voz editorial em h1/h2.** Weight **500** + tracking-tight é o piso em dark mode (Cormorant 400 fica fino em dark; 500 compensa sem virar bombástico). Nunca 600+. Anthropic light pode usar 400, mas dark exige peso.
- **Sans em todo o resto.** Body, h3, controls, sidebar, tabelas, forms, cards: Inter 400/500. Contraste por peso (`font-medium` 500 em titles).
- **Escala mantém ratio ≥1.25:** display 48 → h1 36 (1.33) → h2 24 (1.5) → h3 14 (1.71) → body 14. Hierarquia clara.
- **Body em 14px (`text-sm`)** baseline. AAA exige 7:1 — `--foreground` sobre `--background` cumpre.
- **Line-height generosa** (`leading-relaxed` 1.625). Sessão longa, equipe lê muito.
- **Nunca text-xs em body principal** — fica denso demais mesmo pra equipe interna.

## 4. Componentes

50+ shadcn buildados sobre `@base-ui/react` em `packages/ui/src/components/*`.

### Buttons

`packages/ui/src/components/button.tsx`. Variants:

| Variant | Uso |
|---|---|
| `default` | CTA primário (coral) — máximo 1 por surface |
| `secondary` | Ação neutra, opção paralela |
| `outline` | Ação terciária com borda visível |
| `ghost` | Ação inline, baixa hierarquia |
| `destructive` | Deletar, cancelar pedido, anonimizar cliente |
| `warning` | Ação reversível com atenção: reverter pagamento, descartar variantes órfãs |
| `info` | Notificação acionável, "ver detalhes" em alert info |
| `success` | Confirmar conclusão: "marcar como entregue", "aprovar review" |
| `link` | Inline link textual |

Todos compartilham focus state idêntico: `focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent` (hairline com halo, sem border flip — consistente com §7). Variants destructive/warning/info/success substituem ring color pela própria role (`ring-destructive/40` etc) — focus combina com a ação.

Sizes: `xs / sm / default / lg / icon / icon-xs / icon-sm / icon-lg`.

### Listing row actions

Toda tabela de listagem (`/dashboard/<recurso>` com itens enumeráveis) **deve** ter última coluna de ações inline. Use os helpers do Table:

- **`<TableActionsHead />`** — coluna de cabeçalho. `w-px` + `text-right` + label "Ações" default (override passando children).
- **`<TableActionsCell>...</TableActionsCell>`** — célula. Wraps automaticamente os filhos num `<div className="flex justify-end gap-1">`. Não use `<TableCell>` manualmente para ações.

```tsx
<TableHeader>
  <TableRow>
    {/* ...colunas... */}
    <TableActionsHead />
  </TableRow>
</TableHeader>
<TableBody>
  <TableRow>
    {/* ...células... */}
    <TableActionsCell>
      <Button aria-label="Ver pedido #X" size="icon-sm" variant="outline">
        <Eye aria-hidden className="size-3.5" />
      </Button>
      <Button aria-label="Editar pedido #X" size="icon-sm" variant="secondary">
        <Pencil aria-hidden className="size-3.5" />
      </Button>
      <Button aria-label="Remover pedido #X" size="icon-sm" variant="destructive">
        <Trash2 aria-hidden className="size-3.5" />
      </Button>
    </TableActionsCell>
  </TableRow>
</TableBody>
```

**Botões-ícone uniformes:** `size="icon-sm"` (28px), `aria-label` descritivo (inclui identificador da linha — "Editar pedido #10421"), `aria-hidden` no SVG, ícone `size-3.5`.

| Ação semântica | Trigger | Variant | Icon (lucide-react) |
|---|---|---|---|
| Abrir / Ver detalhe | `<Link>` | `outline` | `Eye` |
| Editar | `<Link>` ou `<Button>` | `secondary` | `Pencil` |
| Remover | `<AlertDialogTrigger>` + `<Button>` | `destructive` | `Trash2` |
| Gerenciar estoque | `<Link>` | `secondary` | `Boxes` |
| Ajustar (modal) | `<DialogTrigger>` + `<Button>` | `outline` | `Sliders` |
| Navegar p/ recurso de outro contexto | `<Link>` | `ghost` | `ArrowUpRight` |

**Ordem recomendada:** Ver → Editar → Remover (read → write → destroy, alinhado com risco crescente da esquerda pra direita). Destructive vem por último.

**Permissão:** quando ação depende de capability, renderize condicionalmente — não desabilite. Se a row inteira não tem ações disponíveis para esse user, omita `<TableActionsCell>` (a coluna fica vazia mas a column header continua presente — mantém grid consistente).

**Manter texto** em ações onde o número/contagem é a informação principal (`Ver 3 filiais`) ou em mutações críticas inline (`Salvar` em threshold dirty). Ícone esconde valor que o usuário precisa ler à distância.

**Tabela é para coleção aninhada dentro de uma página de detalhe — não para a listagem-raiz de um recurso.** As listagens principais (`/dashboard/orders`, `customers`, `tools`, `suppliers`, `reviews`) migraram para **card-grid** (ver catálogo de cards). Tabela hoje só em sub-recursos densos. Implementação canônica: `apps/web/src/app/dashboard/customers/_components/customer-orders-table.tsx`, `categories/_components/attributes-table.tsx`; showcase em `/design#table`.

**Layout de larguras (dados à esquerda, ações à direita):** `TableActionsHead` e `TableActionsCell` já carregam `w-full` internamente — a coluna de ações absorve toda sobra horizontal e mantém os botões alinhados à direita (`text-right` + `flex justify-end`). Resultado: todas as colunas de dado (ID, Cliente, Status, Total, etc) encolhem ao próprio conteúdo e ficam clusterizadas naturalmente à esquerda. Não use `w-full` em nenhuma coluna de dado — quebra o pattern.

```tsx
<TableRow>
  <TableHead>ID</TableHead>
  <TableHead>Cliente</TableHead>
  <TableHead>Status</TableHead>
  <TableHead className="text-right">Total</TableHead>
  <TableActionsHead />   {/* w-full embutido; absorve sobra horizontal */}
</TableRow>
```

Se quiser destacar uma coluna específica como "principal" (Cliente expandindo até a borda das ações), aí sim adicione `className="w-full"` nela — vira a stretch column e empurra Status/Total pro lado das ações. Pattern alternativo, não default.

**Spacing canônico:** `TableHead` (`h-10 px-3`) e `TableCell` (`px-3 py-2.5`) já vêm padronizados em `packages/ui/src/components/table.tsx` — não sobrescreva por linha. Densidade alvo: 40px header / ~36px row. Se precisar de uma table mais compacta (drawer/dialog), aplique no `<Table>` wrapper via `[&_td]:py-1.5 [&_th]:h-8`.

**Truncate para texto livre:** colunas de nome, email, descrição podem receber strings longas que estouram o layout (especialmente em conjunto com coluna de ações que absorve sobra). Use `className="max-w-[NNpx] truncate"` na `TableCell` — `truncate` sozinho **não funciona** porque a célula expande para caber o conteúdo. Largura típica: 200px para nome, 240px para email, 320px para descrição curta. Exemplo:

```tsx
<TableCell className="max-w-[200px] truncate">
  Construtora Aliança e Empreendimentos Brasil Ltda
</TableCell>
```

Quando o conteúdo é crítico (usuário precisa ler o nome inteiro), prefira `<Tooltip>` em volta ou empilhe nome + subtitle (`<div className="flex flex-col"><span className="truncate">...</span><span className="text-muted-foreground text-xs">...</span></div>`) em vez de truncar sem affordance.

### Badges

`packages/ui/src/components/badge.tsx`. Mesmo conjunto de variants do Button — `default / secondary / destructive / warning / info / success / outline / ghost / link`. Variants saturadas carregam `border-background/40` (hairline escuro 40% alpha) que cria separação quando a badge sita em surfaces coloridas (ex: badge warning dentro de tab ativa coral). Use a role apropriada ao estado:

- `default` (coral) — destaque positivo / "Novo" / brand stamp
- `secondary` — status neutro / contagem / "Rascunho"
- `destructive` — "Cancelado" / "Erro de cadastro"
- `warning` — "Estoque baixo" / "Vence em 3d"
- `info` — "Em processamento" / "Aguardando NF"
- `success` — "Pago" / "Entregue" / "Ativo"
- `outline` — "Arquivado" / categorias secundárias

### Status visual (ícone + cor + label — fonte única)

Status que se repete em vários lugares (badge, histórico, pendências) deve ter **uma fonte única** de ícone + cor + label, nunca redefinida por componente. Pattern em Pedidos:

- **Vocabulário compartilhado:** `apps/web/src/components/status-visual.tsx` — `STATUS_ICONS` (chave→ícone lucide), `TONE_TEXT` (tone→classe `text-*`), `TONE_BADGE_VARIANT` (tone→variant do `<Badge>`). Tipos `StatusIconKey`, `Tone`.
- **Mapa de dados por status:** `orders/status-meta.ts` → `ORDER_STATUS_META: Record<OrderStatus, { label; iconKey; tone }>`. `ORDER_STATUS_LABELS` deriva dele. Consumido por `OrderStatusBadge`, histórico e pendências — mudar o ícone/cor/label de um status é um ponto só.
- **`iconKey`/`tone` são strings serializáveis** de propósito: server actions (ex: histórico via `fetchOrderActivityPage`) carregam a chave no payload e o componente client resolve para ícone/cor. Não passe `LucideIcon` por server boundary.
- Replicar o pattern para outras entidades com status (reviews, estoque): criar o `*_STATUS_META` da entidade reusando `status-visual`.

Regra de color-blindness (§7) continua: status = **ícone + label + cor**, nunca só cor.

### Alerts

`packages/ui/src/components/alert.tsx`. Mesmo padrão de roles: `default / destructive / warning / info / success`. Bg sempre `bg-card` — texto carrega cor da role. Mantém legibilidade em dark sem fill saturado dominante.

### Inputs

- `Input` / `Textarea` / `Select` / `Combobox` / `Field`:
  - **Default:** `bg-transparent` + `border-input` (`#57524c`) — hairline forte sobre card e background.
  - **Focus:** border flipa pra `border-ring` + `ring-2 ring-ring` (coral 55%). 2px sólido.
  - **Invalid:** `border-destructive` + `ring-1 ring-destructive/20`.
- `Checkbox` / `RadioGroup` / `Switch`: bg coral quando checked.

### Help tooltip (`HelpTooltip`)

Ajuda contextual de campo de formulário. `apps/web/src/components/help-tooltip.tsx` — gatilho `CircleHelp` (`size-4`, `text-muted-foreground` → `hover/focus:text-info`) dentro do `<Label>`/`<h3>` (container em `flex items-center gap-1.5`). Sobre `HoverCard` do base-ui (fecha no Esc nativo — WCAG 1.4.13). Union de dois modos:

- **Curto** (`text`) — uma frase de desambiguação. `HoverCardContent` `max-w-[240px]`.
- **Rico** (`title` + `body` + `example?`) — `w-72`; título `font-semibold`, body `text-muted-foreground`, e `example` opcional num well `bg-surface-deep` `font-mono text-[11px] text-info`.

Regra: converter `<p>` verboso de helper em tooltip; **manter visível** caveat comportamental (ex: "faixas de CEP não restringem pedidos"). Em uso: tools (identity/logistics/publish), branches, suppliers, categories/attributes. Detalhe de uso em `apps/web/CLAUDE.md`.

### Tabs

`packages/ui/src/components/tabs.tsx`. Sobre `@base-ui/react`. 2 variants × 2 orientations × scrollable opcional.

**Variants:**

| Variant | Aparência | Uso |
|---|---|---|
| `default` (padrão) | Pill group em `bg-muted` com `ring-1 ring-border/60` (track visível mesmo dentro de card) + **`gap-1` embutido**. Aba ativa em `bg-primary` coral sólido com `text-primary-foreground` | Filtros primários, segmentação principal (ex: "Ativos / Pendentes / Suspensos") |
| `line` | `border-b border-border` na lista (a linha base) + `gap-1`. Aba ativa em `text-primary` coral com underline `after:bg-primary` 2px | Sub-navegação dentro de página de detalhe (ex: tabs em customer-tabs perfil/endereços/pedidos) |

Aba ativa sempre carrega coral (primary). Estado inativo em `text-muted-foreground`, hover sobe pra `text-foreground` (mantém neutro até o user comprometer com a aba). `gap-1` é default — **não passe `className="gap-1"` manual**.

**Orientations:** `horizontal` (default) e `vertical` (passe `orientation="vertical"` no `<Tabs>`).

**Scrollable:** `<TabsList scrollable>` — adiciona overflow-x-auto + fade gradient à direita quando há mais abas que cabem. Use quando muitas categorias possíveis (customer-tabs com perfil/endereços/pedidos/pagamentos/reviews/LGPD/auditoria).

**Padrão de contagem — `<TabsCountBadge value={N} />`:**

```tsx
<TabsTrigger value="paid">
  Pagos
  <TabsCountBadge value={count} />
</TabsTrigger>
```

Helper exportado de `@emach/ui/components/tabs`. Wrapper sobre `<Badge variant="secondary">` com `ml-1.5 tabular-nums` embutido. **Sempre `secondary` — em ativo e inativo.** Hierarquia visual vem do container (a tab ativa muda pra `bg-primary`); o badge não duplica essa diferença, e quando duplica fica dois dourados brigando dentro da mesma tab. Padrão único de filter-tab no sistema — não hard-code `<Badge variant="secondary">` em call-sites novos.

**Exceção — badge de alerta:** quando a contagem é uma alerta acionável e não decorativa (ex: pendências críticas), pode usar Badge custom com `warning` ou `destructive`. Mas isso é exceção, não regra; o default é `TabsCountBadge`:

```tsx
<TabsTrigger value="pending">
  Pendentes
  {count > 0 && <Badge className="ml-1.5" variant="warning">{count}</Badge>}
</TabsTrigger>
```

**Regras:**
- Use `default` em filtros e segmentação de listagem; `line` em sub-navegação de detalhe.
- Não use mais de 7 abas horizontais sem `scrollable` — dá overflow silencioso.
- Não use 2 níveis de tabs aninhadas — vira labirinto. Use sidebar/sub-rota.
- Body de `<TabsContent>` em `text-xs/relaxed` por padrão (component baseline).
- Para sub-tabs internas em painéis (PendingPanel etc.), use `<Tabs>` — **não `<ToggleGroup>`**. ToggleGroup é pra multi-seleção visual; tab é pra seleção única.
- **Segmented control / mode-switcher in-form** (ex: Entrada/Baixa/Ajuste na drawer de estoque) segue o **mesmo** padrão `default`: track `bg-muted ring-1 ring-border/60` + aba ativa **`bg-primary` coral**. **Não** rolar um controle custom com active `bg-background` elevado (iOS-style) — destoa do resto do sistema. Quando o switcher troca o corpo do form (não é filtro), botões custom com essas classes são aceitáveis; o que não pode é divergir da cor ativa coral.

**Tabs split (dois grupos semânticos).** Quando os filtros se dividem em dois grupos de significado distinto, renderize **dois `<TabsList>`** dentro do mesmo `<Tabs>`, num `flex justify-between` — cada lista vira sua própria pílula `bg-muted`, comunicando os grupos por separação espacial. Canônico: Pedidos (`order-list-filters.tsx`) — esquerda = fluxo do operador (Pago/Em preparação/Enviados/Entregues), direita = fora do fluxo (Aguardando pagamento/Devolvidos/Cancelados). Sem tab "Todos": a página abre listando tudo, **sem tab ativa**; clicar numa tab filtra e clicar na ativa de novo volta a "todos" (toggle, via href que remove o param). Use só quando os grupos têm leitura semântica clara — não para quebrar uma lista longa arbitrariamente.

Implementação canônica: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` (filter com TabsCountBadge + **tabs split**), `apps/web/src/app/dashboard/users/page.tsx` (filter com TabsCountBadge), `apps/web/src/app/dashboard/customers/_components/customer-tabs.tsx` (scrollable ~7 abas, sem badge), `apps/web/src/components/pending-panel.tsx` (sub-tabs em painel), `apps/web/src/app/design/page.tsx` (showcase).

### Cards & Containers

- `Card`: `bg-card` (#262320), ring `ring-1 ring-foreground/10` (substitui border tradicional), padding interno 16–32px.
- `Dialog` / `Popover`: mesma elevação que Card, portal `z-50`.
- Sidebar: `bg-sidebar` (#171612) — mais escuro que background.

### Catálogo de cards de listagem (4 arquétipos)

Cards de grid/listagem seguem 4 arquétipos. Todos compartilham o **shell** e o **footer edge-to-edge** abaixo; o miolo varia por entidade. Adaptar campos ao domínio é esperado — o esqueleto é que é fixo.

**Shell comum:** `rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`. Card inteiro clicável: ou `<Link>` direto (quando não há ações secundárias), ou `<div role="button" tabIndex={0}>` + `onClick`/`onKeyDown` (Enter/Space) quando há ações internas que precisam de `stopPropagation`.

| Arquétipo | Quando | Miolo | Canônico |
|---|---|---|---|
| **Stat-card** | Entidade com métricas-resumo (filiais, pedido na listagem) | Header (avatar quadrado de iniciais + nome/nº + meta + status badge) + footer de N métricas | `branches/_components/branch-card.tsx`; `orders/_components/order-card.tsx` (pedido: avatar de iniciais do cliente + nº + 📍 filial + footer Itens · Total · Data) |
| **Media-card** | Item com imagem (estoque/produto) | Imagem 16:9 no topo + badge de status absoluto (`top-2 right-2`) + corpo (nome linkado + SKU/meta) + footer de métricas | `stock/_components/branch-stock-card.tsx` |
| **Identity-card** | Pessoa (equipe, usuário) | Avatar `52px` `rounded-[10px]` + nome + email + status badge no topo; footer com `role · último login` + 1 ação (`outline`/`ghost`) | `branches/[id]/_components/team-member-card.tsx`, `users/_components/user-card.tsx` |
| **Entity-card** | Registro sem imagem em coleção **aninhada** (pedidos na aba de uma filial) | Ícone em avatar quadrado + título (número/id) + data + status badge; footer com valor centralizado + label | `branches/[id]/_components/orders-tab.tsx` |

A **listagem-raiz de pedidos** usa o **Stat-card** (`order-card.tsx`, footer de 3 métricas); o **Entity-card** (footer de 1 métrica) fica para a versão compacta dentro de coleções aninhadas.

### Footer edge-to-edge (regra de card)

O footer de um card é uma faixa que **encosta nas bordas laterais e inferior** — a `border-t` (e as divisórias `border-r` entre métricas) vai de ponta a ponta, nunca recuada por padding. Três formas conforme a estrutura do card:

1. **Container sem padding** (`overflow-hidden`, header com padding próprio `px-4 pt-4 pb-3`): footer é filho direto com `border-t` → já é edge-to-edge. Usado em stat/media/entity-card.
2. **Container com padding** (`p-4`): footer recompõe com `-mx-4 px-4 border-t pt-3` (margem negativa fura o padding, `px-4` devolve o respiro do conteúdo). Usado em identity-card.
3. **Dentro de shadcn `<Card>`** (`py-4` + `px-4` no `CardContent`): footer usa `-mx-4 -mb-4`; o `overflow-hidden rounded-lg` do `Card` arredonda os cantos inferiores. Usado no card de Operação da Visão geral.

**Footer de métricas:** `grid grid-cols-N border-t`; cada célula `flex flex-col items-center py-2.5` com `border-r` (último sem); valor `font-bold text-[18px] tabular-nums`, label `text-[9px] uppercase tracking-wider text-muted-foreground` embaixo. O valor pode herdar a cor da role do status (ex: Qtd em `text-destructive` quando zerada/crítica, `text-amber-500` em repor; Total do pedido em `text-primary`). Footer de valor único usa 1 coluna centralizada (valor + label "Total") — é o caso do entity-card de pedido **aninhado**; já a **listagem-raiz** de pedidos usa 3 colunas (Itens · Total · Data).

### Listagem / scroll infinito (rodapé)

Toda listagem de grid usa `useInfiniteList` + `<InfiniteSentinel>` (`src/components/infinite-sentinel.tsx`), page size `BATCH_SIZE = 20`, auto-load 200px antes do fim.

- **Sem "fim da lista".** Quando acaba, o sentinel renderiza `null` — a ausência de mais cards já comunica o fim. Nunca exibir texto decorativo de rodapé.
- **Loading:** `skeleton` (prop opcional — grid de placeholders no shape do card, ex: `branch-card-skeleton.tsx`) ou, sem ele, um spinner discreto (`Loader2 animate-spin text-muted-foreground`). Nunca o texto "Carregando…".
- **Erro:** único caso com botão — mensagem `text-destructive` + `Button variant="outline"` "Tentar de novo".
- **Sem botão "Carregar mais" permanente** — o auto-scroll já cobre; botão visível junto do observer é redundância.

### Seleção em massa (bulk)

Ações em lote numa listagem de card-grid. **Modelo "modo seleção"** (não checkbox sempre visível): um botão liga o modo, aí o card inteiro vira toggle (não navega) com ring coral + checkbox; barra de ação flutuante surge quando há ≥1 selecionado. Zero ruído no grid em repouso. Seleção opera **só sobre os itens carregados** (sem seleção por query). 4 peças reutilizáveis, compostas por cada listagem:

- **`useBulkSelection({ items, getId, resetKey })`** (`src/lib/use-bulk-selection.ts`) — estado: `Set` de IDs + flag `active`. Reseta a seleção quando `resetKey` muda (espelha `useInfiniteList`). Expõe `toggle`/`selectAllLoaded`/`clear`/`enter`/`exit`/`isSelected`/`count`/`allLoadedSelected`.
- **`<SelectableItem active selected onToggle>`** (`src/components/bulk/`) — envolve **qualquer** card sem reescrevê-lo. No modo ativo, intercepta o clique no **capture** (`preventDefault` cancela a navegação do `<Link>`; `stopPropagation` cancela o `onClick` de cards `div role=button`) → vira toggle. Serve `<Link>` (pedidos) e `div role=button` com ação interna (clientes). Usa `role="button"` (não `<button>`, que não pode aninhar interativos) — mesma exceção `useSemanticElements` dos cards clicáveis.
- **`<BulkActionBar selectedIds actions onClear>`** — barra `sticky bottom-4 z-40`; ações plugáveis por listagem (`{ label, icon?, variant?, run(ids) }`).
- **`<SelectionToolbar>`** — botão "Selecionar" / "Selecionar todos (N)" / "Cancelar", acima do grid.

Composição: a listagem usa `useBulkSelection` sobre os `items` do `useInfiniteList`, envolve cada card em `<SelectableItem>` e renderiza toolbar + barra. Canônico: `orders/_components/orders-infinite.tsx`, `customers/_components/customers-infinite.tsx`. Ação de export: navega para `…/export?ids=<csv>` (route handler aceita `?ids=` → `WHERE id IN`). **Fase 2 (futuro):** mutações em lote (atribuir filial, status, visibilidade) com validação por-item.

### Entity detail page (CRUD pattern)

Página de detalhe de uma entidade (`/dashboard/<recurso>/[id]`) — o padrão default para CRUDs. Canônico: `branches/[id]/page.tsx`. Componentes em `apps/web/src/components/entity/`.

- **`EntityIdentityHeader`** no topo: avatar + título (nome da entidade) + subtitle + slot `actions`.
- **`EntityTabs`** logo abaixo: sincroniza a aba ativa com a URL (`?tab=`); a aba default omite o param. Sub-navegação do tipo `line` ou pill conforme §4 Tabs.
- **`EntityKpisRow`** no corpo das tabs de overview, quando há métricas.
- **Ações no header são contextuais por tab** — a ação primária vive no `actions` do header e **muda conforme a aba ativa**, nunca duplicada no corpo da tab. O Server Component (`page.tsx`) lê `sp.tab` e injeta a ação relevante:

  | Tab ativa | Ação no header |
  |---|---|
  | overview (default) | Editar entidade |
  | sub-recurso com vínculo (ex: equipe) | Vincular / Adicionar membro |
  | sub-recurso com item (ex: estoque) | Adicionar item |
  | tabs read-only (ex: pedidos) | — (sem ação) |

  Funciona porque trocar de aba faz `router.replace(?tab=)`, re-renderizando o Server Component e atualizando o header. **Não** colocar o botão de ação dentro do corpo da tab.

  > **Piloto client-side (tool detail — PR #259 / ADR-0024):** `tools/[id]` substituiu o `EntityTabs` server-nav por um shell client (`ToolDetailTabs`): trocar de aba é 100% cliente (`history.replaceState`, **sem** `router.replace` nem re-render do servidor — 0 requests medidos), conteúdo eager (de `detail`) renderizado uma vez + tabs lazy via `"use server"` action, e a ação do header reativa no cliente via `useActiveTab` (não `sp.tab`). As outras 8 páginas de detalhe seguem o `EntityTabs` server-nav descrito acima até serem migradas. Ver ADR-0024.
- **Badge de contagem na tab:** sempre `secondary` (neutro). Via `<TabsCountBadge>` no `Tabs` base; no `EntityTabs`, badge `secondary` `rounded-md` `h-5 min-w-5`. A hierarquia vem da aba ativa (coral), não do badge.

### Mutações: drawer / página / confirmação destrutiva

A tríade canônica de mutação de entidade:

- **Editar (rápido / poucos campos):** drawer lateral (`Sheet`), aberto pela ação do header via `?edit=1`. Canônico: `branches/[id]/_components/branch-edit-sheet.tsx`.
  - **Largura — gotcha do prefixo `data-[side=right]:`:** o `SheetContent` default é `data-[side=right]:sm:max-w-sm` (~384px). Para alargar, a classe de width **precisa carregar o mesmo prefixo** (ex: `data-[side=right]:sm:max-w-2xl`) — sem ele o tailwind-merge não enxerga o conflito (variants diferentes), a default vence e a classe nua **não tem efeito**. `EntityEditSheet` expõe isso via `widthClassName`; ao usar `SheetContent` direto, escreva o prefixo na mão. Drawer enxuta de 1 coluna: `2xl`; drawer de duas colunas/painéis: `4xl`.
  - **Drawer larga multi-painel:** quando a edição combina leitura + ações + histórico, usar `4xl` em duas colunas — painel de leitura em destaque no topo (full-width, métricas em stat-cards), ações à esquerda, secundário + histórico à direita. Não é um `<form>` único (pode ter submits independentes), então adota o **esqueleto** do `EntityEditSheet`, não o componente. Seções que crescem (histórico) têm **scroll interno + lazy load** (`useInfiniteList` + `<InfiniteSentinel root={ref}>`) e não esticam a drawer; o render inicial varia com a altura. Canônico: `stock/_components/branch-stock-edit-sheet.tsx`.
- **Criar, ou editar/criar de formulário grande/complexo:** página dedicada (`/new`, `/[id]/edit`). A **complexidade do formulário decide** — entidade com muitos campos (ex: ferramenta com variantes, specs) vai sempre para página, mesmo para editar. Drawer só para formulários enxutos. Canônico: `branches/new/page.tsx`.
  - **Wizard multi-step** para o caso mais pesado (ferramenta): `tools/_components/tool-wizard.tsx` divide o form em passos com stepper (validação por passo, check verde ao concluir). O **edit** da mesma entidade troca o stepper por um **rail de seções** (scrollspy por âncoras) — quem edita vai direto ao campo. Wizard e edit-view compartilham **fonte única** — `tool-form-steps.ts` (`ToolStepId`, `TOOL_STEPS`, `STEP_FIELDS`) + `tool-sections.ts` (`TOOL_SECTION_COMPONENTS`: step → Component) + `use-tool-submit.ts` — para não duplicar campos; só o estado de stepper vive no wizard. Detalhe em `apps/web/CLAUDE.md`.
- **Ação destrutiva (excluir, desvincular, cancelar):** `AlertDialog` de confirmação — nunca ação direta. Controlado (`useState` para `open`), `e.preventDefault()` no `AlertDialogAction` + fechar manualmente no sucesso, e `stopPropagation` quando o gatilho vive dentro de um card clicável. Canônico: `users/_components/destructive-action-dialog.tsx`, `branches/[id]/_components/team-member-card.tsx`. **Botão destrutivo nunca usa coral (`default`)** — coral é ação positiva; destrutivo é `destructive`, `outline` ou `ghost` conforme o peso.

**Escopo:** este pattern é **default para entidades/CRUDs novos**; telas existentes migram gradualmente quando forem tocadas (não há migração big-bang). Adaptar ao domínio é permitido — o esqueleto (tabs + header contextual + cards do catálogo + drawer/dialog) é o que se mantém.

### PendingPanel + ActivityFeed (par de dashboard)

Metáfora "esquerda: o que precisa de ação / direita: o que aconteceu". Usado em `/dashboard`, `/dashboard/orders`, `/dashboard/customers`, `/dashboard/users`.

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

Regras:
- **Wrapper `min-h-[18rem]` no ActivityFeed** sempre que pareado com `<PendingPanel compact>`. Sem wrapper, ActivityFeed cresce com conteúdo e desequilibra o par. Padrão único em todas as 4 rotas.
- **`compact` no PendingPanel** pra esse par (`max-h-60 min-h-44` na área scrollável). Default (sem `compact`) é `max-h-[28rem] min-h-72` — usado em telas standalone fora do par.
- **Sub-tabs do PendingPanel são Tabs reais** (não ToggleGroup). Carregam `<TabsCountBadge>` no contador. Drop intencional: a cor por `tab.role` no badge das sub-tabs (warning/success/info) **não** é aplicada; uniformidade > sinalização redundante. Sinalização de severidade fica nos badges do header do painel ou no `row.badge` dos itens (continua usando `BADGE_COLORS` por role).
- **Ícone de status nas linhas (opcional).** `PendingRow` aceita `iconKey`/`tone` (de `status-visual`) → ícone de status colorido à esquerda da linha. `ActivityEvent` aceita `iconKey`/`tone`/`accentLabel` → o ícone vira o do status e o `accentLabel` (nome do status) é renderizado colorido após o `primary` (ex: `#EM-2026-0014 → Em preparação`). Campos **opcionais**: consumidores que não os passam mantêm o ícone+cor por `kind` (`KIND_META`). Canônico: Pedidos (`orders/pending-data.ts` preenche ambos a partir de `ORDER_STATUS_META`).

### Callout coral (`callout-card-coral`)

Full-bleed coral card para CTA grande, empty state de módulo vazio (ex: "Nenhuma ferramenta cadastrada"), ou banner de onboarding crítico. Pattern portado do "callout-card-coral" da Anthropic.

```tsx
<div className="rounded-lg bg-primary p-12 text-primary-foreground">
  <h2 className="font-serif text-3xl font-normal tracking-tight">Comece criando sua primeira ferramenta</h2>
  <p className="mt-3 text-base">…</p>
  <Button asChild className="mt-6 bg-card text-foreground hover:bg-card/80">
    <Link href="/dashboard/tools/new">Nova ferramenta</Link>
  </Button>
</div>
```

Regras:
- **Máximo 1 por página.** Coral é voltagem — não pode virar ruído.
- **Nunca em listagem densa.** Empty state, onboarding, banner crítico — só.
- CTA interna inverte para `bg-card text-foreground` (botão claro sobre coral).

### Featured card (`featured-card-dark`)

Para destacar item recomendado em grid/lista (template de pedido sugerido, ferramenta featured, plano recomendado em comparação). Bg `bg-surface-deep` + `ring-2 ring-primary` cria inversão visual no meio de cards `bg-card` regulares.

```tsx
<div className="rounded-lg bg-surface-deep ring-2 ring-primary p-8">
  <h3 className="font-sans text-base font-medium">Recomendado</h3>
  …
</div>
```

### Code block / log viewer

Container de código, JSON debug, log de webhook, terminal output:

```tsx
<pre className="rounded-md bg-surface-deep p-4 font-mono text-xs leading-relaxed overflow-x-auto">
  {payload}
</pre>
```

Surface-deep cria o "well" — sem necessidade de border adicional. Scroll horizontal preservado (sem wrap).

### Não use

- `<img>` nu — sempre `next/image` (CLAUDE.md P1).
- Cool blue-grays no chrome. Teal só em info-role e charts.
- `text-xs` no body principal.
- Drop shadows pesados. Depth = surface contrast + ring.
- `font-serif` em h3, body, controls, sidebar — restrito a h1/h2.
- Bold weight (700+) em serif — Cormorant 700 fica bombástico. Weight 400 é o piso e o teto.
- Emojis decorativos.
- `bg-surface-deep` como surface padrão de card. Só code/log/featured.
- `callout-card-coral` em mais de 1 por página ou em listagem densa.

## 5. Layout

### Spacing (base 4px)

| Tailwind | Px | Uso |
|---|---|---|
| `gap-1` | 4 | Inline elements |
| `gap-2` | 8 | Stacks compactos |
| `gap-3` | 12 | Forms, lists |
| `gap-4` | 16 | Card content |
| `gap-6` | 24 | Section internal |
| `gap-8` | 32 | Card padding interno |
| `py-12` / `py-16` | 48–64 | Page section vertical |

Densidade > respiro. Não use `py-24+` em dashboard — esse espaçamento é marketing.

### Container

- Páginas dashboard: `max-w-7xl` (1280px) `mx-auto`.
- Forms / leitura: `max-w-3xl` ou `max-w-5xl`.
- Sidebar: 16rem fixo.

### Section bands (ritmo vertical)

Páginas com múltiplas seções alternam surface entre `bg-background` (flat) e `bg-muted/50` (data zone) para criar ritmo. Pattern Anthropic cream↔cream-card portado para dark.

Implementação: a `<section>` que carrega dado denso (tabelas, painéis pendentes, charts, listas longas) ganha `-mx-6 border-y border-border bg-muted/50 px-6 py-10`. O negative margin extende a band até o limite do container; o `border-y` marca a transição. Hero, atalhos, callouts ficam em surface plana.

```tsx
<main className="mx-auto max-w-6xl px-6 py-8">
  <section className="pb-10">{/* hero, flat */}</section>
  <section className="-mx-6 border-y border-border bg-muted/50 px-6 py-10">
    {/* data zone, banded */}
  </section>
  <section className="pt-10">{/* shortcuts, flat */}</section>
</main>
```

Regras:
- **Máx 1 band por página.** Mais que isso vira listras, não ritmo.
- **Bands só pra data zone.** Não pra hero, não pra CTAs.
- **Padding interno generoso** (`py-10`+) — band sem respiro lê como erro.

Implementação canônica: `apps/web/src/app/dashboard/page.tsx`.

### Border Radius

Base `--radius: 0.5rem` (8px) em `globals.css`; os tokens derivam via `calc()` (sm −4px, md −2px, lg =base, xl +4px).

| Token | Px | Componentes |
|---|---|---|
| `rounded-sm` | 4 | Checkbox, Kbd, Skeleton |
| `rounded-md` | 6 | Button, Input, Textarea, Select, Tooltip, Item, Badge, DropdownMenu items, Tabs, Toggle, Combobox, Field, InputGroup, InputOTP, Sidebar items, form sections, code blocks |
| `rounded-lg` | 8 | Card, Dialog, AlertDialog, Alert, Popover, HoverCard, Command, Drawer, Empty, callout-card-coral, featured-card-dark |
| `rounded-xl` | 12 | Hero containers (raro) |
| `rounded-full` | ∞ | Slider track/thumb, Progress, ScrollArea, avatares, pill badges |

Alguns cards de listagem usam `rounded-[10px]` hardcoded (entre `lg` e `xl`) — exceção documentada no shell do §4, não erro.

Exceção: `Calendar` mantém `rounded-none` em `range_middle` — semântica de intervalo.

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|---|---|---|
| Deep | `bg-surface-deep` (`0.11`) | Code/log/terminal containers, featured-card-dark |
| Flat | sem shadow, sem border | Sections, page floor, top nav |
| Hairline | `border-border` (1px) | Inputs, divisores, table rows |
| Ring | `ring-1 ring-foreground/10` | Cards, popovers, dialogs |
| Surface | `bg-card` sobre `bg-background` | Cards, panels |
| Drop shadow | `shadow-md` | Apenas overlays portados (Dropdown, Tooltip, Select content) |

Filosofia: depth via contraste de surface, não shadow. Flat-first com surface-deep como "well" pontual. Sombras só em overlays, sutis.

## 7. Acessibilidade

WCAG **AAA** target. Não-negociável para equipe interna em sessão longa.

### Contraste

- Body text sobre background: 7:1 (AAA normal text). `--foreground` (`oklch 0.97 ...`) sobre `--background` (`0.16 ...`) cumpre.
- Texto sobre roles saturadas (button primary etc): 4.5:1 (AAA large text). `--*-foreground` calibrados em OKLCH para garantir contraste.
- UI controls (border de input, ícones): 3:1 (AAA non-text). `--input` (`0.42`) sobre `--card` (`0.20`) cumpre.
- Texto sobre surface-deep (`0.11`): contraste ainda maior que sobre background — AAA preservado.

### Focus

- **`ring-1 ring-ring ring-offset-1 ring-offset-transparent`** — hairline coral 1px com halo transparente 1px. **Sem `border-ring`** — border flip + ring criava efeito duplo (duas linhas paralelas).
- Cor da ring acompanha role da ação (destructive ring em button destructive, etc) via `focus-visible:ring-destructive/40` etc.
- `--ring` em 75% alpha pra hairline ter presença visual real.
- `outline` fallback no `:focus-visible` global (1px sólido + offset 1px) garante visibilidade mesmo se classe Tailwind falhar.

### Reduced motion

Bloco `@media (prefers-reduced-motion: reduce)` em `globals.css` zera duration de animation/transition. Validado: nenhum componente depende de animation pra entregar info.

### Color blindness

Roles **nunca** dependem só de matiz. Cada estado carrega ícone + label + cor:
- Badge "Cancelado" = bg destructive + ícone X + texto "Cancelado".
- Badge sem texto, só pintada de vermelho — proibido.

## 8. Voz e copy

- **Direta, sem hedging.** "SKU duplicado em variante 2" não "Parece que houve um problema com o SKU".
- **Vocabulário do domínio.** Variante, voltagem, filial, SKU, atributo, movimento de estoque. Sempre exato.
- **Sem soft language AI.** Não "talvez", "parece", "você poderia". Use imperativo ou afirmação.
- **pt-BR técnico.** Concorda com PRODUCT.md: equipe é engenheiro, não cliente.
- **Headlines podem ter peso editorial.** Cormorant em h1/h2 permite frases mais consideradas — "Catálogo de ferramentas" lê bem; "Suas ferramentas" lê melhor. Editorial não significa floreio.

## 9. Do's & Don'ts

### Do

- Use tokens (`bg-card`, `text-foreground`, `bg-warning`, `bg-surface-deep`) — nunca hex literal.
- Coral (`bg-primary`) em CTAs primários, focus rings, brand stamp, chart-1, **e** callout-card-coral. Reservado pra esses usos.
- Cada role com matiz própria. Status reconhecível à distância.
- Body sans `text-sm leading-relaxed` (14px / 1.625) por padrão.
- **Cormorant em h1 + h2 de todas as páginas.** Weight 400 + tracking-tight. É a voz.
- `font-medium` (500) como peso de titles/h3/labels. Contraste por peso, não família, abaixo de h2.
- Inputs em `border-input` (`#57524c`) — borda mais forte que `border-border`.
- Focus ring 1px + offset 2px na cor da role da ação (hairline com halo).
- Surface-deep (`bg-surface-deep`) em code blocks, log viewers, featured cards.
- Respeite `prefers-reduced-motion`.
- Status sempre = ícone + label + cor (color blindness safe).

### Don't

- Não introduza cool blue-grays. Toda neutra tem chroma warm (oklch hue 70).
- Não use copper hue 45 — saiu junto com a iteração industrial.
- Não use `font-serif` em h3, body, controls, sidebar, dentro de tabelas — só h1/h2.
- Não use serif weight 700 — Cormorant é 400 fim. Sans aceita 500 e raramente 600.
- Não pinte coisas de coral aleatoriamente. Restrinja a CTA + focus + brand + callout-card.
- Não use mais de 1 callout-card-coral por página.
- Não use callout-card-coral em listagem densa.
- Não use `bg-surface-deep` como bg de card regular — só code/log/featured.
- Não fundamente status só em cor — sempre ícone + label.
- Não use `--border` e `--input` como sinônimos — input é 1 degrau mais forte.
- Não escreva copy "AI assistente prestativo". Equipe quer ferramenta.
- Não use `text-xs` em body principal.
- Não desligue `prefers-reduced-motion` em qualquer animação.
- Não use focus ring sem offset (`ring-1` puro lê como decoração, não como focus). Sempre `ring-offset-1 ring-offset-transparent`.
- Não use `rounded-none` em componente novo (exceto exceção semântica documentada).
- Não chame `authClient.useSession()` em Client Component se o parent Server Component já tem a session via `requireCurrentSession()` — passe `user` (e o que mais precisar) via prop. O hook retorna `isPending=true` no SSR e `false` no CSR, causando hydration mismatch quando UI renderiza Skeleton no SSR e conteúdo real no CSR. `signOut` continua usando `authClient.signOut()`; só `useSession()` é o problema.
- Não use `<Badge variant="secondary">` manual em `<TabsTrigger>` — use `<TabsCountBadge value={N} />` do `@emach/ui/components/tabs`.
- Não use `<ToggleGroup>` pra sub-tabs visuais com seleção única. Use `<Tabs>` — ToggleGroup é pra multi-seleção (botões de filtro independentes), não tab.

## 10. Histórico de migrações

Mudanças sistêmicas consolidadas, mais recente primeiro:

- **Form de ferramenta: wizard + HelpTooltip (2026-06-05)** — (PRs #121–123) o form mais pesado do sistema (ferramenta) migrou para **wizard multi-step** com stepper; wizard (criar) e edit-view passam a compartilhar fonte única de seções/submit (`tool-sections.ts` + `use-tool-submit.ts`). Introduzido o componente **`HelpTooltip`** (ajuda contextual `ⓘ` em label/h3, sobre HoverCard, modos curto/rico) — retrofitado em tools, branches, suppliers, categories/attributes. Ver §4 (Help tooltip, Mutações) e `apps/web/CLAUDE.md`.
- **Seção Configurações + aba Frete (2026-06-05)** — (PR #119) nova `/dashboard/site/settings` com header + tabs e layout **form 2fr / trilho de prévia 1fr**. Abas ainda não implementadas usam placeholder `Em breve` (não some da navegação — comunica roadmap). Padrão de página de configuração para reusar. Sem mudança de token.
- **Telas de auth: login redesign + convite-only (2026-06-03)** — (PRs #112, #116) família de telas de auth redesenhada; login com **hero serif** (Cormorant, único lugar fora de h1/h2 onde a serif aparece em corpo grande). Fluxo de signup público trocado por **convite-only** com e-mail de convite. Sem mudança de token — aplica o sistema existente; serif-hero formalizado como uso legítimo da Cormorant além de h1/h2.
- **Detalhe de pedido no Entity pattern (2026-06-03)** — (PR #115) `/dashboard/orders/[id]` migrou para o Entity/CRUD pattern (`EntityIdentityHeader` + `EntityTabs` + ações contextuais por tab) com aba de auditoria. Aplicação do pattern de 06-01, sem mudança de sistema — referência de que pedidos seguem o mesmo esqueleto das demais entidades.
- **Seleção em massa em listagens (2026-06-02)** — padrão genérico de bulk actions em card-grid (Fase 1): "modo seleção" (botão liga → card vira toggle com ring coral, barra flutuante), seleção só dos carregados. 4 peças reutilizáveis (`useBulkSelection` + `components/bulk/{SelectableItem,BulkActionBar,SelectionToolbar}`), plugadas em pedidos e clientes com a ação "Exportar selecionados" (export route aceita `?ids=`). `SelectableItem` intercepta o clique no capture pra coexistir com cards navegáveis. Fase 2 (futuro): mutações em lote. Ver §4 Seleção em massa.
- **Pedidos: card-grid + tabs split + status visual (2026-06-02)** — (1) listagem-raiz de `/dashboard/orders` migrou de tabela (`order-table.tsx`, removido) para **card-grid** (stat-card `order-card.tsx`: avatar de iniciais + nº + 📍 filial + footer Itens · Total · Data). Regra reforçada: tabela é para coleção aninhada em detalhe, não para listagem-raiz. (2) **Tabs split** — barra de filtros de status dividida em dois `<TabsList>` (`justify-between`): fluxo do operador à esquerda, exceções à direita; sem tab "Todos" (abre listando tudo, toggle na tab ativa). (3) **Status visual com fonte única** — novo `components/status-visual.tsx` (ícone/tone) + `ORDER_STATUS_META` em `status-meta.ts`; `OrderStatusBadge` refatorado pra consumir, e histórico (`ActivityFeed`) + pendências (`PendingPanel`) ganham ícone+cor por status (`iconKey`/`tone`/`accentLabel`, opcionais — outros módulos intactos). Label "Aguardando pgto" → "Aguardando pagamento" em todo o sistema. Ver §4 (Status visual, Tabs split, Cards, PendingPanel+ActivityFeed).
- **Entity / CRUD pattern + catálogo de cards (2026-06-01)** — consolidado a partir do redesign das tabs de filial (`branches/[id]`). Formalizados: (1) **página de detalhe de entidade** com `EntityIdentityHeader` + `EntityTabs` (sincronizadas com `?tab=`) + **ações de header contextuais por tab** (Editar/Vincular/Adicionar mudam pela aba ativa, nunca duplicadas no corpo); (2) **catálogo de 4 arquétipos de card** (stat / media / identity / entity) com shell comum e **footer edge-to-edge** (faixa `border-t` que encosta nas bordas — 3 técnicas conforme padding do container); (3) **tríade de mutação** editar=drawer (`Sheet`), criar/forms complexos=página, destrutivo=`AlertDialog` controlado; botão destrutivo nunca coral. Badge de contagem em tab de detalhe uniformizado em `secondary`. Default para CRUDs novos; existentes migram aos poucos. Ver §4 (Cards, Entity detail, Mutações).
- **Padrão de tabs unificado (2026-05-26)** — novo helper `<TabsCountBadge value={N} />` exportado de `@emach/ui/components/tabs` substitui `<Badge variant="secondary" className="ml-1.5 tabular-nums">` manual em filter-tabs. `tabsListVariants` default ganha `gap-1` (já existia em `line`) — propaga gap-1 automático pra todo `<TabsList>`. Filter-tabs em `/orders`, `/users`, `/reviews` migradas; badges agora uniformes em `secondary` (antes `/users` era default/outline e `/reviews` era default/secondary). `PendingPanel` refatorou sub-tabs `<ToggleGroup>` → `<Tabs>` com mesmo padrão — drop intencional da cor por `tab.role` no badge das sub-tabs. Wrapper `min-h-[18rem]` no `<ActivityFeed>` quando pareado com `<PendingPanel compact>` padroniza altura do par em `/orders`, `/customers`, `/dashboard`, `/users`. PendingPanel ganha prop `compact` (`max-h-60 min-h-44`). Hydration mismatch no `FooterContent` do `AppSidebar` corrigido passando `user` via prop do `DashboardLayout` (server) em vez de `authClient.useSession()` no client.
- **Refinement /impeccable (2026-05-20)** — ring vira hairline (`ring-1 + ring-offset-1`), `--ring` alpha sobe 0.55→0.75. Tipografia: h1 sobe text-3xl→text-4xl, h2 sobe text-xl→text-2xl, weight de serif vira 500 (era 400) pra compensar thinness do Cormorant em dark; display sobe text-4xl→text-5xl. Section bands (`bg-muted/50` com border-y) documentadas pra ritmo vertical em páginas com data zone, aplicado primeiro em `dashboard/page.tsx`.
- **Re-aproximação Anthropic (2026-05-20)** — coral hue 38 (de copper 45), chroma 0.13 (de 0.15) — agora `oklch(0.65 0.13 38)` ≈ `#cc785c` literal Anthropic. Destructive hue 15 (de 25) — `oklch(0.55 0.20 15)` para preservar 23° de separação do novo primary. **Cormorant Garamond liberada para h1 + h2 de todas as páginas** (era restrita a login + capa de relatório). Adicionado token `--surface-deep` (`oklch(0.11 0.005 70)`) para code/log/featured wells. Documentados componentes `callout-card-coral` e `featured-card-dark`. Mantém dark-only e voz workshop.
- **Saída do Anthropic Claude inspired** (iteração intermediária, revertida parcialmente acima): coral terracotta + Cormorant editorial gigante + tom helpful AI saíram em favor de industrial neutrals + copper + tipografia funcional. Esta iteração revertia em excesso e foi parcialmente desfeita acima.
- **6 roles cromáticos distintos** (`primary / secondary / destructive / warning / info / success`), cada com `--*` + `--*-foreground` em globals.css, mapeados em `@theme inline` como `--color-*` tailwind tokens. Adicionados `warning / info / success` em `Button`, `Badge`, `Alert` variants.
- **Surfaces afastadas:** `--surface-deep` `0.11` (novo) / `--background` `0.16` / `--muted` `0.18` / `--card` `0.20` / `--border` `0.36` / `--input` `0.42` / `--secondary` `0.42`. 6 níveis distintos com diff ≥0.02 luminância.
- **Tokens `--border` e `--input` separados** (`0.36` vs `0.42`) — mantido.
- **Ring 1px + offset 2px em primary 75%** — refinement 2026-05-20: hairline com halo substitui ring-2 sólido. **Sem border flip** (combo border-ring + ring criava efeito duplo, refatorado pra single line).
- **`prefers-reduced-motion: reduce`** zera animations/transitions globalmente — AAA requirement.
- **Cantos arredondados** mantidos (rounded-md interactive, rounded-lg surfaces, etc).
- **Body type** `text-sm` (14px) baseline — mantido.

## 11. Referência rápida

| Pergunta | Resposta |
|---|---|
| Qual a cor de marca? | Coral `oklch(0.65 0.13 38)` ≈ `#cc785c` (`--primary`) |
| Qual a fonte default? | Inter sans em body/UI. Cormorant Garamond serif em h1 + h2 de **todas** as páginas. |
| Como faço destaque sem coral? | `bg-secondary` ou `bg-card` + `border-border` |
| Como sinalizo "estoque mínimo"? | `bg-warning` + ícone + label "Estoque mínimo" |
| Como sinalizo "pedido entregue"? | `bg-success` + ícone check + label |
| Como sinalizo "em processamento"? | `bg-info` + ícone clock + label |
| Posso usar cool gray? | Apenas em `--info` (teal) e chart-3. Em chrome geral, não. |
| Qual a linha base de body? | `text-sm leading-relaxed` (14px / 1.625) |
| Como faço focus state? | `focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent` (sem border flip — single hairline com halo) |
| Qual radius pra card novo? | `rounded-lg` (8px; alguns cards de listagem `rounded-[10px]`). Botões/inputs `rounded-md` (6px). |
| Qual o contraste mínimo? | AAA: 7:1 body, 4.5:1 large text, 3:1 non-text UI. |
| Onde uso `bg-surface-deep`? | Code blocks, log/terminal viewers, featured-card-dark. **Não** em card normal. |
| Quando uso `callout-card-coral`? | Empty state de módulo vazio, onboarding, banner crítico. Máx 1 por página. |
| Cormorant em h3? | **Não.** Só h1 + h2. Resto é sans. |
| Como adiciono contagem numa tab? | `<TabsCountBadge value={N} />` do `@emach/ui/components/tabs`. Sempre `secondary`, ativo + inativo. |
| `gap-1` na TabsList? | Default. Não passe `className="gap-1"` manual. |
| Altura do par PendingPanel+ActivityFeed? | `<PendingPanel compact>` + wrapper `min-h-[18rem]` no ActivityFeed. |
| Como pego user no AppSidebar? | Prop do `DashboardLayout` (server). **Não** `authClient.useSession()` — hydration mismatch. |
| Como monto a página de detalhe de uma entidade? | `EntityIdentityHeader` + `EntityTabs` (`?tab=`); ação primária no header, **contextual por tab**. Ver §4 Entity detail. |
| Onde fica o botão de ação (Editar/Vincular)? | No `actions` do header, mudando pela aba ativa. **Nunca** no corpo da tab. |
| Footer de card recuado ou edge-to-edge? | Edge-to-edge — `border-t`/divisórias até a borda. `-mx-4 px-4` se o card tem padding. Ver §4. |
| Editar entidade: drawer ou página? | Drawer (`Sheet`) se poucos campos; página se formulário grande/complexo. Criar = página. |
| Excluir/desvincular: como? | `AlertDialog` de confirmação (controlado). Botão destrutivo nunca coral. |
| Ajuda contextual num campo? | `<HelpTooltip text="…" />` (curto) ou `<HelpTooltip title body example />` (rico), dentro do `<Label>`. Ver §4 Help tooltip. |
| Form muito complexo (ferramenta)? | Wizard multi-step (`tool-wizard.tsx`); seções/submit compartilhados com o edit-view. Ver §4 Mutações. |

## 12. Origem

- Filosofia visual e tokens: este documento (editorial-workshop dark, coral + serif h1/h2, AAA).
- Inspiração de paleta + tipografia: anthropic.com (canvas cream + coral + serif), adaptada para dark-only.
- Implementação canônica: `packages/ui/src/styles/globals.css` + componentes em `packages/ui/src/components/*`.
- Showcase: `apps/web/src/app/design/page.tsx` (sistema completo) + `/design/preview` (comparação histórica de paletas).
- Strategic context: `PRODUCT.md` (register product / personality confiante-técnico-denso / anti-references).

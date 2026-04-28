# Design System — emach dashboard (Anthropic Claude inspired)

> Derivado de `~/Downloads/DESIGN-claude.md` (sistema atual de claude.com), adaptado para um dashboard interno em **dark mode único**. Filosofia editorial mantida; vocabulário marketing (hero bands, pricing tiers, coral callouts) descartado por irrelevância no contexto.

## 1. Visão & Atmosfera

O dashboard emach respira o mesmo ar do claude.com: serif editorial nos títulos, sans humanista no body, paleta exclusivamente **warm-toned** sem nenhum cool blue-gray, e voltagem cromática vinda de um **único accent coral** que aparece com discrição. A diferença é que aqui o cream-canvas vira `surface-dark` — o app é admin interno, dark-only, e o ritmo light/dark de seções do site marketing é trocado por **uma hierarquia de superfícies dark coerente**.

A assinatura visual é a combinação de:

1. Tipografia editorial — Cormorant Garamond serif weight 400 com `tracking-tight` nos display sizes; Inter sans 400/500 para body e UI.
2. Paleta **dark warm** com 5 níveis de elevação distintos (`background → muted → border → card → secondary`).
3. Coral `#cc785c` como única cor saturada — usada em CTA primário, badge "novo", focus ring de inputs.
4. Hairline borders que funcionam como degraus de elevação (não linhas de tinta).
5. Sombra praticamente ausente — depth vem do contraste entre surfaces, não de drop shadows.

## 2. Paleta

Todos os tokens estão em `packages/ui/src/styles/globals.css`, escopados em `.dark`. Use os tokens via Tailwind (`bg-card`, `text-foreground`, etc.) — **nunca** hardcode hex em componentes.

### Surfaces (do mais escuro para o mais claro)

| Token | Hex aprox | Uso |
|---|---|---|
| `--sidebar` | `#13110f` | Sidebar do dashboard (mais escuro que background) |
| `--background` | `#181715` | Page floor — surface-dark |
| `--muted` | `#1f1e1b` | Inset surfaces: tracks de slider/progress, skeletons, code blocks, tab list bg |
| `--card` / `--popover` / `--accent` | `#252320` | Cards, popovers, dialog content — surface-dark-elevated |
| `--border` | `#3d3d3a` | Hairline borders visíveis sobre background e card — degrau de elevação |
| `--input` | `#48464a` | Borda de inputs/selects/textareas — 1 degrau mais forte que `--border` por affordance de interatividade |
| `--secondary` | `#3d3d3a` | Botões secundários, surfaces de ênfase moderada (mesma luminância de `--border`, role distinto) |

### Brand & Semantic

| Token | Hex | Uso |
|---|---|---|
| `--primary` | `#cc785c` | Coral — CTA primário, focus ring, badge default, chart-1 |
| `--primary-foreground` | `#ffffff` | Texto sobre coral |
| `--destructive` | `#c64545` | Estados de erro, badge cancelado, botão destrutivo |
| `--destructive-foreground` | `#ffffff` | Texto sobre destructive |
| `--ring` | coral 40% alpha | Componentes aplicam `ring-2 ring-ring` (coral 40% × 3px) — ring sólido, sem multiplicar opacidade |

### Foreground (textos)

| Token | Hex | Uso |
|---|---|---|
| `--foreground` | `#faf9f5` | Texto primário — on-dark cream-tinted |
| `--card-foreground` / `--popover-foreground` | `#faf9f5` | Mesmo, em cards/popovers |
| `--muted-foreground` | `#a09d96` | Secondary text, captions, metadata, footer-adjacent |
| `--accent-foreground` / `--secondary-foreground` | `#faf9f5` | Texto em surfaces de ênfase |

### Charts

5 séries warm-tone, ancoradas em coral:

- `--chart-1`: Coral `#cc785c`
- `--chart-2`: Amber-tinted gray
- `--chart-3`: Teal `#5db8a6` (único matiz frio permitido — accent-teal do DESIGN-claude.md)
- `--chart-4`: Stone gray
- `--chart-5`: Secondary

> **Regra:** sem cool blue-grays em UI chrome. Teal só em charts (status indicators, distinções de série).

## 3. Tipografia

Carregada via `next/font/google` em `apps/web/src/app/layout.tsx`:

- **Serif (display/headlines):** `Cormorant Garamond` weight 400/500/600 — substituto open-source do Copernicus/Tiempos Headline da Anthropic. Variável CSS: `--font-serif-loaded`. Token Tailwind: `font-serif`.
- **Sans (body/UI):** `Inter` variable — substituto direto do StyreneB. Variável CSS: `--font-sans-loaded`. Token Tailwind: `font-sans`.
- **Mono (código):** stack do sistema (`ui-monospace`, fallback Tailwind). Token: `font-mono`.

### Hierarquia

| Função | Classes Tailwind | Notas |
|---|---|---|
| Display hero (raro em dashboard) | `font-serif text-5xl font-normal tracking-tight leading-[1.1]` | 48px / 1.1 / -0.025em |
| h1 página | `font-serif text-2xl font-normal tracking-tight` | Padrão dashboard atual; era weight 500, agora 400 |
| h2 seção | `font-serif text-xl font-normal tracking-tight` | |
| h3 sub-seção | `font-serif text-lg font-normal` | |
| Title prominent | `font-sans text-base font-medium` | Card titles em listas densas |
| Body padrão | `font-sans text-sm leading-relaxed` | UI chrome — 14px com line-height 1.55 |
| Body alternativo | `font-sans text-base leading-relaxed` | Páginas com leitura intensa (16px) |
| Caption | `font-sans text-xs text-muted-foreground` | Metadata, labels, helpers |
| Caption uppercase | `font-sans text-[11px] tracking-widest uppercase font-medium` | Section markers, badge text |
| Code | `font-mono text-xs` | Inline code, IDs, atalhos |

### Princípios

- **Serif weight 400, não 500.** Cormorant Garamond ganha personalidade em peso regular com tracking negativo. Bold (700) lê como bombástico; evitar.
- **Tracking negativo nos display sizes.** `tracking-tight` (-0.025em) cobre h1/h2; `tracking-tighter` (-0.05em) para hero excepcional. Nunca `tracking-normal` ou positivo em serif headlines.
- **Body em 14px (`text-sm`)** é o default do dashboard — UI denso. Subir para `text-base` (16px) só em páginas de leitura.
- **Line-height generosa em body.** `leading-relaxed` (1.625) ou `text-sm/relaxed` — copiar o ritmo de leitura do site Anthropic.
- **Sem mistura:** serif **só** em headlines; sans em todo o resto. Mono **só** em código.

## 4. Componentes

> Os 50+ componentes em `packages/ui/src/components/*` são shadcn buildados sobre `@base-ui/react` (não Radix). O registry inicial era `base-lyra` (que produz `rounded-none` em todos os componentes), mas **migramos os cantos para a hierarquia DESIGN-claude.md** — surfaces grandes em `rounded-lg`, interactive em `rounded-md`, tracks circulares em `rounded-full`, tiny em `rounded-sm`. Override individual via className quando necessário.

### Buttons

`packages/ui/src/components/button.tsx` — variants: `default` (coral), `secondary`, `outline`, `ghost`, `destructive`, `link`. Sizes: `xs / sm / default / lg / icon / icon-xs / icon-sm / icon-lg`.

| Variant | Bg | Text |
|---|---|---|
| `default` | `bg-primary` (coral) | `text-primary-foreground` (white) |
| `secondary` | `bg-secondary` (#3d3d3a) | `text-secondary-foreground` |
| `outline` | `bg-background` + `border-border` (#3d3d3a) | `text-foreground` |
| `ghost` | transparent → hover `bg-muted` | `text-foreground` |
| `destructive` | `bg-destructive` (sólido) | `text-destructive-foreground` (white) |
| `link` | transparent | `text-primary` (coral) underline on hover |

Todos os botões compartilham o mesmo focus state: border flipa pra coral + `ring-2 ring-ring`. Idêntico ao spec dos inputs — afford­ance consistente em todo elemento focável.

### Cards & Containers

- `Card`: `bg-card`, ring `ring-1 ring-foreground/10` (substitui border tradicional), padding interno 16–32px.
- `Dialog`/`Popover`: mesma elevação que Card; abrem em portal com `z-50` + ring sutil.
- Sidebar: `bg-sidebar` (mais escuro que background — hierarquia visual canvas → sidebar darker).

### Inputs

- `Input` / `Textarea` / `Select` trigger / `Combobox` / `Field`:
  - **Default:** `bg-transparent` + `border-input` (#48464a — hairline forte, distinguível tanto sobre background quanto sobre card).
  - **Focus:** border flipa pra coral (`focus-visible:border-ring`) + ring sólido de **2px coral 40%** (`focus-visible:ring-2 focus-visible:ring-ring`). 2px se mostrou o sweet spot em dark mode — DESIGN-claude.md prescreve "3px" mas em dark com coral 40% fica visualmente pesado demais; 2px mantém a affordance sem dominar.
  - **Invalid:** border vira `destructive` + ring 1px destructive 20%.
- `Checkbox` / `RadioGroup` / `Switch`: bg coral quando checked.
- Outros componentes que usam o mesmo spec: `InputGroup`, `InputOTP`.

### Badges

`bg-primary` (coral) para destaque, `bg-secondary` para neutro, `bg-destructive` sólido para erro/cancelado. `outline` = border-border + bg transparente.

### Feedback

- `Alert` default: `bg-card` + texto foreground.
- `Alert` destructive: `bg-card` + texto `text-destructive` (mantém legibilidade — diferente do Button destrutivo, que é fill).
- `Skeleton`/`Slider track`/`Progress track`: todos em `bg-muted` (`#1f1e1b`) — distintos do card.

### Não use

- `<img>` nu — sempre `next/image` (CLAUDE.md regra P1).
- Cool blue-grays em qualquer lugar de UI chrome.
- `text-xs` no body principal — fica denso demais; use `text-sm` mínimo.
- Drop shadows pesados — depth vem de surface contrast.
- Bold weight em serif headlines.

## 5. Layout

### Spacing

Base 4px (Tailwind default). Tokens preferidos:

| Tailwind | Px | Uso |
|---|---|---|
| `gap-1` | 4 | Inline elements |
| `gap-2` | 8 | Stacks compactos |
| `gap-3` | 12 | Forms, lists |
| `gap-4` | 16 | Card content |
| `gap-6` | 24 | Section internal |
| `gap-8` | 32 | Card padding interno |
| `py-12` / `py-16` | 48–64 | Page section vertical |
| `py-24` | 96 | Hero/marquee em landings (raro no dashboard) |

### Container

- Max-width default em pages: `max-w-7xl` (1280px) com `mx-auto`.
- Páginas de leitura/forms: `max-w-3xl` ou `max-w-5xl`.
- Sidebar: largura fixa 16rem (configurada no shadcn `Sidebar`).

### Border Radius

Mapping aplicado nos componentes (substitui o `rounded-none` default do registry base-lyra):

| Token | Px | Componentes |
|---|---|---|
| `rounded-sm` | 6 | `Checkbox`, `Kbd`, `Skeleton` |
| `rounded-md` | 8 | `Button`, `Input`, `Textarea`, `Select`, `Tooltip`, `Item`, `Badge`, `DropdownMenu`/`ContextMenu`/`Menubar` items, `Tabs`, `Toggle`, `Combobox`, `Field`, `InputGroup`, `InputOTP`, `Sidebar` items, form sections do dashboard |
| `rounded-lg` | 12 | `Card`, `Dialog`, `AlertDialog`, `Alert`, `Popover`, `HoverCard`, `Command`, `Drawer`, `Empty` |
| `rounded-xl` | 16 | Hero containers (raro no dashboard) |
| `rounded-full` | ∞ | `Slider` track/thumb, `Progress`, `ScrollArea`, `Resizable` handle, avatars, pill badges |

**Exceção semântica preservada:** `Calendar` mantém `rounded-none` no `range_middle` — o "meio" de um intervalo de datas precisa de cantos retos pra fundir visualmente com start/end.

Ao escrever página/componente novo, sempre use os tokens acima — nunca volte a `rounded-none` por hábito do registry original.

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|---|---|---|
| Flat | sem shadow, sem border | Sections, page floor, top nav |
| Hairline | `border-border` (1px) | Inputs, divisores, table rows |
| Ring | `ring-1 ring-foreground/10` | Cards, popovers, dialogs (substituto a shadow) |
| Surface elevation | `bg-card` em cima de `bg-background` | Cards, panels |
| Drop shadow | `shadow-md` | Apenas overlays portados (Dropdown, Tooltip, Select content) — herdado do shadcn |

**Filosofia:** depth vem de contraste de surface, não de shadow. O dashboard é flat-first; sombras só em overlays e mesmo assim sutis. Diferente do DESIGN.md anterior, **não** prescrevemos `0px 0px 0px 1px` ring shadows em todo lugar — a realidade do código é ring + border + bg-shift, e isso é suficiente.

## 7. Do's & Don'ts

### Do

- Use os tokens (`bg-card`, `text-foreground`) — nunca hex literal em componentes.
- Coral (`bg-primary`) **só** em CTAs primários, focus rings, charts series principal e badge "novo". Reservado, não decorativo.
- Serif Cormorant weight 400 com `tracking-tight` em display headlines.
- Body sans `text-sm leading-relaxed` (14px / 1.55) por padrão.
- Hairline borders em `border-border` (`#3d3d3a`) — degrau de elevação visível, não linha de tinta preta.
- Inputs em `border-input` (`#48464a`) — borda mais forte que `border-border` por affordance.
- Focus em qualquer elemento focável: border flipa pra coral + `ring-2 ring-ring`.
- 5 níveis de surface dark distintos — respeite a hierarquia.
- Use os tokens de radius corretos (`rounded-md` interactive, `rounded-lg` surfaces, `rounded-full` circular, `rounded-sm` tiny). Nunca `rounded-none` em componente novo.

### Don't

- Não introduza cool blue-grays. Toda neutra tem chroma warm (oklch hue ~70-85).
- Não use Cormorant em weight 700 — quebra o ritmo editorial.
- Não pinte coisas de coral aleatoriamente. Restrinja.
- Não confunda `--muted` com `--card` — são distintos por design (diff de ~3% de luminância).
- Não use `--border` e `--input` como sinônimos — input é 1 degrau mais forte.
- Não adicione drop shadows pesados em cards. Use o ring `ring-1 ring-foreground/10` que já está nos componentes.
- Não use `<h1>` sem `font-serif` — o serif **é** a personalidade.
- Não use `text-xs` (12px) em body principal — fica denso demais para o feel editorial.
- Não escreva `rounded-none` em componente novo — use o token correto da escala.
- Não use focus ring de 1px ou opacity multiplicada (ex: `ring-1 ring-ring/50`) — sempre `ring-2 ring-ring`.

## 8. Histórico de migrações aplicadas

Mudanças sistêmicas já consolidadas no código (registro pra não regredir):

- **Paleta dark refeita** sobre `surface-dark` / `surface-dark-soft` / `surface-dark-elevated` do DESIGN-claude.md. Saiu da terracotta `#c96442` pra coral `#cc785c`. Eliminou colisões (`--card == --popover == --muted` antes; agora 5 níveis distintos).
- **Tokens `--border` e `--input` separados.** `--border` em `#3d3d3a` (visível como hairline); `--input` em `#48464a` (1 degrau mais forte por affordance). Antes ambos em `#2a2825` — invisíveis sobre o background.
- **`--ring` em coral 40% sólido** + componentes aplicando `ring-2 ring-ring` (era `ring-1 ring-ring/50` = 1px @ 20% effective). Focus state tem peso real agora.
- **Tipografia editorial via `next/font/google`.** Cormorant Garamond (display weight 400 + tracking tight) + Inter (UI). Antes era Georgia + system fonts via fallback.
- **Cantos arredondados.** 99 ocorrências de `rounded-none` em 39 componentes shadcn substituídas por `rounded-md`/`rounded-lg`/`rounded-full`/`rounded-sm` conforme categoria. 22 ocorrências em pages do dashboard (`tool-form`, `branch-form`, `supplier-form`, `category-form`, `promotion-form`, `tool-image-gallery`, `app-sidebar`, etc.) limpas junto.
- **Body type subiu** de `text-xs` (12px) para `text-sm` (14px) em `Button` e `Card` base. Override pontual com `text-xs/relaxed` se layout apertado precisar.
- **`--destructive-foreground` adicionado.** Variants destructive de Button/Badge agora são fill sólido + texto white (eram bg/10 + text-destructive — contraste fraco).

## 9. Referência rápida (para prompts e PRs)

| Pergunta | Resposta |
|---|---|
| Qual a cor de marca? | Coral `#cc785c` (token `--primary`) |
| Qual a fonte de headlines? | Cormorant Garamond weight 400 com tracking-tight |
| Posso usar pure white de fundo? | Não. Page floor é `bg-background` (#181715) |
| Como faço destaque sem coral? | `bg-secondary` (#3d3d3a) ou `bg-card` + `border-border` |
| Onde está o token de erro? | `bg-destructive` / `text-destructive-foreground` (#c64545 + white) |
| Posso usar cool gray? | Apenas em chart-3 (teal). Em UI chrome, não. |
| Qual a linha base de body? | `text-sm leading-relaxed` (14px / 1.55) |
| Como faço focus state? | `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring` |
| Qual radius pra um card novo? | `rounded-lg` (12px). Botões/inputs em `rounded-md` (8px). |
| Borda de input precisa ser mais forte que de card? | Sim — input usa `border-input` (#48464a), card/section usa `border-border` (#3d3d3a). |

## 10. Origem

- Filosofia visual e tokens: `~/Downloads/DESIGN-claude.md` (Anthropic Claude marketing site, abril 2026).
- Adaptação dashboard-dark: este documento.
- Implementação canônica: `packages/ui/src/styles/globals.css` + `apps/web/src/app/layout.tsx`.
- Showcase visual: `apps/web/src/app/design/page.tsx` em `http://localhost:3001/design`.

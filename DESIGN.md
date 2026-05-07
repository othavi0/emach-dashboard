# Design System — emach dashboard (Industrial neutrals + role-based color)

> Dashboard interno emach. Dark-mode único, AAA, voz de engenheiro. Substitui a iteração anterior "Anthropic Claude inspired" — coral terracotta saiu, copper entra como brand, sistema de 6 roles distintos (primary / secondary / destructive / warning / info / success) substitui o "tudo é coral" anterior.

## 1. Visão & Atmosfera

Dashboard emach é ferramenta de oficina, não revista editorial. Painel de controle warm-dark, tipografia funcional, cor-como-sistema — cada role tem matiz própria reconhecível à distância. Não imita Anthropic, Linear, Stripe nem Shopify. Densidade alta porque equipe interna lê tudo.

Assinatura visual:

1. **Canvas warm-dark** com 5 níveis de elevação distintos (background → muted → card → border → secondary). Toda neutra tem chroma warm (oklch hue ~70).
2. **Primary copper** `oklch(0.65 0.15 45)` — cobre oxidado, hue 45 (mais quente/vermelho que coral, distinto de qualquer terracotta de marketing). Aparece em CTA primário, focus ring, brand stamp.
3. **6 roles cromáticos** com matizes separadas por ≥20° de hue circle: copper / mustard / oxide red / teal / jade / warm graphite. Usuário lê estado pelo rabo do olho.
4. **Tipografia funcional.** Sans-only no UI chrome. Serif preservada para 1–2 momentos editoriais (página de login, header de relatório), nunca como assinatura sistêmica.
5. **AAA + reduced motion** não-negociável. Contraste 7:1 em body, focus ring sólido 2px, animações respeitam `prefers-reduced-motion`.
6. **Depth via surface contrast**, não shadow. Hairline borders + ring sutil + bg-shift fazem o trabalho de elevação.

## 2. Paleta

Tokens em `packages/ui/src/styles/globals.css`, escopados em `.dark`. Use Tailwind tokens (`bg-card`, `text-foreground`, `bg-warning`, etc.) — **nunca** hardcode hex.

### Surfaces (escuro → claro)

| Token | OKLCH | Hex aprox | Uso |
|---|---|---|---|
| `--sidebar` | `0.13 0.004 70` | `#171612` | Sidebar — mais escuro que background |
| `--background` | `0.16 0.005 70` | `#1d1b18` | Page floor |
| `--muted` | `0.18 0.004 70` | `#221f1c` | Inset: tracks slider, skeletons, code, tab list bg |
| `--card` / `--popover` / `--accent` | `0.20 0.005 70` | `#262320` | Cards, popovers, dialogs — surface elevated |
| `--border` | `0.36 0.008 70` | `#4a4641` | Hairline visível sobre background e card — degrau elevação |
| `--input` | `0.42 0.010 70` | `#57524c` | Borda inputs/selects/textareas — 1 degrau acima do border (affordance) |
| `--secondary` | `0.42 0.020 70` | `#5c554d` | Botão secundário, surface ênfase média |

### Roles cromáticos (6 distintos)

| Role | Token | OKLCH | Hex | FG | Uso |
|---|---|---|---|---|---|
| **Primary (copper)** | `--primary` | `0.65 0.15 45` | `#c2724a` | `#fefefe` | CTA primário, focus ring, brand stamp, chart-1 |
| **Secondary** | `--secondary` | `0.42 0.020 70` | `#5c554d` | `#faf9f5` | Ações neutras, badges sem destaque |
| **Destructive (oxide red)** | `--destructive` | `0.55 0.20 25` | `#c25240` | `#fefefe` | Erro, cancelado, deletar, falha de validação |
| **Warning (mustard)** | `--warning` | `0.78 0.15 85` | `#cfa845` | `#1d1b18` | Estoque mínimo, ação reversível precisa atenção, deadline próximo |
| **Info (teal)** | `--info` | `0.65 0.10 200` | `#5da8ac` | `#fefefe` | Notificação neutra, link secundário, status "em processamento" |
| **Success (jade)** | `--success` | `0.62 0.13 155` | `#3fa580` | `#fefefe` | Confirmação, status "entregue/pago", saldo positivo |

**Distinção de hue:** primary 45 → destructive 25 → warning 85 → info 200 → success 155 → secondary 70. Mínimo 20° entre matizes vizinhas no círculo cromático. Diferente do sistema anterior onde primary e destructive fundiam (38 vs 22).

### Foreground

| Token | OKLCH | Uso |
|---|---|---|
| `--foreground` | `0.97 0.008 85` | Texto primário on-dark |
| `--muted-foreground` | `0.70 0.010 75` | Secondary text, captions, metadata |

### Charts (5 séries)

`--chart-1` copper · `--chart-2` mustard · `--chart-3` teal · `--chart-4` jade · `--chart-5` oxide red. Cada série tem matiz própria — distintas mesmo em escala de cinza (luminância separada por ≥0.06).

### Ring

`--ring` = primary 55% alpha. Componentes aplicam `ring-2 ring-ring`. Sem opacidade multiplicada. Sem 1px. Focus tem peso real.

## 3. Tipografia

Carregada via `next/font/google` em `apps/web/src/app/layout.tsx`:

- **Sans (UI chrome, headlines, body):** Inter variable. Token `font-sans`, var `--font-sans-loaded`.
- **Serif (uso restrito, momentos editoriais):** Cormorant Garamond. Token `font-serif`, var `--font-serif-loaded`. **NÃO é mais a personalidade do dashboard** — sai de h1/h2 default. Usar só em login hero, capa de relatório impresso, página de design system. Nunca no chrome do dashboard.
- **Mono (código):** stack do sistema. Token `font-mono`.

### Hierarquia funcional

Contraste por **peso e case**, não família. Sans-only no chrome.

| Função | Classes Tailwind | Notas |
|---|---|---|
| Display (raro) | `font-sans text-3xl font-medium tracking-tight` | 30px, peso médio. Páginas de overview. |
| h1 página | `font-sans text-2xl font-medium tracking-tight` | 24px / weight 500. Antes era serif weight 400 — sai. |
| h2 seção | `font-sans text-lg font-medium tracking-tight` | 18px |
| h3 sub-seção | `font-sans text-sm font-semibold uppercase tracking-wider` | 14px caps — section marker |
| Title prominent | `font-sans text-base font-medium` | 16px — card titles em listas |
| Body padrão | `font-sans text-sm leading-relaxed` | **14px / 1.625** — UI chrome, baseline do dashboard |
| Body alternativo | `font-sans text-base leading-relaxed` | 16px — páginas de leitura intensa (descrição de ferramenta) |
| Caption | `font-sans text-xs text-muted-foreground` | 12px — metadata, helpers, footers de tabela |
| Caption uppercase | `font-sans text-[11px] tracking-widest uppercase font-medium` | Section marker, badge text |
| Code | `font-mono text-xs` | SKU, IDs, atalhos, valores literais |

### Princípios

- **Contraste vem de peso e case, não de família.** `font-medium` (500) é o piso pra title/h1/h2. `uppercase tracking-wider` faz section markers.
- **Body em 14px (`text-sm`)** baseline. AAA exige 7:1 — `--foreground` sobre `--background` cumpre.
- **Line-height generosa** (`leading-relaxed` 1.625). Sessão longa, equipe lê muito.
- **Serif só onde voz editorial faz sentido** (login, capa relatório). Não em chrome.
- **Nunca text-xs em body principal** — fica denso demais mesmo pra equipe interna.

## 4. Componentes

50+ shadcn buildados sobre `@base-ui/react` em `packages/ui/src/components/*`.

### Buttons

`packages/ui/src/components/button.tsx`. Variants:

| Variant | Uso |
|---|---|
| `default` | CTA primário (copper) — máximo 1 por surface |
| `secondary` | Ação neutra, opção paralela |
| `outline` | Ação terciária com borda visível |
| `ghost` | Ação inline, baixa hierarquia |
| `destructive` | Deletar, cancelar pedido, anonimizar cliente |
| `warning` | Ação reversível com atenção: reverter pagamento, descartar variantes órfãs |
| `info` | Notificação acionável, "ver detalhes" em alert info |
| `success` | Confirmar conclusão: "marcar como entregue", "aprovar review" |
| `link` | Inline link textual |

Todos compartilham focus state idêntico: `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring`. Variants destructive/warning/info/success substituem ring color pela própria role (`ring-destructive/40` etc) — focus combina com a ação.

Sizes: `xs / sm / default / lg / icon / icon-xs / icon-sm / icon-lg`.

### Badges

`packages/ui/src/components/badge.tsx`. Mesmo conjunto de variants do Button — `default / secondary / destructive / warning / info / success / outline / ghost / link`. Use a role apropriada ao estado:

- `default` (copper) — destaque positivo / "Novo" / brand stamp
- `secondary` — status neutro / contagem / "Rascunho"
- `destructive` — "Cancelado" / "Erro de cadastro"
- `warning` — "Estoque baixo" / "Vence em 3d"
- `info` — "Em processamento" / "Aguardando NF"
- `success` — "Pago" / "Entregue" / "Ativo"
- `outline` — "Arquivado" / categorias secundárias

### Alerts

`packages/ui/src/components/alert.tsx`. Mesmo padrão de roles: `default / destructive / warning / info / success`. Bg sempre `bg-card` — texto carrega cor da role. Mantém legibilidade em dark sem fill saturado dominante.

### Inputs

- `Input` / `Textarea` / `Select` / `Combobox` / `Field`:
  - **Default:** `bg-transparent` + `border-input` (`#57524c`) — hairline forte sobre card e background.
  - **Focus:** border flipa pra `border-ring` + `ring-2 ring-ring` (copper 55%). 2px sólido.
  - **Invalid:** `border-destructive` + `ring-1 ring-destructive/20`.
- `Checkbox` / `RadioGroup` / `Switch`: bg copper quando checked.

### Cards & Containers

- `Card`: `bg-card` (#262320), ring `ring-1 ring-foreground/10` (substitui border tradicional), padding interno 16–32px.
- `Dialog` / `Popover`: mesma elevação que Card, portal `z-50`.
- Sidebar: `bg-sidebar` (#171612) — mais escuro que background.

### Não use

- `<img>` nu — sempre `next/image` (CLAUDE.md P1).
- Cool blue-grays no chrome. Teal só em info-role e charts.
- `text-xs` no body principal.
- Drop shadows pesados. Depth = surface contrast + ring.
- `font-serif` em chrome do dashboard — só momentos editoriais discretos.
- Bold weight (700+) onde `font-medium` (500) já contrasta — vira ruído.
- Emojis decorativos.

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

### Border Radius

| Token | Px | Componentes |
|---|---|---|
| `rounded-sm` | 6 | Checkbox, Kbd, Skeleton |
| `rounded-md` | 8 | Button, Input, Textarea, Select, Tooltip, Item, Badge, DropdownMenu items, Tabs, Toggle, Combobox, Field, InputGroup, InputOTP, Sidebar items, form sections |
| `rounded-lg` | 12 | Card, Dialog, AlertDialog, Alert, Popover, HoverCard, Command, Drawer, Empty |
| `rounded-xl` | 16 | Hero containers (raro) |
| `rounded-full` | ∞ | Slider track/thumb, Progress, ScrollArea, avatares, pill badges |

Exceção: `Calendar` mantém `rounded-none` em `range_middle` — semântica de intervalo.

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|---|---|---|
| Flat | sem shadow, sem border | Sections, page floor, top nav |
| Hairline | `border-border` (1px) | Inputs, divisores, table rows |
| Ring | `ring-1 ring-foreground/10` | Cards, popovers, dialogs |
| Surface | `bg-card` sobre `bg-background` | Cards, panels |
| Drop shadow | `shadow-md` | Apenas overlays portados (Dropdown, Tooltip, Select content) |

Filosofia: depth via contraste de surface, não shadow. Flat-first. Sombras só em overlays, sutis.

## 7. Acessibilidade

WCAG **AAA** target. Não-negociável para equipe interna em sessão longa.

### Contraste

- Body text sobre background: 7:1 (AAA normal text). `--foreground` (`oklch 0.97 ...`) sobre `--background` (`0.16 ...`) cumpre.
- Texto sobre roles saturadas (button primary etc): 4.5:1 (AAA large text). `--*-foreground` calibrados em OKLCH para garantir contraste.
- UI controls (border de input, ícones): 3:1 (AAA non-text). `--input` (`0.42`) sobre `--card` (`0.20`) cumpre.

### Focus

- Sempre `ring-2` sólido. Nunca opacity multiplicada (`ring-1 ring-ring/50`), nunca 1px.
- Cor da ring acompanha role da ação (destructive ring em button destructive, etc).
- `outline` fallback no `:focus-visible` global garante visibilidade mesmo se classe Tailwind falhar.

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

## 9. Do's & Don'ts

### Do

- Use tokens (`bg-card`, `text-foreground`, `bg-warning`) — nunca hex literal.
- Copper (`bg-primary`) só em CTAs primários, focus rings, brand stamp, chart-1. Reservado.
- Cada role com matiz própria. Status reconhecível à distância.
- Body sans `text-sm leading-relaxed` (14px / 1.625) por padrão.
- `font-medium` (500) como peso de h1/h2/title. Contraste por peso, não família.
- Inputs em `border-input` (`#57524c`) — borda mais forte que `border-border`.
- Focus ring 2px sólido na cor da role da ação.
- Respeite `prefers-reduced-motion`.
- Status sempre = ícone + label + cor (color blindness safe).

### Don't

- Não introduza cool blue-grays. Toda neutra tem chroma warm (oklch hue 70).
- Não use coral terracotta — saiu junto com o sistema anterior.
- Não use serif Cormorant em h1/h2 do chrome do dashboard.
- Não pinte coisas de copper aleatoriamente. Restrinja a CTA + focus + brand.
- Não fundamente status só em cor — sempre ícone + label.
- Não use `--border` e `--input` como sinônimos — input é 1 degrau mais forte.
- Não escreva copy "AI assistente prestativo". Equipe quer ferramenta.
- Não use `text-xs` em body principal.
- Não desligue `prefers-reduced-motion` em qualquer animação.
- Não use focus ring 1px ou opacity multiplicada (`ring-1 ring-ring/50`).
- Não use `rounded-none` em componente novo (exceto exceção semântica documentada).

## 10. Histórico de migrações

Mudanças sistêmicas consolidadas:

- **Saída do Anthropic Claude inspired** (iteração anterior): coral terracotta + Cormorant editorial gigante + tom helpful AI. Substituído por industrial neutrals + copper + tipografia funcional.
- **6 roles cromáticos distintos** (`primary / secondary / destructive / warning / info / success`), cada com `--*` + `--*-foreground` em globals.css, mapeados em `@theme inline` como `--color-*` tailwind tokens. Adicionados `warning / info / success` em `Button`, `Badge`, `Alert` variants.
- **Primary copper** `oklch(0.65 0.15 45)` substitui `oklch(0.62 0.12 38)` (coral). Hue 45 distinto de qualquer terracotta de marketing.
- **Destructive oxide red** `oklch(0.55 0.20 25)` (era `0.56 0.17 22` — coral colision). Distinção 20° de hue do primary garantida.
- **Surfaces afastadas:** `--background` `0.16` / `--muted` `0.18` / `--card` `0.20` / `--border` `0.36` / `--input` `0.42` / `--secondary` `0.42`. 5 níveis distintos com diff ≥0.02 luminância.
- **Tokens `--border` e `--input` separados** (`0.36` vs `0.42`) — mantido do sistema anterior.
- **Ring 2px sólido em primary 55%** (era 40%) — focus tem peso visual real em dark mode.
- **`prefers-reduced-motion: reduce`** zera animations/transitions globalmente — AAA requirement.
- **Cantos arredondados** mantidos do sistema anterior (rounded-md interactive, rounded-lg surfaces, etc).
- **Body type** `text-sm` (14px) baseline — mantido.

## 11. Referência rápida

| Pergunta | Resposta |
|---|---|
| Qual a cor de marca? | Copper `oklch(0.65 0.15 45)` (`--primary`) |
| Qual a fonte default? | Inter sans. Serif só em momentos editoriais (login, relatório). |
| Como faço destaque sem copper? | `bg-secondary` ou `bg-card` + `border-border` |
| Como sinalizo "estoque mínimo"? | `bg-warning` + ícone + label "Estoque mínimo" |
| Como sinalizo "pedido entregue"? | `bg-success` + ícone check + label |
| Como sinalizo "em processamento"? | `bg-info` + ícone clock + label |
| Posso usar cool gray? | Apenas em `--info` (teal) e chart-3. Em chrome geral, não. |
| Qual a linha base de body? | `text-sm leading-relaxed` (14px / 1.625) |
| Como faço focus state? | `focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring` |
| Qual radius pra card novo? | `rounded-lg` (12px). Botões/inputs `rounded-md` (8px). |
| Qual o contraste mínimo? | AAA: 7:1 body, 4.5:1 large text, 3:1 non-text UI. |

## 12. Origem

- Filosofia visual e tokens: este documento (industrial neutrals, role-based color, AAA dark).
- Implementação canônica: `packages/ui/src/styles/globals.css` + componentes em `packages/ui/src/components/*`.
- Showcase: `apps/web/src/app/design/page.tsx` (sistema completo) + `/design/preview` (comparação histórica de paletas).
- Strategic context: `PRODUCT.md` (register product / personality confiante-técnico-denso / anti-references).

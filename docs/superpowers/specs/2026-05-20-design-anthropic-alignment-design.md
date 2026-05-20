# Design alignment — emach dashboard ↔ Anthropic palette/voice (dark-only)

> **Contexto**: O `DESIGN.md` atual (industrial neutrals + copper) afirma no histórico que "saiu do Anthropic Claude inspired" — mas o usuário quer reverter parcialmente essa rota: trazer de volta o coral e a voz editorial da Anthropic, **sem perder o dark-mode único** e a voz workshop. Esta spec documenta as decisões e o plano de execução.

## Filosofia da mudança

Anthropic é fundamentalmente um sistema **light-first** (cream canvas + dark navy product cards como contraste). Não dá para portar literal em dark-only.

O que SIM dá para portar:
1. **Hue do coral** (38°, em vez de copper 45°) — voz cromática Anthropic
2. **Serif em headlines** (Cormorant Garamond) — voz editorial
3. **Ritmo de contraste por surfaces** (Anthropic alterna cream ↔ dark-navy; em dark-only adicionamos uma surface mais profunda para "punctuar" o ritmo)
4. **Coral callout cards** (full-bleed coral para CTAs grandes) — pattern de marketing portado para empty states e onboarding

O que NÃO porta:
1. Cream canvas → contradição com dark-only
2. Featured-tier por pricing inversion → adaptado para "featured item por dark+coral ring" em listas
3. Voz "thinking partner" → mantemos voz "ferramenta de oficina"

## Decisões batidas

| # | Decisão | Detalhe |
|---|---|---|
| 1 | **Primary copper → coral** | `oklch(0.65 0.13 38)` ≈ `#cc785c` (literal Anthropic). Hue de 45→38, chroma de 0.15→0.13. |
| 2 | **Destructive oxide → red puro** | `oklch(0.55 0.20 15)` (de hue 25). Mantém 23° de separação do primary. |
| 3 | **Cormorant em h1 + h2 de todas as páginas** | Sans só em h3+, body, controls, sidebar. Display weight 400 + `tracking-tight`. |
| 4 | **Novo token `--surface-deep`** | `oklch(0.11 0.005 70)` — usado em code blocks, terminal/log viewers, hero de empty state, opcionalmente chart background. Não substitui surfaces existentes. |
| 5 | **Componentes novos: callout-card-coral + featured-card-dark** | Documentados em `DESIGN.md §4`. Coral callout para empty states/banners; featured-card para destacar item recomendado em listas/grids. |

## Derivativas

| Token | Antes | Depois | Notas |
|---|---|---|---|
| `--primary` | `oklch(0.65 0.15 45)` | `oklch(0.65 0.13 38)` | Coral Anthropic literal |
| `--destructive` | `oklch(0.55 0.20 25)` | `oklch(0.55 0.20 15)` | Vermelho mais puro |
| `--ring` | `oklch(0.65 0.15 45 / 0.55)` | `oklch(0.65 0.13 38 / 0.55)` | Inherits primary |
| `--sidebar-primary` | `oklch(0.65 0.15 45)` | `oklch(0.65 0.13 38)` | Inherits |
| `--sidebar-ring` | `oklch(0.65 0.15 45 / 0.55)` | `oklch(0.65 0.13 38 / 0.55)` | Inherits |
| `--chart-1` | `oklch(0.65 0.15 45)` | `oklch(0.65 0.13 38)` | Inherits primary |
| `--chart-5` | `oklch(0.55 0.20 25)` | `oklch(0.55 0.20 15)` | Inherits destructive |
| `--surface-deep` | (novo) | `oklch(0.11 0.005 70)` | "Well" surface para code/data |
| `--color-surface-deep` | (novo) | `var(--surface-deep)` | Tailwind token |

Surfaces existentes (`--background 0.16`, `--muted 0.18`, `--card 0.20`, `--border 0.36`, `--input 0.42`, `--secondary 0.42`) ficam **intocadas** — refactor cosmético, não estrutural.

Foregrounds não mudam (contraste AAA já validado contra `--foreground 0.97`).

## DESIGN.md — mudanças concretas

### §1 Visão & Atmosfera

- Adicionar parágrafo sobre filosofia editorial-meets-workshop: serif em headlines como assinatura, coral como brand voltage, ritmo de surface depth.
- Manter "ferramenta de oficina" — voz workshop preservada.

### §2 Paleta

- Tabela "Roles cromáticos" atualizada (primary coral 38, destructive red 15).
- Linha nova "Surface deep" na tabela de surfaces.
- Distinção de hue atualizada: `primary 38 → destructive 15 → warning 85 → info 200 → success 155 → secondary 70` (todas com ≥20° vs vizinhas, exceto secondary que é warm neutral).
- Charts: chart-1 coral, chart-5 red puro.

### §3 Tipografia

Reescrever princípios:
- "Display e h1/h2 em Cormorant Garamond weight 400 com `tracking-tight` (-0.025em). Pareia com Inter sans 400/500 em body e UI chrome."
- "Serif é a voz do dashboard, não exceção. Foi reverted da iteração industrial-only de volta para editorial-workshop híbrido."

Atualizar tabela de hierarquia:
- Display: `font-serif text-4xl font-normal tracking-tight` (era `font-sans text-3xl font-medium`)
- h1 página: `font-serif text-3xl font-normal tracking-tight` (era `font-sans text-2xl font-medium`)
- h2 seção: `font-serif text-xl font-normal tracking-tight` (era `font-sans text-lg font-medium`)
- h3 sub-seção: `font-sans text-sm font-semibold uppercase tracking-wider` (mantém)
- Title prominent: `font-sans text-base font-medium` (mantém — em listas/cards)
- Body: `font-sans text-sm leading-relaxed` (mantém)
- Demais: mantém.

### §4 Componentes

Adicionar duas subsections novas:

**Callout coral (`callout-card-coral`)**

> Full-bleed coral card para CTA grande, empty state de módulo vazio, ou banner de onboarding. Bg `bg-primary`, text `text-primary-foreground`, padding `p-12`, rounded `rounded-lg`. CTA interna usa botão invertido (`bg-card text-foreground`). Uso restrito: máximo 1 por página, nunca em página densa de listagem.

**Featured card (`featured-card-dark`)**

> Para destacar item recomendado em grid/lista (template de pedido sugerido, ferramenta featured, plano recomendado). Bg `bg-surface-deep`, `ring-2 ring-primary`, padding generoso. Inversão visual no meio de cards `bg-card` regulares.

**Code block / log viewer**

> Container de código, JSON debug, log de webhook: bg `bg-surface-deep`, padding `p-4`, font `font-mono text-xs`, scroll horizontal preservado. Borda nenhuma (a deep surface já diferencia).

### §6 Profundidade

Adicionar linha "Deep surface" na tabela:
| Nível | Tratamento | Uso |
| Deep | `bg-surface-deep` (`0.11`) | Code/log/terminal containers, callout featured |

### §9 Do's & Don'ts

Adicionar:

**Do**:
- Cormorant em h1 + h2 — voz editorial é assinatura.
- Coral callout só em empty state/onboarding/banner crítico — nunca decorativo.
- Surface-deep só em code/log/featured — não como surface padrão.

**Don't**:
- Não use Cormorant em h3, em body, em controls, em sidebar — só h1/h2.
- Não use coral callout em listagens densas (ruído visual).
- Não use surface-deep como bg de card regular (quebra ladder).

### §10 Histórico

Adicionar entrada nova:
> **Re-aproximação Anthropic (2026-05-20)** — coral hue 38 (de copper 45), Cormorant em h1/h2 de todo chrome (era restrito a login), `--surface-deep` (0.11) para code/data, callout-card-coral e featured-card-dark documentados. Mantém dark-only e voz workshop. Destructive hue 15 (de 25) para preservar separação 20°+ do novo primary.

## Plano de implementação

1. **Atualizar `packages/ui/src/styles/globals.css`** — token swaps + adicionar `--surface-deep` em `.dark` e `--color-surface-deep` em `@theme inline`.
2. **Reescrever `DESIGN.md`** — seções §1, §2, §3, §4, §6, §9, §10 conforme acima.
3. **Verificar componentes shadcn** — buscar usos hardcoded de copper/oxide hex (não deveria haver, mas confirmar). `grep -rE "oklch.*0\.15.*45|oklch.*0\.20.*25|#c2724a|#c25240"`.
4. **Smoke visual** — `bun dev:web`, visitar `/dashboard`, `/dashboard/tools`, `/dashboard/orders`, `/design`, `/login`. Confirmar:
   - Coral aparece em CTAs primários (botão "Salvar", "Criar")
   - Destructive aparece em "Deletar", badges de erro
   - h1/h2 em Cormorant nas páginas (já que `font-serif` está carregada)
   - Focus ring na nova cor
5. **`bun check-types`** — garantir que nada quebrou por TS (não deve, é só CSS).
6. **`bun fix`** — formato.
7. **Commit**: `feat(design): re-aproxima paleta Anthropic (coral 38, serif h1/h2, surface-deep)`.

## Out of scope

- Light mode / dual-theme (decidido manter dark-only).
- Refactor de páginas para adicionar callout-card-coral retroativamente — pattern só fica documentado; uso vem em features futuras.
- Refactor de Cormorant weight tuning fino — começa com 400 + tracking-tight; ajuste se contraste em dark mode pedir 500.
- Spike-mark glyph Anthropic — é asset proprietário, não portamos.
- Testes Playwright de regressão visual — fora do escopo desta iteração.

## Riscos

| Risco | Mitigação |
|---|---|
| Cormorant 400 em dark mode pode ficar fino | Smoke visual; se fino, subir para 500 |
| Coral hue 38 mais próximo do amber/mustard warning (85) — pode confundir | 47° de separação, não conflita; já validado por DESIGN.md atual com hue 45 (40° de sep) |
| Tabelas de listagem com Cormorant em h1/h2 podem perder densidade | h2 em tabelas é raro; h1 é página-nível. Densidade interna usa Title Prominent (sans). |
| Empty states existentes precisam refactor para usar novo callout? | Não — pattern só documentado, retrofit futuro. |
| Mudança de chart-1 e chart-5 pode quebrar leitura de gráficos em uso | Charts atuais usam tokens — recolorem automaticamente. Smoke confirma. |

## Verificação

- `bun check-types` passa.
- `bun fix` passa.
- Smoke visual em 5 páginas listadas acima sem regressão.
- Contraste AAA validado em `/design` (showcase do sistema).

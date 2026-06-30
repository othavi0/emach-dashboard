# Troca tipográfica — Direção C1 (industrial condensada)

> Spec de brainstorming + plano de implementação. Substitui o par editorial **Cormorant Garamond + Inter** pela superfamília industrial **Barlow Condensed + Barlow**, com **IBM Plex Mono** para dado, unificando a tipografia do dashboard com o storefront e-commerce.
>
> Data: 2026-06-30 · Status: **aprovado (sistema), aguardando aprovação do spec p/ implementar** · Decisão tomada via visual companion (4 telas).

---

## 1. Decisão (sistema final)

| Papel | Antes | **Depois** | Tratamento |
|---|---|---|---|
| **Display** (h1, títulos de página) | Cormorant Garamond (serif) | **Barlow Condensed** 700 | **CAIXA-ALTA** via `text-transform`, `tracking-[0.015em]` |
| **Wordmark texto** | Cormorant | **Barlow Condensed** 700 | **EMACH** caixa-alta |
| **Corpo / chrome / sidebar / tabelas / forms** | Inter | **Barlow** 400/500 | sentence case |
| **Números** (stats, qtd) | Inter | **Barlow** 700 | `tabular-nums` |
| **Mono** (SKU, ID, valores — ~97 usos) | stack do sistema | **IBM Plex Mono** | — |

Token semântico: `font-serif` = display (Barlow Condensed), `font-sans` = corpo (Barlow), `font-mono` = IBM Plex Mono. **Dark-only, paleta coral e AAA inalterados** — isto é só tipografia.

### Por que C1 (rationale)

- **Unifica com o storefront.** O e-commerce já roda Barlow + Barlow Condensed (preview de banner). C1 é o mesmo sistema de type → dashboard e loja falam a mesma língua.
- **Superfamília coesa.** Display e corpo da mesma família (Barlow), harmonizam por design — diferente de parear duas superfamílias.
- **Resolve as fraquezas da iteração anterior.** Cormorant era um serif de *display* usado em tamanhos de *texto* e ficava fina em dark (daí o hack de weight 400→500); Inter era o "default invisível". Ambos saem.
- **Personalidade.** "Confiante, técnico, denso, voz de oficina industrial" (PRODUCT.md) — condensada caixa-alta tem cara de equipamento/painel; é coerente com ferramentas industriais.

### Ressalva registrada (decisão consciente do usuário)

Caixa-alta em manchete **custa escaneabilidade** em títulos longos e contraria a "voz editorial considerada" da iteração anterior. Mitigações adotadas:
- Caixa-alta **só** em h1 + wordmark texto. Corpo, h3/markers, labels e **títulos de entidade dinâmicos** seguem sentence case.
- Aplicada via **CSS `text-transform: uppercase`** (o texto real continua minúsculo no DOM → leitor de tela e SEO intactos).
- Barlow **Condensed** (estreita) absorve o caixa-alta sem estourar — validado com título longo real ("ESMERILHADEIRA ANGULAR 4½" 220V INDUSTRIAL", uma linha).
- 100% reversível (recuar pra sentence case = remover `uppercase` do recipe).

---

## 2. Arquitetura da troca

**Reuso das instâncias do storefront.** O `layout.tsx` já carrega `Barlow` (`--font-barlow`) e `Barlow_Condensed` (`--font-barlow-condensed`) para o preview de banner. O dashboard passa a **reusar essas mesmas variáveis**, então:
- O swap de famílias vira **2 arquivos** (`layout.tsx` + `globals.css`) e aplica em todos os ~120 call-sites de `font-*` instantaneamente (as classes Tailwind não mudam).
- O preview de banner (`cta-variant-class.ts`, `banner-live-preview.tsx`, que usam `font-[family-name:var(--font-barlow)]`) **não quebra** — as vars continuam existindo, agora compartilhadas.
- Remove-se Cormorant e Inter do bundle.

---

## 3. Mapa de mudanças — código

### 3.1 Swap de famílias (2 arquivos — aplica em tudo)

**`apps/web/src/app/layout.tsx`**
- Remover imports `Cormorant_Garamond`, `Inter`. Manter `Barlow`, `Barlow_Condensed`; adicionar `IBM_Plex_Mono`.
- Remover `fontSerif` (Cormorant) e `fontSans` (Inter).
- `fontBarlow`: subir weights para `["400","500","600","700"]` (corpo precisa de 500; storefront usava 400/600/700).
- `fontBarlowCondensed`: manter `["600","700"]` (display usa 700; banner usa 600/700).
- Adicionar `fontMono = IBM_Plex_Mono({ subsets:["latin"], weight:["400","500","600"], variable:"--font-ibm-plex-mono", display:"swap" })`.
- `<html className>`: `dark ${fontBarlow.variable} ${fontBarlowCondensed.variable} ${fontMono.variable}` (3 vars, sem serif/sans-loaded).

**`packages/ui/src/styles/globals.css`** (`@theme inline`, linhas 86-87)
```css
--font-sans: var(--font-barlow), "Barlow", system-ui, sans-serif;
/* display/condensed — nome `serif` mantido p/ estabilidade de migração (22 call-sites) */
--font-serif: var(--font-barlow-condensed), "Barlow Condensed", system-ui, sans-serif;
--font-mono: var(--font-ibm-plex-mono), "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace; /* NOVO */
```
Remover as referências a `--font-sans-loaded` / `--font-serif-loaded` (vars não mais emitidas). `--font-mono` é novo → os ~97 `font-mono` passam a IBM Plex Mono automaticamente, **zero churn**.

### 3.2 Caixa-alta nas manchetes (~20 sites; `PageHeader` cobre 21 páginas)

Recipe a aplicar nas h1: adicionar **`uppercase tracking-[0.015em]`** ao className existente.

| Alvo | Arquivo | Cobertura |
|---|---|---|
| **Componente compartilhado** | `apps/web/src/components/page-header.tsx` (h1) | **21 páginas** numa edição |
| h1 inline | `dashboard/page.tsx`, `dashboard/promotions/new/page.tsx`, `dashboard/reviews/[id]/page.tsx`, `dashboard/tools/[id]/edit/page.tsx`, `dashboard/tools/new/page.tsx`, `dashboard/separacao/_components/picking-execution.tsx` | 6 sites |
| Telas auth (hero login) | `components/auth/{auth-shell,auth-status-panel,forgot-password-form,invite-accept-form,login-form,reset-password-form}.tsx` | 6 arquivos (forgot tem 2 h1) |
| Utilitárias | `app/{error,not-found}.tsx`, `app/convite/page.tsx`, `app/redefinir-senha/page.tsx` | 4 sites |
| **Wordmark mobile** | `dashboard/layout.tsx:31` (`<span className="font-serif text-base">emach</span>`) | + `uppercase tracking-[0.04em]` → renderiza **EMACH** |

> **Não há h2 `font-serif` em uso** (h2 de seção já é sans na prática) → o caixa-alta é só h1. A regra documentada "h2 = serif" no DESIGN.md será reconciliada (§4).

### 3.3 Ocorrências decorativas / showroom (decisão por item)

- **`orders/[id]/.../order-identity.tsx:24`** — nº de pedido em `font-serif`. Vira Barlow Condensed (papel de título do detalhe). **Manter sentence/as-is** (é um código `EM-2026-0014`); não forçar uppercase. *Alternativa:* migrar para `font-mono` (é um ID) — decisão menor, default = manter display.
- **`design/page.tsx`, `design/preview/page.tsx`** — showroom do sistema. **Atualizar** os exemplos para refletir Barlow Condensed/Barlow/IBM Plex Mono + o recipe caixa-alta (é o style guide vivo).

### 3.4 Títulos de entidade (`EntityIdentityHeader`) — consistência

Hoje os títulos de detalhe são **sans** (`font-medium text-xl`, sem `font-serif`) — já estavam fora do sistema serif. Para coerência da nova voz:
- **Recomendado:** dar a eles o display (`font-serif`) em **sentence case** (a exceção de nome longo/dinâmico à regra de caixa-alta — nomes de entidade são longos e truncados; uppercase + `truncate` prejudica leitura). Regra nova: *caixa-alta em títulos fixos/curtos de página; display sentence-case em nomes dinâmicos de entidade.*
- Mesma família em todos os títulos (Barlow Condensed), sem o custo do uppercase em nome longo.

---

## 4. Mapa de mudanças — documentação

> **Docs vivos** são atualizados. **Plans/specs/ADRs históricos** (registros pontuais) **não** — exceto `plans/027` (fato factual de CSP `font-src`).

| Arquivo | O que muda |
|---|---|
| **`DESIGN.md`** | §título(L1) "coral + serif"→"coral + condensada industrial"; §1(L3,7,14) serif→condensada; **§3 Tipografia inteira(L65-96)**: Inter→Barlow, Cormorant→Barlow Condensed, +IBM Plex Mono, recipe caixa-alta, nova tabela de hierarquia/weights; §4 "Não use"(L445-446); §8(L559); §9 Do/Don't(L569,581-582); **§10 nova entrada de migração no topo**; §11 ref. rápida(L626,638); §12 origem(L653-654) |
| **`PRODUCT.md`** | §Anti-references(L21) e §Design Principles #4(L32): trocar a descrição "editorial serif Cormorant" pela voz industrial condensada |
| **`README.md`** | L18 e L97: one-liner do design system |
| **`CLAUDE.md`** (raiz, L41) | **Resolver a contradição.** Hoje: "`font-serif` (Cormorant) restrito a login hero + capa de relatório" (regra antiga, já divergente). Nova regra: "`font-serif` = token de display (Barlow Condensed **caixa-alta** via `text-transform`) — em h1 + wordmark; nunca em body/h3/controls/sidebar. Mono = IBM Plex Mono." |
| **`AGENTS.md`** (L41, L64) | **Cópia, não symlink** → mesma edição do CLAUDE.md (verificar antes; se virar symlink, 1 edição) |
| **`plans/027-security-response-headers.md`** (L107, L193) | Atualizar lista de fontes auto-hospedadas: Cormorant→Barlow Condensed, +IBM Plex Mono (afeta o racional do `font-src` da CSP) |

**Não tocar** (históricos): `docs/superpowers/plans/*`, `docs/superpowers/specs/2026-06-22-*`, etc. — a menção a `font-serif` como "banido" lá é registro pontual da época.

---

## 5. Fora de escopo / follow-ups

1. **Logo SVG desktop** (`/emach-nome-branco.svg`, usado em `app-sidebar.tsx:64`) — é asset de marca, não fonte. O wordmark texto vira EMACH (Barlow Condensed), mas o **logo desktop continua o SVG atual**. Para casar 100%, redesenhar o SVG (tarefa de design separada). Interim: SVG fica; aceitável (SVG é o logo canônico).
2. **Rename `font-serif`→`font-display`** — o nome "serif" passa a mentir (é condensada sans). Mantido nesta entrega por estabilidade (22 call-sites); rename é fast-follow opcional, com comentário no `globals.css` documentando.
3. **Peso/caixa do nº de pedido** e migração de títulos de entidade — incluídos como Fase 2 acima, mas reversíveis/ajustáveis.

---

## 6. Plano de implementação (ordenado)

**Fase 1 — Swap de famílias (núcleo, baixo risco):**
1. Editar `layout.tsx` (imports + instâncias + `<html>` vars).
2. Editar `globals.css` §86-87 (+`--font-mono`).
3. `bun check-types` → `bun run build` (gate: build pega coisas que tsc não pega) → `bun dev:web` + smoke visual em `/dashboard`, `/dashboard/tools`, `/login`, `/design`. **Neste ponto tudo já é Barlow/IBM Plex Mono, sentence case.**

**Fase 2 — Voz caixa-alta:**
4. `page-header.tsx` (+`uppercase tracking-[0.015em]`) → cobre 21 páginas.
5. 6 h1 inline + 6 auth + 4 utilitárias + wordmark mobile (EMACH).
6. `EntityIdentityHeader` → display sentence-case; showroom `/design` atualizado.
7. `bun check` (ultracite/lint) + smoke visual nas rotas-chave (incl. um detalhe com título longo).

**Fase 3 — Docs:** DESIGN.md, PRODUCT.md, README, CLAUDE.md + AGENTS.md (resolver contradição), plans/027.

**Fase 4 — Gate final:** `bun verify` (check-types && check && test). Smoke visual final. Commit(s) Conventional em PT.

### Verificação (smoke obrigatório — `check-types` não pega)
- [ ] `/dashboard`, `/dashboard/tools` (listagem + PageHeader caixa-alta), `/dashboard/orders/[id]` (título longo), `/login` (hero), `/design` (showroom).
- [ ] SKU/IDs em IBM Plex Mono; números tabulares alinhados.
- [ ] Preview de banner (`/dashboard/site/banners`) **não quebrou** (Barlow ainda renderiza).
- [ ] `text-transform` (não texto literal maiúsculo) — conferir DOM do título.
- [ ] AAA mantido (Barlow corpo 14px sobre background ≥7:1).

---

## 7. Origem da decisão

Visual companion (brainstorming) — 4 telas: (1) 4 direções → **C industrial**; (2) 3 pareamentos da C → **C1 Barlow Condensed + Barlow**; (3) micro-forks; (4) **caixa-alta + EMACH + IBM Plex Mono** validados em contexto real incl. título longo. Auditoria de footprint/docs: §3-4 deste spec. Fontes baixadas (OFL) e renderizadas offline via servidor local (internet do usuário fora).

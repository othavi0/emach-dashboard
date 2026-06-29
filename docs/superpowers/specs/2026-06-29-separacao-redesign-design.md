# Redesign visual — seção Separação

> Spec de design (brainstorming). Escopo: **visual/UX only** da seção `/dashboard/separacao` (listagem + execução). Lógica de separação, server actions e schema ficam intactos. Data: 2026-06-29.

## 1. Contexto e problema

A seção de separação (fila de pedidos pagos + tela de execução por leitura de código de barras) foi construída com decisões visuais que divergem do design system (`DESIGN.md`). Diagnóstico cruzando a tela real (em `localhost`) com o código:

| # | Sintoma relatado | Causa-raiz | Arquivo |
|---|---|---|---|
| 1 | "Azul de outro sistema" no banner de retomada | `ring-2 ring-info` (teal) como contorno estrutural + `bg-surface-deep`; é o padrão `featured-card-dark` com o anel trocado de coral para teal | `resume-banner.tsx:23` |
| 2 | Bordas pesadas ao entrar na ordem | `border-2 border-primary` coral em repouso no campo de scan; `border-2` no card de item em foco | `scan-input.tsx:31`, `picking-execution.tsx:212` |
| 3 | Campo de bipe escuro / lateral pesada | `bg-surface-deep` (tom mais escuro do sistema, proibido como surface de card) no scan; item ativo da lista com mesmo realce forte | `scan-input.tsx:31`, `picking-execution.tsx` |
| 4 | "Parece um, mas não conecta com o de baixo" | Barra de operação (`rounded-t-xl border-b-0`) e palco (`rounded-b-xl`) são dois irmãos separados pelo `gap-6` do layout — a "peça única" nunca encosta | `picking-execution.tsx:603,656` + dashboard `layout.tsx:33` |
| 5 | Botão voltar à esquerda que o sistema não usa | `<Link>` raw como botão-ícone `ArrowLeft` à esquerda do título | `picking-execution.tsx:605-611` |
| 6 | Barra de progresso some, sensação de "perdido" | Track `bg-muted` sobre `bg-sidebar` (contraste mínimo) + 0% = invisível; fills inconsistentes (`bg-info` vs `bg-primary`) | `picking-execution.tsx:644-651`, `resume-banner.tsx:37`, `picking-order-card.tsx:120` |

Extras: título "Separação em andamento" em **sans bold** (DESIGN.md exige serif Cormorant em h1/h2); botões e links construídos raw em vez dos componentes `Button`/`Badge`/`Progress` do design system; legenda "Feedback do scan" com 3 cards estáticos ocupando muito espaço vertical (`picking-execution.tsx:295-342`).

**Nota cromática:** nenhuma cor é hardcoded (zero `blue/cyan/#hex`). Tudo são tokens do sistema mal-aplicados — `info` (teal) é um token legítimo, mas estava sendo usado como tema estrutural da seção em vez de ficar restrito a badge de status.

## 2. Princípio cromático

A separação é uma **operação com progresso**, e a ação/progresso do sistema é **coral (primary)**. Decisão-mãe (validada): **coral é o acento padrão da seção** (banner, todas as barras de progresso, realce de item ativo, foco). **Teal (info) fica restrito ao badge de status** "Em separação" / "Separando" — uso correto do token. Isso elimina o "azul demais" na raiz.

## 3. Decisões aprovadas (via mockups no companheiro visual)

### 3.1 Banner de retomada — "Faixa coral discreta" (opção A)
- Surface de card normal (`bg-card`) + hairline `border border-border` 1px. **Remover** `bg-surface-deep` e `ring-2 ring-info`.
- Ícone play num quadrado `bg-primary/12 text-primary` (não `bg-info` sólido).
- Barra de progresso fill `bg-primary` (não `bg-info`), track visível.
- Botão "Retomar" usando o componente **`<Button>` (variant default, coral)** — não `<Link>` raw estilizado.
- Calmo, denso, sem o anel gritante.

### 3.2 Bloco de scan — "Arejado/claro, painel único" (opção C)
Unificar `ScanInput` + card de item em foco (`FocusCard`) num **painel único** (`border border-border` 1px, `bg-card` — sem `bg-surface-deep`; **não criar token de surface novo**, o "arejado" vem do respiro/padding e do contraste do campo, não de um tom inédito):
- **Campo de scan com cara de input real:** `border-input` 1px (não `border-2 border-primary`), surface de campo em contraste com o painel (ex. `bg-background` ou `bg-input/...` — usar tokens existentes), ícone `Barcode` (lucide) embutido, caret. Remover `border-2` e `bg-surface-deep`.
- **Item em foco integrado** (sem `border-2` própria; divisória 1px separa do campo): thumb (placeholder `Package` lucide) + nome + SKU à esquerda, **contagem grande ancorada à direita** (`0 / 4` + "falta N"), barra coral abaixo.
- **Botão "Item não encontrado" alinhado à direita** (`flex justify-end`) — hoje está à esquerda.
- **Feedback do scan:** remover os 3 cards de legenda estática (`picking-execution.tsx:295-342`). Substituir por uma **faixa de status no topo do painel** que aparece só no momento do bipe — ícone lucide + label curto (`Aceito` / `Já completo` / `Fora do pedido`), na cor da role (success/warning/destructive). **Sem frase narrativa** (o "código confere · contador subiu" sai).
- Respiro generoso; surfaces sem o tom mais escuro.

### 3.3 Header da execução — "Barra larga + saída à direita" (opção C)
- **Remover** o botão voltar à esquerda (`<Link>` raw `ArrowLeft`).
- **Título em serif** (Cormorant, `font-serif`, escala h1/h2 do sistema) — ex. "Separação · EM-2026-0004". Subtítulo: cliente + filial com ícone `MapPin` (lucide).
- Badge "Em separação" (info — uso correto).
- **Saída como ações à direita:** `<Button variant="ghost/outline">` "Voltar à fila" (com `ArrowLeft`) + `<Button variant="outline/ghost" destructive-toned>` "Cancelar". Mover o "Cancelar separação" que vivia no rodapé da coluna de itens para cá (deduplicar).
- **Barra de progresso larga full-width abaixo do título:** track claro/visível (contraste real, ex. `bg-input`/`bg-muted` com contraste suficiente — usar o componente **`<Progress>`** de `packages/ui`), fill `bg-primary`, **número sempre visível** ("X / 15 un · Y de N itens") mesmo em 0%.

### 3.4 Agrupamento + coluna de itens
- O header passa a ser **um card de header completo** (border 1px fechada), e o corpo (painel de scan + coluna de itens) é outro bloco. O `gap-6` natural entre dois cards fechados é correto — acaba a "barra órfã com `rounded-t` que não encosta". Abandonar a tentativa de colar `rounded-t`/`rounded-b`.
- **Coluna de itens** (`Itens do pedido`): surface de card arejada; **item ativo com realce coral sutil** = `bg-primary/9` + `inset ring 1px` coral (**não** `border-2`). Radios coral (ativo) / verde (concluído). Totais e "Concluir separação" (coral, travado com `Lock` + texto "Bipe as N unidades restantes para liberar") mantidos.

### 3.5 Consistência de barras de progresso
Todas as barras da seção em **`bg-primary`** (nunca `bg-info`), track visível, via componente `<Progress>`. Inclui: `resume-banner.tsx:37`, `picking-order-card.tsx:120`, `picking-execution.tsx:644-651`.

## 4. Princípios de execução (valem para toda a seção)
- **Espaçamento** na escala base-4px do DESIGN.md (`gap-1..gap-8`, `py-2.5` etc) — sem valores soltos.
- **Ícones** lucide-react, `aria-hidden`, `size` consistente (`size-3.5`/`size-4`/`size-5` conforme contexto). Barcode (scan), Package (item), Check/AlertTriangle/X (feedback), ArrowLeft (voltar), MapPin (filial), Lock (travado).
- **Componentes do design system**: `Button` (com variants), `Badge`, `Progress` — trocar `<Link>`/`<div>` raw estilizados.
- **Botões alinhados à direita** (`flex justify-end`).
- **AAA + reduced motion**: contraste 7:1 body, focus ring do sistema (`ring-1 ring-ring ring-offset-1`), o caret/animações respeitam `prefers-reduced-motion`.
- `border-2` proibido em repouso; coral reservado para ação/foco/feedback ativo.

## 5. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx` | Faixa coral discreta (3.1): remover surface-deep + ring-info; coral; `Button`/`Progress` |
| `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx` | Input com cara de campo (3.2): `border-input` 1px, sem surface-deep, ícone Barcode, caret reduced-motion |
| `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` | Header (3.3), unificação do painel de scan + item em foco (3.2), remover legenda de 3 cards → faixa de feedback, coluna de itens (3.4), barra de progresso via `Progress` (3.5), título serif, botões à direita |
| `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx` | Barra de progresso `bg-info` → `bg-primary` / `Progress` (3.5) |
| `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` | Revisar tokens/espaçamento se necessário (consistência) |
| `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx` | Revisar tokens/espaçamento se necessário (consistência) |

Fora de escopo: `data.ts`, `actions.ts`, `schema.ts`, `_lib/picking-logic.ts`.

## 6. Critério de aceite
- Nenhum `ring-info` / `bg-info` estrutural ou em barra de progresso; teal só em badge de status.
- Nenhum `border-2` em repouso; nenhum `bg-surface-deep` em surface de card de scan.
- Sem botão voltar à esquerda; saída como ação à direita.
- Barra de progresso visível em qualquer percentual (inclusive 0%), com número sempre presente.
- Título da execução em serif.
- Campo de scan + item em foco lidos como uma peça só.
- Feedback do scan inline (faixa), sem os 3 cards de legenda.
- `bun verify` (check-types + check + test) verde; smoke visual nas rotas `/dashboard/separacao` e `/dashboard/separacao/[orderId]`.

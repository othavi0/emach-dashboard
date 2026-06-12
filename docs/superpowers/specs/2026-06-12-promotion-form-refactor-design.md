# Refatoração da tela de criação/edição de promoção

**Data:** 2026-06-12
**Rota:** `/dashboard/promotions/new` e `/dashboard/promotions/[id]/edit`
**Status:** design aprovado (aguardando review do spec)

## Contexto

Teste manual da criação de promoções revelou um conjunto de bugs e limitações.
Há dois tipos de promoção (`promotion` = automática, `promocode` = cupom) e os
problemas afetam ambos. A tela hoje trava em `max-w-4xl` (ocupa ~metade da tela)
e o input de desconto e o tratamento de datas têm bugs de runtime que o
`check-types` não pega.

Investigação rodando a tela em `localhost:3007` confirmou as causas-raiz (não
suposições). Quem renderiza o "destaque do home" é o **repo ecommerce** (DB
compartilhada — ADR-0004); este repo só escreve a flag `featured`.

## Objetivos

1. Input de desconto: tirar o símbolo `% / R$` de dentro do texto editável.
2. Permitir programar promoção para iniciar hoje/no futuro (datas funcionando).
3. Destaque do home: bloquear troca enquanto houver destaque vivo.
4. Toda toast de erro dura mais (8s) e tem botão de fechar.
5. Layout ocupa a largura toda; botões Criar/Cancelar à direita.

## Não-objetivos

- Mudança de schema do banco (a regra de destaque é resolvida sem mexer no
  índice único `promotion_single_featured_idx`).
- Mudar a query do home no repo ecommerce.
- Agendar múltiplos destaques futuros não-sobrepostos (caminho descartado por
  exigir mudança de schema + cross-repo).
- Aplicar guard de "desconto R$ > preço da ferramenta" (é lógica do ecommerce;
  aqui só registramos o risco de contrato).

## Causas-raiz confirmadas

| Sintoma | Causa |
|---|---|
| Input vira "010" ao digitar | Valor inicial `0` formatado como `"0%"`; `%`/`R$` são texto editável; dígito gruda |
| Trocar % ↔ R$ corrompe (10 vira 0,10) | `MaskedInput` tem `display` em `useState` que **não re-sincroniza** quando `mask`/`value` mudam |
| "Não consigo iniciar no futuro" | Picker **captura** a data; `createPromotionSchema` rejeita início no passado e meia-noite de hoje (local) conta como passado |
| Promo de 1 dia impossível | Início/fim no mesmo dia → ambos meia-noite → `endsAt <= startsAt` → erro |
| Toast some rápido | `<Toaster>` sem `duration` → default sonner 4s |
| Erro de servidor "mudo" | `serverError` da action só vira banner vermelho, sem toast |
| Cupom com case inconsistente | `uppercase` é só CSS; valor é salvo como digitado |

## Design

### 1. Layout — seções em cards (full-width)

`promotion-form.tsx`: remover `max-w-4xl`; o form ocupa `w-full`.
`promotion-form-fields.tsx`: reorganizar em 4 cards titulados num grid
responsivo (`lg:grid-cols-2`, 1 coluna no mobile):

- **Tipo & Identidade** — seletor Automática/Cupom + Título + Descrição
- **Desconto** — `DiscountInput` + campos de cupom (Código, Limite de resgates,
  Valor mínimo) quando `type === "promocode"`
- **Vigência & Publicação** — Início, Fim, Ativa, Destaque no home
- **Ferramentas** — escopo (todas/específicas) + combobox

Cada card segue o shell visual do design system (`border border-border
rounded-lg p-4`, título `text-sm font-medium`). Footer abaixo dos cards com os
botões **alinhados à direita** (`flex justify-end gap-3`): Criar (primário) +
Cancelar (ghost). Footer **não-sticky** (rola junto).

### 2. Input de desconto — seletor embutido

Dois componentes novos em `apps/web/src/components/`:

**`affix-input.tsx`** — primitivo apresentacional. Props: `prefix?: ReactNode`,
`suffix?: ReactNode`, e o resto de `Input`. Renderiza o container com borda
(`focus-within:border-ring`), slots de prefixo/sufixo com separador, e um
`<input>` transparente. Reusável para qualquer campo com adorno.

**`discount-input.tsx`** — combina tipo + valor. Props:
`{ discountType, discountValue, onChange({discountType, discountValue}),
disabled, error }`. Prefixo = um `Select` (base-ui) com `%` / `R$` (substitui o
radio "Tipo de desconto", que **sai** do form). Input numérico limpo à direita:

- `percent`: formata o número com vírgula decimal, **sem símbolo**; máx 100;
  uma vírgula só.
- `fixed`: formata estilo moeda (`1.234,56`) **sem `R$`**.
- **Correção do bug de sync:** ao trocar o tipo (via dropdown), o componente
  reformata o `display` a partir do valor numérico atual — `useEffect` em
  `discountType` reseta o display. Sem corrupção do valor.
- Vazio → emite `undefined` (cai na validação "Informe o valor do desconto").
  Nunca emite símbolo no texto.

`minOrderAmount` (cupom) passa a usar um **`MoneyInput`** (R$ como prefixo fixo
via `AffixInput`, formatação de moeda sem símbolo no texto) — mesmo bug de "R$
inline", corrigido junto. `maxRedemptions` continua `MaskedInput` com
`integerMask` (não tem símbolo, sem bug).

As máscaras compartilhadas (`brlMask`, `percentageMask` em `lib/masks/`) **não
mudam** — são usadas em outras telas. A formatação sem-símbolo vive nos
componentes novos.

### 3. Destaque do home — bloqueio (sem mudar schema)

`actions.ts`, helper novo `assertFeaturedSlotFree(tx, excludeId?)`:

```
existing = SELECT id, active, startsAt, endsAt FROM promotion
           WHERE featured = true [AND id <> excludeId] LIMIT 1
if existing:
  status = computeStatus(existing)
  if status === 'active' || status === 'scheduled':
     conflict(mensagem)   // bloqueia
```

Mensagem (trata fim nulo):
- com fim: `"Já existe um destaque ativo até DD/MM/AAAA — remova-o ou aguarde o
  fim para destacar esta."` (data via `formatDate`)
- sem fim: `"Já existe um destaque ativo sem prazo de fim — remova-o para
  destacar esta."`

Chamado em `createPromotion`/`updatePromotion` **só quando** `isFeatured`. Se
liberado (nenhum destaque vivo), o flip-off de destaque obsoleto
(expirado/inativo) que já existe permanece — satisfaz o índice único. O índice
único do banco é o backstop de integridade.

### 4. Datas — permitir hoje + fuso São Paulo

Arquivo novo `apps/web/src/lib/format/date-input.ts` (separado de `datetime.ts`,
que é só display). Brasil sem DST desde 2019 → offset fixo `-03:00`.

```
saoPauloDayKey(d): string        // "YYYY-MM-DD" no fuso SP (via Intl)
startOfDaySaoPaulo(d): Date      // instante 00:00:00.000-03:00 do dia SP de d
endOfDaySaoPaulo(d): Date        // instante 23:59:59.999-03:00 do dia SP de d
```

**Schema** (`promotion-schema.ts`):
- Cross-field fim: comparar **por dia** — rejeita só se
  `saoPauloDayKey(endsAt) < saoPauloDayKey(startsAt)` (era `endsAt <= startsAt`).
  Mesmo dia passa → promo de 1 dia válida.
- `createPromotionSchema` past-check: rejeita só se
  `saoPauloDayKey(startsAt) < saoPauloDayKey(new Date())`. Hoje passa a valer.
- `discountValue`: mensagem amigável para vazio/zero — `z.number({ message:
  "Informe o valor do desconto" }).gt(0, "Desconto deve ser maior que zero")`.

**Action** (`createPromotion`/`updatePromotion`): normaliza antes de persistir —
`startsAt → startOfDaySaoPaulo`, `endsAt → endOfDaySaoPaulo`. Editar uma promo
existente joga o início pro começo do dia SP (comportamento esperado).

**Picker** (`promotion-form-fields.tsx`): o DatePicker de início recebe
`min={mode === "create" ? new Date() : undefined}` — desabilita dias passados no
calendário (feedback imediato). Em edição, sem restrição.

### 5. Toast — erro 8s + fechar, sucesso 4s

Arquivo novo `apps/web/src/lib/notify.ts`:

```
export const notify = {
  success: (msg, opts) => toast.success(msg, { duration: 4000, ...opts }),
  error:   (msg, opts) => toast.error(msg, { duration: 8000, closeButton: true, ...opts }),
  warning / info / message: pass-through com defaults
}
```

`packages/ui/src/components/sonner.tsx`: adicionar `closeButton` no `<Toaster>`
(qualquer `toast.error` cru já ganha o X).

`promotion-form.tsx`: trocar `toast.*` por `notify.*`. **`serverError` da action
também dispara `notify.error`** (8s) além do banner — antes era mudo.

**Rollout global:** migrar `toast.error(` → `notify.error(` (e `toast.success`)
no `apps/web` como passo final, verificado caso a caso (não sed cego — o hook de
auto-format e imports precisam de cuidado).

### 6. Código do cupom — normalização

`promotion-schema.ts`, campo `code` do `promocodeVariantSchema`: após
`min/max/regex`, `.transform((v) => v.trim().toUpperCase())`. Como o valor
persistido é sempre UPPERCASE, a unicidade (`assertCodeUnique`) vira
case-insensitive de fato. Vale client + server.

### 7. Contrato (registro, sem código)

Desconto `R$ fixo` sem teto pode passar do preço da ferramenta → preço
zero/negativo no checkout. A aplicação do desconto é no **repo ecommerce**.
Registrar o risco em `docs/integration/admin-ecommerce.md` (o ecommerce deve
clampar `max(0, preço - desconto)`).

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `apps/web/src/components/affix-input.tsx` | **novo** — primitivo input+adorno |
| `apps/web/src/components/discount-input.tsx` | **novo** — seletor %/R$ + valor |
| `apps/web/src/components/money-input.tsx` | **novo** — R$ prefixo (minOrderAmount) |
| `apps/web/src/lib/format/date-input.ts` | **novo** — bordas de dia em SP |
| `apps/web/src/lib/notify.ts` | **novo** — wrapper sonner |
| `.../promotions/_components/promotion-form-fields.tsx` | layout em cards; usa DiscountInput/MoneyInput; remove radio; `min` no picker |
| `.../promotions/_components/promotion-form.tsx` | `w-full`; footer botões à direita; `notify.*`; serverError → toast |
| `.../promotions/_components/promotion-schema.ts` | datas por dia SP; code transform; msg desconto |
| `.../promotions/actions.ts` | `assertFeaturedSlotFree`; normalize de datas |
| `packages/ui/src/components/sonner.tsx` | `closeButton` global |
| `apps/web/**` (vários) | rollout `toast.*` → `notify.*` |
| `docs/integration/admin-ecommerce.md` | nota do guard de desconto |

## Testes

- **Unit (`promotion-schema.test.ts`):** datas por dia SP (hoje válido; ontem
  inválido; mesmo dia início=fim válido; fim<início inválido); code normalizado
  (lower→UPPER, trim); desconto vazio/zero → mensagem.
- **Unit `date-input.test.ts`:** `startOfDaySaoPaulo`/`endOfDaySaoPaulo`/
  `saoPauloDayKey` em datas perto da meia-noite UTC (off-by-one).
- **Smoke runtime (`bun dev:web` + browser):** digitar desconto % e R$ sem
  "010"/"10%" preso; trocar tipo sem corromper; criar promo iniciando hoje;
  promo de 1 dia; bloquear segundo destaque vivo; toast de erro 8s com X.

## Decisões registradas

- Layout: opção B (cards). Input: opção B (seletor embutido). Destaque:
  bloquear (sem schema). Datas: permitir hoje + fuso SP. Toast: erro 8s + X,
  sucesso 4s. Opcionais: code normalize ✅, calendário sem dias passados ✅,
  guard R$ só documentar ✅, zerado barrado com mensagem clara ✅.

# Feedback de visibilidade da promoção featured — Design (Issue #249)

> Branch: `feat/249-promo-featured-feedback`
> Issue: othavioquiliao/emach-dashboard#249
> Ref storefront: PR othavi0/emach-ecommerce#167

## Contexto

O storefront (`emach-ecommerce`) renderiza a seção de promoção em destaque na home
com regras adaptativas: 2 produtos → cards horizontais, 3 → trio, 4 → grid, `< 2`
→ **a seção não renderiza**. Várias condições fazem a promoção **não aparecer na
home sem nenhum aviso no dashboard** — onde o staff cria/edita a promoção.

Esta entrega adiciona **feedback e validação no dashboard** para tornar visível por
que uma promoção destacada (não-)aparece na home. **Não há mudança de schema** nem
de storefront.

## Princípio central

A "visibilidade na home" é regida por regras que vivem no **storefront** (repo
separado, banco compartilhado): mínimo de 2 e teto de 4 produtos. Esses números
**não** estão em `getFeaturedPromotion` (a query dashboard-owned) — estão na camada
de render do storefront. O dashboard precisa conhecer esse contrato para dar
feedback fiel; resolvemos com **um único módulo fonte-da-verdade** no dashboard,
documentado como contrato cross-repo de sincronia manual.

## Escopo

Dos 4 pontos do issue:

| # | Limitação | Tratamento |
|---|---|---|
| 1 | `featured` é gate silencioso | Copy + indicador de visibilidade ao vivo (form) e badge real (listagem) |
| 2 | Mínimo de 2 produtos | **Bloqueio** no zod quando featured + ferramentas específicas + `< 2` |
| 3 | Teto de 4 produtos | Info **não-bloqueante** quando featured + `> 4` |
| 4 | Apenas 1 featured por vez | **Fora de escopo** — já enforçado (índice único parcial + `assertFeaturedSlotFree`) |

## Componentes

### 1. Módulo compartilhado — `promotions/_lib/featured-home.ts` (novo)

Fonte-da-verdade dos números do contrato e da lógica de visibilidade:

```ts
// Contrato de renderização do storefront (emach-ecommerce).
// Ver docs/integration/admin-ecommerce.md. Sincronia manual entre repos.
export const HOME_MIN_PRODUCTS = 2;
export const HOME_MAX_PRODUCTS = 4;

export type HomeVisibility =
  | { visible: true }
  | {
      visible: false;
      reason: "not_featured" | "inactive" | "expired" | "scheduled" | "too_few_products";
    };

// Pura, testável. Reusa computeStatus existente.
export function computeHomeVisibility(input: {
  featured: boolean;
  appliesToAll: boolean;
  toolCount: number;
  status: PromotionStatus; // de computeStatus
}): HomeVisibility;
```

Lógica:
- `!featured` → `{ visible: false, reason: "not_featured" }`
- status `inactive` → `reason: "inactive"`; `expired` → `"expired"`; `scheduled`
  → `"scheduled"` (agendada: ainda não aparece, mas não é erro)
- `!appliesToAll && toolCount < HOME_MIN_PRODUCTS` → `reason: "too_few_products"`
- senão → `{ visible: true }`

Teste unitário: `_lib/__tests__/featured-home.test.ts` cobrindo cada `reason` e o
caminho `visible: true` (incluindo `appliesToAll` com `toolCount` baixo → visível).

### 2. Form — `promotion-form-fields.tsx` + `promotion-schema.ts`

**#1 — clareza do featured (copy + indicador ao vivo).** A seção do switch
"Destaque no home" (`promotion-form-fields.tsx:517-536`) já explica o "só 1 por
vez". Acrescentar:
- À copy: o requisito de produtos — "Precisa de ao menos 2 produtos vinculados
  para aparecer."
- Um indicador ao vivo quando `values.featured === true`: estado calculado por
  `computeHomeVisibility` a partir do estado atual do form (status derivado de
  `active`/datas + `appliesToAll`/`toolIds.length`). Ex.: "Aparecerá na home" vs
  "Não aparecerá na home: faltam produtos / promoção inativa / fora da vigência".

**#2 — bloqueio `< 2` produtos (zod).** No `superRefine` de `promotionSchema`
(`promotion-schema.ts:93-125`), após a regra existente de `toolIds.length < 1`:

```
se data.featured && data.type === "promotion" && !data.appliesToAll
   && data.toolIds.length < HOME_MIN_PRODUCTS
  → ctx.addIssue({ code: "custom", path: ["toolIds"],
      message: "Promoção destacada precisa de ao menos 2 produtos para aparecer na home" })
```

- Não bloqueia quando `appliesToAll` (catálogo inteiro ≥ 2).
- A regra atual de `< 1` permanece (mensagem genérica quando não-featured).
- O erro aparece no Card "Ferramentas" via o `<FieldError>{errors.toolIds}>`
  já existente (`promotion-form-fields.tsx:582`).
- Vale para `promotionSchema` (compartilhado por create e edit, pois
  `createPromotionSchema` estende `promotionSchema`).

**#3 — info teto de 4 (não-bloqueante).** Quando
`values.featured && !values.appliesToAll && values.toolIds.length > HOME_MAX_PRODUCTS`,
mostrar aviso no Card "Ferramentas" usando o padrão `bg-muted + AlertCircle` já em
uso no mesmo arquivo (aviso de conflito, linhas 583-596):

> "A home exibe os 4 produtos mais recentes; os demais aparecem só em 'Ver todas
> as ofertas'."

### 3. Listagem — `promotion-card.tsx`

O card já carrega `promotion.tools` (`promotion-card.tsx:72`) e o `status`, então a
visibilidade é calculável sem query extra.

Substituir o badge estático "Destaque no home" (linhas 48-53):
- `computeHomeVisibility(...) → visible: true`: badge atual (Star, `text-primary`),
  rótulo "Visível na home".
- `visible: false` **com** `featured === true`: badge `text-warning` + ícone de
  alerta, com motivo curto derivado de `reason`:
  - `too_few_products` → "Destaque sem efeito: faltam produtos"
  - `inactive` → "Destaque sem efeito: inativa"
  - `expired` → "Destaque sem efeito: expirada"
  - `scheduled` → "Destaque agendado" (tom neutro/info, não warning — é esperado)
- `!featured`: nenhum badge (igual hoje).

### 4. Contrato cross-repo — `docs/integration/admin-ecommerce.md`

Registrar que `HOME_MIN_PRODUCTS = 2` e `HOME_MAX_PRODUCTS = 4` (em
`promotions/_lib/featured-home.ts`) espelham as regras de render da seção de
promoção em destaque do storefront e **devem mudar juntos** entre os repos.

## Fora de escopo (não fazer)

- **#4** (múltiplas featured): já enforçado por índice único parcial
  (`promotions.ts:61`) + `assertFeaturedSlotFree` (bloqueia com mensagem de
  conflito). Sem código.
- Mudança de schema DB — nenhuma necessária.
- Tocar no storefront (repo separado).
- Validação no detalhe/`overview-tab` — fica no form + card de listagem.

## Tratamento de erros

- O bloqueio do #2 segue o padrão de erro de form do projeto (`useFormErrors` +
  `<FieldError>` + foco no primeiro erro). Sem caixa de erro no topo.
- Avisos não-bloqueantes (#1 indicador, #3 teto) são puramente visuais, sem
  impacto no submit.

## Verificação

- `bun verify` (check-types + check/ultracite + test) — inclui o novo teste de
  `featured-home.ts`.
- Smoke visual (`bun dev:web`):
  - `/dashboard/promotions/new`: ligar featured com 0/1/2/5 produtos específicos e
    com "Todas as ferramentas"; conferir bloqueio (<2), info (>4) e indicador ao
    vivo.
  - `/dashboard/promotions` (listagem): card de promoção featured visível vs.
    featured-sem-efeito.

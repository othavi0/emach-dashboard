# Promoções & Cupons — Modelo + Gestão no Dashboard

> **Sub-projeto 1 de 2.** Este spec cobre o redesenho do modelo de dados de promoção/cupom e
> a UI de gestão no dashboard (`emach-dashboard`). O **Sub-projeto 2** — aplicação do cupom no
> checkout (`emach-ecommerce`) — é planejado e implementado depois, consumindo o contrato
> publicado aqui.
>
> Data: 2026-06-05

## 1. Contexto e problema

Promoção e cupom compartilham **uma única tabela** `promotion` (não há tabela `coupon`
separada). O campo `type` distingue: `'promotion'` (automática, desconto direto no preço) e
`'promocode'` (cupom, código digitado no checkout). Ligação com produtos via N:N
`promotion_tool`.

Estado atual e dores:

1. **Cupom é write-only.** O checkout do `emach-ecommerce` **não** valida nem aplica nenhum
   código (confirmado: zero referências a promocode/coupon/discount em `apps/web/src`). Você
   cadastra cupons no dashboard, mas eles não têm efeito no site. (Resolvido no Sub-projeto 2.)
2. **Gaveta de edição quebrada.** `PromotionEditSheet` usa Base UI `Popover`/`Command`/
   `DatePicker` dentro de um `Sheet` modal — combinação propensa a focus-trap/portal quebrado.
3. **Overview com excesso de espaço em branco.** Cada frase (Descrição, Execução, Código,
   Histórico) é um card grande `border + p-5` empilhado — caixas quase vazias.
4. **Modelo limitado.** Só desconto percentual; sempre exige ≥1 ferramenta específica (não
   existe "todas"); sem limite de uso nem valor mínimo de pedido. (Vigência "para sempre" já
   funciona — `starts_at`/`ends_at` são nullable.)

## 2. Escopo

**Dentro (Sub-projeto 1):**

- Redesenho do schema `promotion` (`packages/db`).
- Lógica de desconto no storefront (`packages/db/src/queries/catalog.ts`) — só `type='promotion'`.
- Repensar anti-empilhamento.
- UI do dashboard: aposentar a gaveta → página de edição; redesenhar overview e criação.
- Publicar o contrato de aplicação de cupom em `docs/integration/admin-ecommerce.md`.

**Fora (Sub-projeto 2):** campo de cupom no carrinho/checkout, validação, cálculo no total,
incremento de `redemption_count`, enforcement de mínimo/limite. Tudo no `emach-ecommerce`.

## 3. Decisões tomadas

| Tema | Decisão |
| --- | --- |
| Tipo de desconto | Percentual **e** valor fixo (R$) — para ambos os tipos |
| Escopo | **Todas** ou **específicas** — para ambos os tipos (promoção e cupom) |
| Precedência | Quando 2+ promoções ativas atingem um produto, o site aplica o **maior desconto efetivo** (nunca soma) |
| Anti-empilhamento | Trava de bloqueio **removida**; coexistência permitida, resolvida na exibição. Criação mostra aviso **não-bloqueante** |
| Limite de resgates + valor mínimo | **Só cupom** (promoção automática não tem resgate nem "pedido") |
| Vigência "para sempre" | Já suportado (datas nullable); UI deixa explícito com hints |
| Edição | **Página dedicada** reusando o form de criação — gaveta aposentada |
| Overview | KPIs + painel Resumo + Histórico lateral |

## 4. Modelo de dados — `packages/db/src/schema/promotions.ts`

Colunas novas/alteradas em `promotion`:

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `discount_type` | `text` NOT NULL default `'percent'` | CHECK `IN ('percent','fixed')` |
| `discount_value` | `numeric(12,2)` NOT NULL | substitui `discount_pct`. Em `percent`: 0 < v ≤ 100. Em `fixed`: v > 0 (em R$) |
| `applies_to_all` | `boolean` NOT NULL default `false` | `true` = vale para todas as ferramentas; `promotion_tool` fica vazio |
| `max_redemptions` | `integer` nullable | só `promocode`; `null` = ilimitado |
| `redemption_count` | `integer` NOT NULL default `0` | incrementado pelo ecommerce (Sub-projeto 2) |
| `min_order_amount` | `numeric(12,2)` nullable | só `promocode`; `null` = sem mínimo |

Checks:

- `discount_coherent`: `(discount_type='percent' AND discount_value > 0 AND discount_value <= 100)
  OR (discount_type='fixed' AND discount_value > 0)`.
- `promo_no_coupon_fields`: `type='promotion'` ⟹ `max_redemptions IS NULL AND min_order_amount
  IS NULL` (defesa-em-profundidade; UI já esconde).
- `redemption_count >= 0`; quando `max_redemptions` não-nulo, `redemption_count <= max_redemptions`
  **não** vira CHECK (corrida com ecommerce) — enforcement no checkout.
- Mantém `ends_after_starts`.

Regra cross-table (validada na app, não em CHECK): `applies_to_all=false` ⟹ exige ≥1
`promotion_tool`; `applies_to_all=true` ⟹ `promotion_tool` vazio.

**Migração de dados (dev):** schema é push-only (ADR-0006). Renomear `discount_pct` →
`discount_value` e adicionar `discount_type='percent'` aos registros existentes. Em dev,
rename ambíguo sem TTY → caminho previsível é drop & recreate + `bun db:seed-demo`
(ver `packages/db/CLAUDE.md`). Índice parcial `promotion_active_ends_idx` preservado.

## 5. Storefront — `catalog.ts` (apenas `type='promotion'`)

A LATERAL que hoje faz `INNER JOIN promotion_tool ... ORDER BY discount_pct DESC` passa a:

- **Elegibilidade:** promoção ativa e vigente, `type='promotion'`, e
  (`applies_to_all=true` **OU** existe `promotion_tool` para o produto).
- **Preço final por promoção:**
  `percent` → `ROUND(price * (1 - discount_value/100), 2)`;
  `fixed` → `GREATEST(price - discount_value, 0)`.
- **Escolha:** `ORDER BY final_price ASC LIMIT 1` (maior desconto efetivo).
- `discounted_amount` passa a ser esse `final_price`.

Aplicar nas **três** queries que tocam `promotion` em `catalog.ts` (listagem com preço, count,
e a query de promoções por tool). Cupom (`promocode`) **não** entra no catálogo.

`db.execute` snake→camel e timestamp-string: seguir gotchas de `packages/db/CLAUDE.md`
(alias `AS "camelCase"`, sem `SELECT *`).

## 6. Anti-empilhamento

`assertNoStackingConflict` em `promotions/actions.ts` deixa de **bloquear**. Vira um helper
informativo: dada a seleção de ferramentas, conta quantas já têm promoção ativa e devolve a
contagem para a UI exibir o aviso não-bloqueante. `createPromotion`/`updatePromotion`/
`togglePromotionActive` param de lançar `CONFLICT` por sobreposição.

## 7. UI Dashboard

### 7.1 Edição → página dedicada

- Aposentar `PromotionEditSheet` e o uso de `EntityEditSheet` aqui; remover o param `?edit=1`
  da página de detalhe.
- Extrair um `PromotionForm` compartilhado (client) consumido por `new/page.tsx` e por uma
  nova rota `dashboard/promotions/[id]/edit/page.tsx`. Header de detalhe: "Editar" vira
  `<Link>` para `…/[id]/edit` (não abre drawer).
- Form em 3 blocos: **Tipo** (TypeSelector) → **Identidade & desconto** → **Alcance & regras**
  (layout `lg:grid-cols-2`, agora com largura de página).

### 7.2 Campos e condicionais do form

- **Sempre:** tipo; título; descrição; tipo de desconto (`%`/`R$`) + valor; escopo
  (radio Todas/Específicas); vigência início/fim (hints "vazio = imediato / sem prazo"); ativa.
- **Ferramentas:** combobox só quando escopo = Específicas (e aí exige ≥1). Em Todas, some.
- **Só cupom (`promocode`):** código; limite de resgates; valor mínimo de pedido.
- Aviso não-bloqueante ao selecionar ferramentas com promoção ativa: "N destas já têm
  promoção — o site aplica o maior desconto."

### 7.3 Overview redesenhado — `[id]/_components/overview-tab.tsx`

- **KPIs** (`EntityKpisRow`): Desconto (`R$ 50` ou `10%`), Alcance (`Todas` ou `N ferramentas`,
  `warning` quando específicas e N=0), Vigência, Resgates (`usados / limite` ou `usados`).
- **Painel Resumo** (substitui os cards Execução/Descrição/Código): linha de status
  (🟢 Ativa · aparece no site), regras inline (mín. de pedido, limite), código com copiar
  (cupom), descrição inline.
- **Histórico**: painel lateral compacto.

## 8. Validação — `promotion-schema.ts`

Discriminated union em `type`, com refinamentos:

- `discount_type`/`discount_value` coerentes (percent 0–100; fixed > 0).
- `applies_to_all` boolean; quando `false`, `toolIds.min(1)`; quando `true`, `toolIds` ignorado/vazio.
- `promocode`: `code` obrigatório (ASCII imprimível, ≤50); `max_redemptions` (int ≥1, opcional);
  `min_order_amount` (≥0, opcional).
- `promotion`: `code` ausente; `max_redemptions`/`min_order_amount` ausentes.
- Mantém: `endsAt > startsAt`; `createPromotionSchema` mantém guard de `startsAt` no passado.

## 9. Server actions — `promotions/actions.ts`

- `create`/`update`: persistir campos novos; aplicar regra `applies_to_all` ⟺ `promotion_tool`;
  remover bloqueio de stacking; coerção de `discount_value`/numéricos.
- `getPromotion`/`fetchPromotionsPage`/listagem: retornar `discountType`, `discountValue`,
  `appliesToAll`, `maxRedemptions`, `redemptionCount`, `minOrderAmount`.
- `duplicatePromotion`: copiar campos novos; `redemption_count` reseta a 0.
- Cards de listagem (`promotion-card.tsx`) e filtros: refletir `R$`/`%` e Alcance.

## 10. Contrato de integração (handoff p/ Sub-projeto 2)

Adicionar seção em `docs/integration/admin-ecommerce.md` especificando como o ecommerce aplica
um cupom no checkout:

1. **Resolver** `promotion` por `code` (case? definir no Sub-projeto 2), `type='promocode'`,
   `active=true`, dentro da vigência.
2. **Escopo:** `applies_to_all=true` ⟹ vale para o carrinho todo; senão só itens cujo
   `tool` ∈ `promotion_tool`. (Como o desconto incide em cupom específico — carrinho todo vs só
   itens elegíveis — é **decisão do Sub-projeto 2**.)
3. **Mínimo:** rejeitar se subtotal elegível < `min_order_amount`.
4. **Limite:** rejeitar se `redemption_count >= max_redemptions`.
5. **Cálculo:** `percent` → % sobre base elegível; `fixed` → abate `discount_value` (clamp ≥0).
6. **Confirmação do pedido:** incrementar `redemption_count` de forma idempotente
   (`FOR UPDATE` + re-check, padrão do débito de estoque) e persistir o cupom aplicado no
   pedido (campo a definir no Sub-projeto 2). Auditoria: `actorType='system'`.

Schema compartilhado propaga via CI (ADR-0009) — coordenar deploy ao mexer nessas tabelas.

## 11. Fora de escopo / decisões adiadas

- Toda a camada de checkout (Sub-projeto 2).
- Como `discount_value` fixo interage com cupom de escopo específico no carrinho — Sub-projeto 2.
- Limite de resgate **por cliente** (só limite total agora).
- Baseline de migrations versionadas (só quando produção entrar no horizonte — ADR-0006).

## 12. Verificação

- `bun check-types` + `bun check` (ultracite).
- `bun db:sync` em dev e smoke das rotas afetadas (`bun dev:web`): listagem, detalhe (overview),
  criar, editar — com cupom e com promoção, escopo Todas e Específicas, desconto `%` e `R$`.
- Smoke **com dado real** no storefront (catálogo): confirmar que o preço com desconto reflete o
  maior desconto efetivo entre global e específica, e fixed vs percent (gotcha do `db.execute`).
- `check-types` não pega SQL inválido em template nem RSC/client boundary — smoke visual obrigatório.

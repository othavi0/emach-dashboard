# Promoções & Cupons — Modelo + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o modelo de dados de promoção/cupom (desconto %/R$, escopo todas/específicas, limite de resgates, valor mínimo) e a UI de gestão no dashboard (gaveta → página, overview redensificado), deixando o storefront aplicar o maior desconto efetivo.

**Architecture:** Tabela única `promotion` (`type` = `promotion`|`promocode`) ganha colunas novas + checks. `catalog.ts` calcula preço final por promoção e escolhe o maior desconto, considerando promoção global (`applies_to_all`) e específica. UI: form único compartilhado entre criar/editar (página dedicada), aposentando a gaveta; overview consolidado em KPIs + Resumo + Histórico.

**Tech Stack:** Drizzle 0.45 (push-only, ADR-0006) + Postgres; Next 16 / React 19; Zod 4; Base UI; Vitest; ultracite (Biome).

**Spec:** `docs/superpowers/specs/2026-06-05-promocoes-cupons-modelo-dashboard-design.md`

**Pré-requisito de cada subagent implementer:** ler cada arquivo antes de editar (não herda state do parent); rodar `bun check-types` **e** `bun check` antes de commitar.

---

### Task 1: Schema `promotion` — colunas + checks

**Files:**
- Modify: `packages/db/src/schema/promotions.ts`

- [ ] **Step 1: Reescrever a definição da tabela `promotion`**

Adicionar `integer` ao import de `drizzle-orm/pg-core`. Substituir a coluna `discountPct` e os
campos/checks conforme abaixo (manter `id`, `title`, `description`, `type`, `code`, `active`,
`startsAt`, `endsAt`, auditoria e timestamps; manter `promotion_created_idx` e
`promotion_active_ends_idx`):

```ts
// colunas (dentro de pgTable("promotion", { ... }))
discountType: text("discount_type").notNull().default("percent"),
discountValue: numeric("discount_value", { precision: 12, scale: 2 }).notNull(),
appliesToAll: boolean("applies_to_all").notNull().default(false),
maxRedemptions: integer("max_redemptions"),
redemptionCount: integer("redemption_count").notNull().default(0),
minOrderAmount: numeric("min_order_amount", { precision: 12, scale: 2 }),
```

```ts
// checks (no array de constraints) — remover o antigo "discount_pct_range"
check("valid_promotion_type", sql`${table.type} IN ('promotion', 'promocode')`),
check("valid_discount_type", sql`${table.discountType} IN ('percent', 'fixed')`),
check(
  "discount_coherent",
  sql`(${table.discountType} = 'percent' AND ${table.discountValue} > 0 AND ${table.discountValue} <= 100)
   OR (${table.discountType} = 'fixed' AND ${table.discountValue} > 0)`
),
check(
  "promo_no_coupon_fields",
  sql`${table.type} = 'promocode' OR (${table.maxRedemptions} IS NULL AND ${table.minOrderAmount} IS NULL)`
),
check("redemption_count_non_negative", sql`${table.redemptionCount} >= 0`),
check(
  "ends_after_starts",
  sql`${table.endsAt} IS NULL OR ${table.startsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`
),
```

Os tipos exportados (`Promotion`, `NewPromotion`) são inferidos — atualizam sozinhos.

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS (consumidores de `discountPct` vão falhar aqui — anotar os arquivos; serão
corrigidos nas tasks 2–7. Se falhar **apenas** por `discountPct` ausente, prosseguir.)

- [ ] **Step 3: Aplicar no banco de dev (drop & recreate)**

Schema é push-only e o rename `discount_pct`→`discount_value` é ambíguo sem TTY. Em dev, recriar:

Run:
```bash
bun db:sync || (psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;' && bunx drizzle-kit push && bun db:apply-triggers && bun db:seed-demo)
```
Expected: schema aplicado; `\d promotion` mostra as colunas novas.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/promotions.ts
git commit -m "feat(db): redesenha schema promotion (desconto %/R\$, escopo, limites)"
```

---

### Task 2: `catalog.ts` — maior desconto efetivo (% e R$, global + específica)

**Files:**
- Modify: `packages/db/src/queries/catalog.ts`

- [ ] **Step 1: Substituir o bloco LATERAL de promoção nas 3 ocorrências**

Há 3 subqueries `LATERAL (...) active_promo` que hoje fazem `INNER JOIN promotion_tool ...
ORDER BY p.discount_pct DESC`. Substituir o corpo de **cada uma** por (ajustando só as colunas
selecionadas de cada ocorrência — list seleciona `id, final_price`; count seleciona `id`):

```sql
LEFT JOIN LATERAL (
  SELECT p.id,
    CASE
      WHEN p.discount_type = 'fixed'
        THEN GREATEST(dv.price_amount - p.discount_value, 0)
      ELSE ROUND(dv.price_amount * (1 - p.discount_value / 100), 2)
    END AS final_price
  FROM promotion p
  WHERE p.type = 'promotion'
    AND p.active = true
    AND (p.starts_at IS NULL OR p.starts_at <= now())
    AND (p.ends_at IS NULL OR p.ends_at > now())
    AND (
      p.applies_to_all = true
      OR EXISTS (SELECT 1 FROM promotion_tool pt WHERE pt.promotion_id = p.id AND pt.tool_id = t.id)
    )
  ORDER BY final_price ASC
  LIMIT 1
) active_promo ON true
```

No `SELECT` da listagem, `discounted_amount` passa a ser `active_promo.final_price::text`
(remover o `CASE ... discount_pct ...` antigo). `active_promotion_id` continua
`active_promo.id`. Conferir alias `AS "camelCase"` onde a coluna é mapeada para tipo Drizzle
(gotcha snake→camel de `packages/db/CLAUDE.md`).

- [ ] **Step 2: Ajustar tipos/uso de `Promotion` em catalog.ts**

Onde `catalog.ts` referencia `discount_pct`/`discountPct` (import de `Promotion` na linha ~9 e
qualquer `SELECT discount_pct`), trocar por `discount_value`/`discount_type`. Não usar
`SELECT *`.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS para `packages/db` (web ainda pode falhar — tasks seguintes).

- [ ] **Step 4: Smoke com dado real no storefront**

Run: `bun dev:web` (ou subir o ecommerce). Criar via SQL/seed: uma promoção global `percent`
10% e uma específica `fixed` R$ 50 numa ferramenta cara; confirmar que o card mostra o **menor
preço** entre as duas. `db.execute` devolve timestamp/numeric como string — validar que o valor
aparece, não só que renderiza.
Expected: preço com desconto = maior desconto efetivo.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/queries/catalog.ts
git commit -m "feat(db): catalog aplica maior desconto efetivo (% e R\$, global+específica)"
```

---

### Task 3: Zod schema — `promotion-schema.ts` (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts`
- Create: `apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`

- [ ] **Step 1: Escrever testes que falham**

```ts
import { describe, expect, it } from "vitest";
import { promotionSchema } from "../promotion-schema";

const base = {
  title: "Promo", description: null, discountType: "percent", discountValue: 10,
  appliesToAll: false, active: true, startsAt: null, endsAt: null, toolIds: ["t1"],
};

describe("promotionSchema", () => {
  it("aceita promoção percent específica com 1 ferramenta", () => {
    expect(promotionSchema.safeParse({ ...base, type: "promotion", code: null }).success).toBe(true);
  });
  it("rejeita percent com valor > 100", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promotion", code: null, discountValue: 150 });
    expect(r.success).toBe(false);
  });
  it("aceita fixed com valor > 100 (R$)", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promotion", code: null, discountType: "fixed", discountValue: 150 });
    expect(r.success).toBe(true);
  });
  it("exige >=1 ferramenta quando appliesToAll=false", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promotion", code: null, toolIds: [] });
    expect(r.success).toBe(false);
  });
  it("ignora ferramentas quando appliesToAll=true", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promotion", code: null, appliesToAll: true, toolIds: [] });
    expect(r.success).toBe(true);
  });
  it("promocode exige code e aceita maxRedemptions/minOrderAmount", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promocode", code: "BEMVINDO", maxRedemptions: 100, minOrderAmount: 200 });
    expect(r.success).toBe(true);
  });
  it("promotion não aceita maxRedemptions", () => {
    const r = promotionSchema.safeParse({ ...base, type: "promotion", code: null, maxRedemptions: 100 });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && bun run test promotion-schema`
Expected: FAIL (campos novos não existem no schema).

- [ ] **Step 3: Reescrever o schema**

Reescrever `promotionBaseFields` e a union. Pontos-chave:

```ts
const promotionBaseFields = {
  title: z.string().trim().max(120, "Título não pode ultrapassar 120 caracteres")
    .refine((v) => v.length >= 2, "Título deve ter no mínimo 2 caracteres"),
  description: z.string().trim().max(1000).optional().nullable(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().gt(0, "Valor do desconto deve ser maior que zero"),
  appliesToAll: z.boolean(),
  active: z.boolean(),
  startsAt: z.date().optional().nullable(),
  endsAt: z.date().optional().nullable(),
  toolIds: z.array(z.string()),
};

const promotionVariantSchema = z.object({
  type: z.literal("promotion"), code: z.string().nullish(),
  maxRedemptions: z.null().optional(), minOrderAmount: z.null().optional(),
  ...promotionBaseFields,
}).refine((d) => d.code == null, { message: "Promoções automáticas não aceitam código", path: ["code"] });

const promocodeVariantSchema = z.object({
  type: z.literal("promocode"),
  code: z.string().min(1, "Código obrigatório para promocode").max(50)
    .regex(/^[\x20-\x7E]+$/, "Código deve conter apenas caracteres ASCII imprimíveis"),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  minOrderAmount: z.number().min(0).optional().nullable(),
  ...promotionBaseFields,
});

export const promotionSchema = z.discriminatedUnion("type", [promotionVariantSchema, promocodeVariantSchema])
  .superRefine((data, ctx) => {
    if (data.discountType === "percent" && data.discountValue > 100)
      ctx.addIssue({ code: "custom", message: "Percentual não pode passar de 100%", path: ["discountValue"] });
    if (!data.appliesToAll && data.toolIds.length < 1)
      ctx.addIssue({ code: "custom", message: "Selecione ao menos uma ferramenta", path: ["toolIds"] });
    if (data.startsAt != null && data.endsAt != null && data.endsAt <= data.startsAt)
      ctx.addIssue({ code: "custom", message: "Data de fim deve ser posterior à de início", path: ["endsAt"] });
  });

export const createPromotionSchema = promotionSchema.superRefine((data, ctx) => {
  if (data.startsAt != null && data.startsAt < new Date())
    ctx.addIssue({ code: "custom", message: "Data de início não pode ser no passado", path: ["startsAt"] });
});

export type PromotionFormValues = z.infer<typeof promotionSchema>;
export type CreatePromotionFormValues = z.infer<typeof createPromotionSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && bun run test promotion-schema`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts
git commit -m "feat(promotions): schema zod com desconto %/R\$, escopo e limites"
```

---

### Task 4: Server actions — `promotions/actions.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`

- [ ] **Step 1: Atualizar tipos de retorno e queries**

Em `PromotionListItem`/`PromotionDetail` trocar `discountPct: string` por
`discountType: string; discountValue: string` e adicionar `appliesToAll: boolean;
maxRedemptions: number | null; redemptionCount: number; minOrderAmount: string | null`. Nos
`map` de `fetchPromotionsPage` e `getPromotion`, popular esses campos a partir de `row`.

- [ ] **Step 2: Persistir campos novos em create/update**

Em `createPromotion`/`updatePromotion`, no `.values({...})`/`.set({...})`:

```ts
discountType: data.discountType,
discountValue: String(data.discountValue),
appliesToAll: data.appliesToAll,
maxRedemptions: data.type === "promocode" ? (data.maxRedemptions ?? null) : null,
minOrderAmount: data.type === "promocode" && data.minOrderAmount != null ? String(data.minOrderAmount) : null,
```

Regra escopo: inserir em `promotion_tool` **apenas** quando `!data.appliesToAll`. Quando
`appliesToAll`, garantir `promotion_tool` vazio (no update, o `delete` já existente cobre).

- [ ] **Step 3: Remover bloqueio de stacking; adicionar helper de aviso**

Remover as chamadas `assertNoStackingConflict` de create/update/toggle. Substituir a função por
`countToolsWithActivePromotion(toolIds, excludeId?)` que retorna `number` (quantas das ferramentas
têm promoção ativa) e exportá-la para a UI usar no aviso não-bloqueante. `togglePromotionActive`
deixa de checar stacking.

- [ ] **Step 4: Ajustar duplicate e ordenação por desconto**

`duplicatePromotion`: copiar `discountType`, `discountValue`, `appliesToAll`, `minOrderAmount`,
`maxRedemptions`; `redemptionCount` reseta a 0; copiar `promotion_tool` só se `!appliesToAll`.
Em `makePromotionCursor`/`orderBy`, trocar referências a `discountPct` por `discountValue`
(`discountDesc`/`discountAsc` ordenam por `discount_value`).

- [ ] **Step 5: Verificar**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/actions.ts
git commit -m "feat(promotions): actions com campos novos e sem trava de empilhamento"
```

---

### Task 5: Form compartilhado + página de edição (aposenta a gaveta)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx` (hoje é o wrapper da criação → generalizar para `mode: "create" | "edit"`)
- Create: `apps/web/src/app/dashboard/promotions/[id]/edit/page.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/new/page.tsx` (usar o form compartilhado)
- Modify: `apps/web/src/app/dashboard/promotions/[id]/page.tsx` (remover `?edit=1` e a sheet)
- Modify: `apps/web/src/app/dashboard/promotions/[id]/_components/promotion-header-actions.tsx` (Editar → `<Link>` para `…/[id]/edit`)
- Delete: `apps/web/src/app/dashboard/promotions/_components/promotion-edit-sheet.tsx`

- [ ] **Step 1: Generalizar `PromotionForm`**

Generalizar o `promotion-form.tsx` existente (wrapper da criação) para encapsular
`values`/`onPatch`/`handleSubmit` (hoje também duplicados na sheet), recebendo
`mode: "create" | "edit"`, `availableTools`, `initialValues?`, e chamando `createPromotion` ou
`updatePromotion`. Renderiza `<PromotionFormFields>` (Task 6) + `<FormErrorPanel>` + botões.
Em sucesso: toast + `router.push("/dashboard/promotions/" + id)`.

- [ ] **Step 2: Página de edição**

`[id]/edit/page.tsx` (Server Component): `requireCapabilityOrRedirect("promotions.manage")`,
`getPromotion(id)` (→ `notFound()` se nulo) e `getToolOptions()`, renderiza
`EntityIdentityHeader` + `<PromotionForm mode="edit" initialValues={...} availableTools={...} />`.

- [ ] **Step 3: Apontar a criação para o form compartilhado e limpar o detalhe**

`new/page.tsx` usa `<PromotionForm mode="create" />`. Em `[id]/page.tsx`: remover o bloco
`sp.edit === "1"` e o import/uso de `PromotionEditSheet`; em `promotion-header-actions.tsx` o
botão "Editar" vira `<Link href={`/dashboard/promotions/${id}/edit`}>`. Deletar
`promotion-edit-sheet.tsx`.

- [ ] **Step 4: Verificar + smoke visual**

Run: `bun check-types && bun check`
Smoke (`bun dev:web`): detalhe → Editar → abre página `/[id]/edit`, salva, volta ao detalhe.
Confirmar que **não há mais gaveta** e que o popover de ferramentas funciona (não há focus-trap).
Expected: edição funcional em página.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src/app/dashboard/promotions
git commit -m "refactor(promotions): edição em página dedicada, aposenta a gaveta"
```

---

### Task 6: Campos do form — `promotion-form-fields.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`

- [ ] **Step 1: Adicionar tipo de desconto (%/R$) + valor**

Substituir o campo único "Desconto (%)" por um seletor `discountType` (Toggle/RadioGroup
`percent`|`fixed`) + `MaskedInput` para `discountValue`. Em `percent`, máscara de %; em `fixed`,
máscara de R$ (`apps/web/src/lib/masks.ts` — reusar/estender `percentageMask` e adicionar
`currencyMask` se não existir). Label dinâmico ("Desconto (%)" / "Desconto (R$)").

- [ ] **Step 2: Escopo Todas/Específicas + ferramentas condicional**

Acima do `ToolCombobox`, um `RadioGroup` `appliesToAll` (false=Específicas, true=Todas). O
`ToolCombobox` só renderiza quando `!appliesToAll`. Ao escolher Todas, `onPatch({ appliesToAll:
true, toolIds: [] })`.

- [ ] **Step 3: Campos só-cupom (limite + mínimo) e hints de vigência**

Quando `isCoupon`, renderizar `MaskedInput` para `maxRedemptions` (inteiro, placeholder "vazio =
ilimitado") e `minOrderAmount` (R$, "vazio = sem mínimo"). Nos DatePickers, hint "vazio = imediato"
(Início) e "vazio = sem prazo" (Fim).

- [ ] **Step 4: Aviso não-bloqueante de promoção existente**

Quando `toolIds` muda (escopo Específicas), chamar `countToolsWithActivePromotion` (Task 4, server
action) e, se `> 0`, exibir caixa informativa: "N destas já têm promoção — o site aplica o maior
desconto." (não bloqueia submit).

- [ ] **Step 5: Verificar + smoke**

Run: `bun check-types && bun check`
Smoke: alternar tipo (Automática/Cupom) some/mostra código+limite+mínimo; alternar escopo
some/mostra ferramentas; `%`↔`R$` muda label/máscara.
Expected: condicionais corretas.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx apps/web/src/lib/masks.ts
git commit -m "feat(promotions): campos de desconto %/R\$, escopo e limites no form"
```

---

### Task 7: Overview redensificado + listagem/cards

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/[id]/_components/overview-tab.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/_lib/format.ts`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx`
- Test: `apps/web/src/app/dashboard/promotions/_components/_lib/__tests__/format.test.ts`

- [ ] **Step 1: Helper de formatação de desconto (TDD)**

Em `format.ts` substituir/estender `formatDesconto` por `formatDiscount(type, value)`:
`percent` → `"10%"`; `fixed` → `"R$ 50,00"`. Adicionar teste em `format.test.ts`:

```ts
import { formatDiscount } from "../format";
it("formata percent", () => expect(formatDiscount("percent", "10")).toBe("10%"));
it("formata fixed em R$", () => expect(formatDiscount("fixed", "50")).toMatch(/R\$\s?50/));
```

Run: `cd apps/web && bun run test format` → Expected: PASS.

- [ ] **Step 2: Reescrever o overview**

KPIs (`EntityKpisRow`): Desconto (`formatDiscount`), Alcance (`appliesToAll ? "Todas" :
tools.length`, `warning` quando específicas e 0), Vigência (Início→Término), Resgates
(`maxRedemptions ? `${redemptionCount} / ${maxRedemptions}` : redemptionCount` — só cupom; senão
omitir o KPI). Substituir os cards "Descrição"/"Execução"/"Código" por **um** painel Resumo
(status com bolinha + frase de execução; regras inline: mín. pedido, limite; código com
`CopyCodeButton` quando cupom; descrição inline) e Histórico num painel lateral compacto
(`grid sm:grid-cols-[1.4fr_1fr]`).

- [ ] **Step 3: Atualizar card de listagem**

`promotion-card.tsx`: usar `formatDiscount`; mostrar Alcance ("Todas" ou contagem); refletir
`R$`/`%`. Remover qualquer referência a `discountPct`.

- [ ] **Step 4: Verificar + smoke visual**

Run: `bun check-types && bun check && cd apps/web && bun run test`
Smoke: detalhe de um cupom (com código, limite, mínimo) e de uma promoção `fixed` global —
conferir KPIs, Resumo sem caixa vazia, Histórico lateral; listagem mostra R$/% e Alcance.
Expected: layout denso, sem espaço morto.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions
git commit -m "feat(promotions): overview redensificado e cards com R\$/% e alcance"
```

---

### Task 8: Contrato de integração (handoff p/ Sub-projeto 2)

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Documentar a aplicação de cupom no checkout**

Adicionar seção "Aplicação de cupom (promocode)" com o algoritmo do spec §10: resolver por
`code`+`type='promocode'`+ativo+vigente; escopo (`applies_to_all` ou `promotion_tool`); rejeitar
se subtotal elegível `< min_order_amount`; rejeitar se `redemption_count >= max_redemptions`;
cálculo `percent`/`fixed`; na confirmação, incremento idempotente de `redemption_count`
(`FOR UPDATE` + re-check, padrão do débito de estoque) com `actorType='system'`; persistir cupom
aplicado no pedido (campo a definir no Sub-projeto 2). Marcar como decisão aberta: desconto de
cupom específico incide no carrinho todo vs só itens elegíveis.

- [ ] **Step 2: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(integration): contrato de aplicação de cupom no checkout"
```

---

## Notas de verificação final

- `bun check-types` **e** `bun check` (ultracite) limpos.
- `cd apps/web && bun run test` verde.
- Smoke visual obrigatório (RSC/client boundary e SQL em template não são pegos por `tsc`):
  criar/editar/listar/detalhe com cupom e promoção, escopo Todas e Específicas, desconto `%` e `R$`.
- Storefront: maior desconto efetivo confirmado com dado real (gotcha `db.execute` string).
- Schema compartilhado → ao mergear, o CI abre PR de sync no ecommerce (ADR-0009); o Sub-projeto 2
  consome os campos novos.

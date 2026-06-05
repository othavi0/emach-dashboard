# Seção Configurações + aba Frete (#117) — Design

> Data: 2026-06-05 · Issue: #117 · Repo: emach-dashboard (admin)
> Status: aprovado em brainstorming (mockups v1→v4 no Visual Companion)

## Objetivo

Criar a seção **Configurações** no dashboard — uma página de settings da loja com **tabs**, das quais só **Frete** é funcional agora; **Redes sociais** e **Localização** ficam como tabs `Em breve` (desabilitadas), reservando o lugar pro trabalho futuro.

A aba Frete resolve as pendências owned-by-dashboard do #117 (origem da cotação presa no `.env`, política de seguro hardcoded). O campo por-produto de frete pesado (>30kg) entra junto, no editor de ferramenta.

## Decisões tomadas no brainstorming

| Tema | Decisão |
|---|---|
| Rota | Reusar a rota já prevista `/dashboard/site/settings` (item de nav hoje `disabled`). |
| Nav | Mover o item "Configurações" pra um **novo grupo "Sistema"** no rodapé da sidebar (era grupo "Relacionamento"). Remover `disabled: true`. |
| Tabs | `Frete` (ativa, default) · `Redes sociais` e `Localização` **desabilitadas** com badge `Em breve`. Sincronizadas com `?tab=` (padrão de `promotions/page.tsx`). |
| Layout da aba Frete | **Form + trilho de contexto à direita** ("Como o cliente vê" — prévia do efeito na cotação). Grid `minmax(0,2fr) minmax(280px,1fr)`. |
| **Frete grátis** | **Removido do dashboard.** Frete grátis no emach é **só via cupom/promoção**. O `R$ 299` hardcoded no storefront vira **bug a remover** — issue separado no emach-ecommerce. (Item 3 do #117 sai de escopo aqui.) |
| Copy | Descrições explicativas pro **admin leigo** (o quê + por quê), ocupando largura cheia do card. Direto, sem hedging (DESIGN §8). |
| Item >30kg | Campo **por-produto** no editor de ferramenta — `tool.overweightShippingAmount`. Não vive nesta página. |

## Escopo de hoje (3 frentes)

1. **Settings singleton** — tabela `store_settings` + admin UI (aba Frete): origem do despacho + política de seguro.
2. **Campo por-produto** — `tool.overweightShippingAmount` no schema + editor de ferramenta.
3. **Contrato pro storefront** — query helper owned-by-dashboard que o emach-ecommerce consome (sync via CI, ADR-0009).

## Arquitetura

### 1. Schema (push-only, ADR-0006 — `bun db:sync` após editar)

**Nova tabela `store_settings`** (singleton — uma linha só), em `packages/db/src/schema/` (arquivo novo `store-settings.ts`, adicionar ao barrel `index.ts`):

```ts
export const storeSettings = pgTable("store_settings", {
  id: text("id").primaryKey().default("singleton"),         // singleton fixo
  shippingOriginBranchId: text("shipping_origin_branch_id")
    .references(() => branch.id, { onDelete: "set null" }),  // null = sem origem definida
  shippingInsurancePolicy: text("shipping_insurance_policy")
    .$type<"none" | "cart_value">().notNull().default("none"),
  shippingInsuranceCapAmount: numeric("shipping_insurance_cap_amount", { precision: 10, scale: 2 })
    .notNull().default("3000.00"),                            // teto SuperFrete
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  check("store_settings_singleton", sql`${t.id} = 'singleton'`),  // garante 1 linha
  check("insurance_policy_valid", sql`${t.shippingInsurancePolicy} IN ('none','cart_value')`),
]);
```

- Default da política = `none` (espelha o storefront atual: `insurance_value: 0`).
- `shippingOriginBranchId` nullable → fallback no storefront quando não definido.
- Money em `numeric(10,2)` (convenção `packages/db`, não cents).

**Alteração em `tool`** (`packages/db/src/schema/tools.ts`):

```ts
overweightShippingAmount: numeric("overweight_shipping_amount", { precision: 10, scale: 2 }),  // nullable
// check: >= 0 quando presente
```

- `tool.weightKg` já existe (`notNull`, no produto-pai) — é o gatilho da regra >30kg.
- Nullable: se não definido e `weightKg > 30` → storefront mostra "Frete a combinar".

### 2. Query helper (contrato storefront, owned-by-dashboard)

`packages/db/src/queries/store-settings.ts` (dentro da superfície de sync — **não importar de fora de `queries/`/`schema/`**, incidente #88):

```ts
export type ShippingSettings = {
  originBranchId: string | null;
  originCep: string | null;          // join branch.cep
  insurancePolicy: "none" | "cart_value";
  insuranceCapAmount: number;
};
export async function getShippingSettings(db): Promise<ShippingSettings> { ... }
```

Substitui o `getOriginBranchCep()` baseado em `env.DEFAULT_BRANCH_ID` do storefront (a troca de fato no storefront é trabalho do repo emach-ecommerce — fora desta entrega; o contrato é entregue aqui e sincroniza via CI).

### 3. Rota / página (`apps/web/src/app/dashboard/site/settings/`)

- `page.tsx` — Server Component. Lê `store_settings` (cria singleton com defaults se ausente) + lista de filiais com CEP. Renderiza:
  - `<PageHeader title="Configurações" description="Ajustes globais da loja — frete, redes sociais e localização da cotação." />`
  - Tabs de seção (base `<Tabs>`, `?tab=`): `Frete` (default), `Redes sociais`/`Localização` desabilitadas com badge `Em breve`.
  - **Aba Frete**: grid 2 colunas:
    - Esquerda (`stack`): `<ShippingSettingsForm>` (client) — cards "Origem do despacho" + "Seguro do frete".
    - Direita (`rail`): `<ShippingPreviewRail>` (server, derivado dos settings) — "Como o cliente vê", linhas **edge-to-edge** (padrão footer DESIGN §4: `-mx` + `border-b`).
- `_components/shipping-settings-form.tsx` — client. Padrão `BranchForm`: `useTransition`, `safeParse`, `<FormErrorPanel>` no topo, toast com contagem de erros. Campos: select de filial de origem, select de política (`Sem seguro` / `Declarar o valor do carrinho`), input de teto (R$).
- `_components/shipping-preview-rail.tsx` — server. Prévia: origem, seguro declarado, item até/acima de 30kg, frete grátis (= só via cupom).
- `actions.ts` — `"use server"`; `updateShippingSettings(input)` → `ActionResult`. `await requireCapability("settings.manage")` (no-op hoje, ADR-0012, mas obrigatório). Zod `safeParse`. Upsert do singleton. `logUserActivity({ action: "settings.shipping.updated" })`. `revalidatePath` da rota.

### 4. Nav (`apps/web/src/app/dashboard/_components/nav-config.ts`)

- Remover `disabled: true` do item "Configurações".
- Tirar do grupo "Relacionamento", criar `NavGroupConfig { label: "Sistema", items: [Configurações, ...] }` no fim de `NAV_GROUPS`. (Usuários pode migrar pra "Sistema" também — confirmar na implementação; default: mover só Configurações.)

### 5. Campo por-produto no editor de ferramenta

- Tool form vai pra página (DESIGN §4: form complexo = página). Adicionar campo **"Frete para item pesado"** (R$, opcional) na seção de dimensões/logística do form.
- Schema Zod do tool + `createTool`/`updateTool` aceitam `overweightShippingAmount`.
- Hint contextual: só relevante quando `weightKg > 30`; mostrar nota quando o peso ultrapassa o teto SuperFrete.

## Data flow

```
Admin → /dashboard/site/settings (Frete)
  → ShippingSettingsForm → updateShippingSettings() → upsert store_settings → revalidate
Editor de ferramenta → updateTool() → tool.overweightShippingAmount
Storefront (emach-ecommerce, via schema/query sincronizados):
  getShippingSettings() → origem (branch.cep), seguro
  cotação SuperFrete: weightKg > 30 ? overweightShippingAmount ?? "a combinar" : cotação normal
```

## Error handling

- Form: painel de erros no topo (todos os issues do Zod), toast com contagem — nunca toast genérico (apps/web/CLAUDE.md).
- Origem sem CEP: select só lista filiais com `cep` preenchido; vazio → empty state "Cadastre o CEP de uma filial".
- Singleton ausente: `page.tsx` cria com defaults na primeira leitura (lazy bootstrap).

## Testes

- Server action `updateShippingSettings`: validação Zod (política inválida, teto negativo), upsert idempotente.
- Smoke run-time (apps/web/CLAUDE.md): `bun dev:web` + visitar `/dashboard/site/settings` — SQL em template/colunas novas não pega em `tsc`.

## Fora de escopo (follow-ups)

- **emach-ecommerce**: remover `R$ 299` hardcoded de frete grátis; trocar `getOriginBranchCep()` (env) por `getShippingSettings()`; aplicar `insurancePolicy`/cap na cotação. Issue separado, após o schema/query sincronizar via CI.
- Tabs **Redes sociais** e **Localização da cotação** — seções futuras (placeholders `Em breve` hoje).
- Atualizar contrato `docs/integration/admin-ecommerce.md` com a nova tabela/query.

## Verificação visual

Mockup aprovado: `.superpowers/brainstorm/632671-1780670753/content/configuracoes-frete-v4.html`.

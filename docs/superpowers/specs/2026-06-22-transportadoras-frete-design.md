# Transportadoras + Cálculo de Frete (tabelas próprias)

> Design doc — 2026-06-22. Status: aprovado para virar plano de implementação.
> Feature nova: cadastro de transportadoras com tabelas de frete negociadas + catálogo de
> caixas + motor de cotação local (sem SuperFrete no preço), consumido pelo storefront.

## 1. Contexto e problema

O storefront hoje cota frete chamando a **API do SuperFrete** (per-pacote), e o dashboard só
configura origem de despacho + seguro na aba "Frete" de `/dashboard/site/settings`
(`store_settings`, singleton). Não existe nenhuma tabela de transportadora no banco.

Decisão do produto (debate de 2026-06-22): mover para **tabelas próprias negociadas** —
cadastrar as transportadoras e suas tabelas de frete (faixa de peso × região de CEP) e
calcular o frete **localmente**, com controle e precisão totais, sem depender do SuperFrete
no preço.

Dois problemas a resolver juntos:

1. **Precificação por tabela própria.** Cadastrar transportadora → zonas (faixas de CEP) →
   faixas de peso → valor, mais sobretaxas (frete mínimo, GRIS/ad valorem, ICMS/pedágio).
2. **Consolidação de múltiplos itens.** O cliente que compra 4 furadeiras **não** pode pagar
   4× o frete de uma caixa. Antes de cotar, os itens precisam ser consolidados em caixas
   reais (de um catálogo da loja), e o peso cobrado por caixa é `max(peso real, peso cubado)`.

### Estado real do código/banco (levantado em 2026-06-22)

- `tool` (`packages/db/src/schema/tools.ts`): já tem `weightKg` (numeric 10,3, **NOT NULL**),
  `lengthCm`/`widthCm`/`heightCm` (numeric 10,2, **NOT NULL**) — **100% preenchidos nos 23
  produtos**. As dimensões são tratadas como **já embaladas** (ex.: Lixadeira ELP 710 =
  120×30×30 cm é a caixa, não o motor nu). `overweightShippingAmount` (numeric 10,2, nullable)
  existe; está **nulo em todos os 23 produtos**.
- Itens compridos: lixadeiras telescópicas têm `lengthCm` 160–180 cm.
- `store_settings` (`packages/db/src/schema/store-settings.ts`): singleton com
  `shippingOriginBranchId` (FK branch), `shippingInsurancePolicy` (`none`/`cart_value`),
  `shippingInsuranceCapAmount`. Lido pelo storefront via `getShippingSettings(db)`
  (`queries/store-settings.ts`).
- `branch.cep_ranges` (jsonb `Array<{from,to,label?}>`) já modela faixas de CEP por filial;
  helper `matchBranchByCep`/`getBranchByCep` em `queries/branch-cep.ts`.
- Capabilities (`apps/web/src/lib/capabilities.ts`): registry declarativo; `site.update_settings`
  é só `super_admin` (`S`). `RESOURCE_SECTION` mapeia `resource → NavSection` e tem teste de
  exaustividade.
- ADRs relevantes: **0004** (admin↔ecommerce só por DB), **0006** (schema push-only),
  **0009** (sync de schema/queries dashboard→ecommerce via CI), **0016** (gates 3 níveis).

## 2. Objetivos e não-objetivos

**Objetivos**
- Modelar e cadastrar transportadoras + tabelas de frete (CEP × peso) + sobretaxas.
- Catálogo de caixas da loja para consolidação.
- Motor de cotação local (empacotamento FFD → peso cobrado → lookup de tabela → sobretaxas →
  ICMS por dentro), consumido pelo storefront e usado no preview do admin.
- Rota dedicada `/dashboard/shipping` consolidando Transportadoras + Caixas + Configurações.
- Fix do "a combinar" para itens/destinos sem cobertura de tabela.

**Não-objetivos (fora desta entrega)**
- Emissão de etiqueta e rastreamento (continua/fica com gateway separado, fora de escopo).
- Import de tabela via CSV/planilha (fase 2 — entrada manual primeiro).
- Flag `fragile` no produto (fase 2).
- Fallback automático para SuperFrete (decidido: sem cobertura → "a combinar"; pode virar
  toggle opcional no futuro).
- Wiring da cotação no checkout do **repo ecommerce** — vira handoff por issue (ver §8).

## 3. Decisões de design (cravadas no debate)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Fonte do preço | Tabelas próprias negociadas (sem SuperFrete no preço) |
| 2 | Eixo de destino | Faixas de CEP / regiões comerciais (reusa conceito de `cep_ranges`) |
| 3 | Eixo de peso | Faixas de peso `(de, até, base, R$/kg)` — superset de discreto/linear/excedente |
| 4 | Sobretaxas | Frete mínimo + GRIS/Ad valorem (% NF) + ICMS/pedágio destacados — todas opcionais por transportadora |
| 5 | Sem cobertura | "Frete a combinar" (fail-safe; reusa semântica existente) |
| 6 | Empacotamento | FFD com catálogo de caixas (±12%, checa dimensão por eixo + peso) |
| 7 | Peso | `weightKg` = produto; novo `packagingWeightKg` = embalagem; despacho = soma |
| 8 | Navegação | Rota dedicada `/dashboard/shipping` consolidando tudo |
| 9 | Local do motor | `packages/db/src/queries/` (superfície sincronizada via CI — propaga ao ecommerce) |

## 4. Modelo de dados (schema)

Novo arquivo `packages/db/src/schema/shipping.ts`; exportar no barrel
`packages/db/src/schema/index.ts`. Convenções da casa: `text("id").primaryKey()` (UUID no
caller), `numeric` para dinheiro/medida (nunca `real`), `timestamptz`, FK com `onDelete`
explícito, CHECKs de domínio.

### 4.1 `carrier` (transportadora)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `crypto.randomUUID()` no caller |
| `name` | text NOT NULL | nome da transportadora |
| `cnpj` | text NULL | normalizado (só dígitos); `uniqueIndex ... WHERE cnpj IS NOT NULL` (padrão `supplier`) |
| `active` | boolean NOT NULL default true | desabilita sem deletar |
| `cubage_divisor` | integer NOT NULL default 6000 | divisor de peso cubado (Correios/aéreo 6000; rodoviário pode variar) |
| `gris_percent` | numeric(5,2) NULL | % sobre valor da NF |
| `gris_min_amount` | numeric(10,2) NULL | piso do GRIS |
| `advalorem_percent` | numeric(5,2) NULL | % sobre valor declarado |
| `toll_amount` | numeric(10,2) NULL | pedágio fixo por remessa |
| `icms_percent` | numeric(5,2) NULL | só se destacado; aplicado "por dentro" |
| `notes` | text NULL | |
| `created_at`/`updated_at` | timestamptz NOT NULL | `defaultNow()` + `$onUpdate` |

CHECKs: percentuais em `[0,100]`; valores monetários `>= 0`; `cubage_divisor > 0`.

### 4.2 `carrier_zone` (região comercial da tabela)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | |
| `carrier_id` | text NOT NULL FK → carrier `onDelete: cascade` | index |
| `name` | text NOT NULL | ex.: "Grande SP", "Interior SP" |
| `cep_ranges` | jsonb NOT NULL default `[]` | `$type<Array<{from:string;to:string;label?:string}>>` (mesmo shape de `branch.cep_ranges`) |
| `delivery_days` | integer NULL | prazo da zona |
| `min_freight_amount` | numeric(10,2) NULL | frete mínimo da zona |
| `sort_order` | integer NOT NULL default 0 | |
| `created_at`/`updated_at` | timestamptz NOT NULL | |

CHECKs: `delivery_days IS NULL OR >= 0`; `min_freight_amount IS NULL OR >= 0`.

### 4.3 `carrier_rate` (linha da faixa de peso)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | |
| `carrier_id` | text NOT NULL FK → carrier `onDelete: cascade` | denormalizado p/ query direta |
| `zone_id` | text NOT NULL FK → carrier_zone `onDelete: cascade` | index |
| `weight_from_kg` | numeric(10,3) NOT NULL | início da faixa (inclusivo) |
| `weight_to_kg` | numeric(10,3) NULL | fim da faixa (exclusivo); **NULL = ∞** (faixa topo) |
| `base_amount` | numeric(10,2) NOT NULL | valor base da faixa |
| `per_kg_amount` | numeric(10,2) NOT NULL default 0 | R$/kg sobre `peso − weight_from` (cobre linear e excedente) |
| `created_at`/`updated_at` | timestamptz NOT NULL | |

CHECKs: `weight_from_kg >= 0`; `weight_to_kg IS NULL OR weight_to_kg > weight_from_kg`;
`base_amount >= 0`; `per_kg_amount >= 0`. `uniqueIndex(zone_id, weight_from_kg)` evita faixas
duplicadas. **Representação dos 3 formatos com um único modelo:** faixa discreta =
`per_kg_amount` 0 + `base_amount` = valor da célula; linear = uma faixa `0→∞`, `base_amount` 0,
`per_kg_amount` = R$/kg; excedente = faixa topo (`weight_to_kg` NULL) com `per_kg_amount` > 0.

### 4.4 `shipping_box` (catálogo de caixas)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | text PK | |
| `name` | text NOT NULL | ex.: "Caixa M" |
| `internal_length_cm` | numeric(10,2) NOT NULL | **dimensões internas** (não externas) |
| `internal_width_cm` | numeric(10,2) NOT NULL | |
| `internal_height_cm` | numeric(10,2) NOT NULL | |
| `max_weight_kg` | numeric(10,3) NOT NULL | capacidade de carga |
| `tare_weight_kg` | numeric(10,3) NOT NULL default 0 | peso da caixa vazia (entra no frete) |
| `active` | boolean NOT NULL default true | |
| `sort_order` | integer NOT NULL default 0 | |
| `created_at`/`updated_at` | timestamptz NOT NULL | |

CHECKs: dimensões e pesos `>= 0`. Catálogo **global** (não por transportadora).

### 4.5 Alterações em `tool` (`packages/db/src/schema/tools.ts`)

| Coluna nova | Tipo | Default | Notas |
|---|---|---|---|
| `packaging_weight_kg` | numeric(10,3) NOT NULL | `0` | espuma/proteção; despacho = `weight_kg + packaging_weight_kg` |
| `stackable` | boolean NOT NULL | `true` | pode empilhar sobre/sob outros itens |
| `ships_in_own_box` | boolean NOT NULL | `false` | viaja sozinho (usa as próprias dims embaladas) — caso das telescópicas de 180 cm |

CHECK: `packaging_weight_kg >= 0`. Colunas NOT NULL com default → backfill automático nos 23
produtos, **sem** o problema de "CHECK novo × dados existentes" (default satisfaz o CHECK).
`weightKg`/`lengthCm`/`widthCm`/`heightCm` ficam como estão. `overweightShippingAmount` é
**reaproveitado** como frete-fixo manual do produto: não-nulo → cobra esse valor fixo; nulo →
"a combinar" quando nenhuma tabela cobre.

### 4.6 `store_settings`

**Sem coluna nova.** Os 3 campos de frete (origem, seguro, teto) continuam na tabela; só a
**UI** deles muda de lugar (de `site/settings` → `/dashboard/shipping` aba Configurações).

### 4.7 Sync e push

Schema é push-only (ADR-0006): `bun db:sync` após editar `schema/*.ts`. Novas tabelas +
colunas + as queries do motor entram na superfície sincronizada e o CI (ADR-0009) abre PR no
ecommerce automaticamente. Arquivos dentro de `schema/`/`queries/` **não podem importar de
fora** dessa superfície (senão o `check-types` do ecommerce quebra) — o motor é puro, sem
imports externos.

## 5. Motor de cotação (`packages/db/src/queries/`)

Regra de negócio de frete, **owned-by-dashboard** e consumida pelo storefront — mesmo padrão de
`getShippingSettings`. Dois arquivos:

- `queries/shipping.ts` — reads: `getActiveCarriersWithTables(db)` (carrier + zones + rates),
  `getActiveBoxes(db)`. Assinatura padrão `db: NodePgDatabase<...>` parametrizado, sem `select *`.
- `queries/shipping-quote.ts` — **funções puras** (sem DB, testáveis): `packItems(...)` e
  `quote(...)`. Tipos exportados via `export type`.

### 5.1 Entrada / saída

```
quoteShipping(input: {
  items: Array<{ tool: ShippingToolDims; qty: number }>;
  destinationCep: string;
  declaredValue: number;          // valor do carrinho (para GRIS/ad valorem)
  carriers: CarrierWithTables[];  // de getActiveCarriersWithTables
  boxes: ShippingBox[];           // de getActiveBoxes
}): {
  options: Array<{ carrierId; carrierName; amount; deliveryDays }>;
  unquotable: Array<{ carrierId; carrierName; reason: "no_zone" | "no_rate" }>;
}
```

`ShippingToolDims = { lengthCm, widthCm, heightCm, weightKg, packagingWeightKg, stackable, shipsInOwnBox, overweightShippingAmount }`.

### 5.2 Passo 1 — empacotamento (`packItems`, FFD)

1. Itens com `shipsInOwnBox = true` → cada unidade é seu **próprio pacote**: dims = dims
   embaladas do produto, peso = `weightKg + packagingWeightKg`. (É assim que a telescópica de
   180 cm é tratada — não tenta caber em caixa do catálogo.)
2. Demais itens → **First-Fit Decreasing**: ordena por volume decrescente; para cada item
   tenta encaixar numa caixa aberta verificando **por eixo** (`l ≤ livre_l`, etc., com rotação
   simples 90°), `peso_acumulado + item ≤ max_weight_kg`, e `stackable` (item não-empilhável
   vai no topo). Não coube em nenhuma aberta → abre a **menor caixa do catálogo** que comporte
   o item; se nem a maior comporta o item sozinho → marca como pacote "fora de catálogo" (usa
   as dims do próprio item, sinaliza para "a combinar").
3. Resultado: lista de `Package = { lengthCm, widthCm, heightCm, weightKg }` onde
   `weightKg = Σ(item.weightKg + item.packagingWeightKg) + box.tareWeightKg`.

### 5.3 Passo 2 — cotação por transportadora (`quote`)

Para cada `carrier` ativo:

1. Casa `destinationCep` numa `zone` via `cep_ranges` (helper `matchCepRange`, generalizado de
   `matchBranchByCep`). Sem zona → `unquotable: no_zone`.
2. Para cada `package`: `pesoCubado = (l × w × h) / carrier.cubageDivisor`;
   `pesoCobrado = max(pesoReal, pesoCubado)`. Acha a `carrier_rate` da zona cuja faixa contém
   `pesoCobrado` (`weight_from ≤ peso < weight_to`, `weight_to NULL = ∞`). Sem faixa →
   `unquotable: no_rate`. Custo do pacote = `base_amount + max(0, pesoCobrado − weight_from) × per_kg_amount`.
3. `fretePeso = max(Σ custos dos pacotes, zone.min_freight_amount ?? 0)`.
4. Sobretaxas (1× por remessa): `gris = max(declaredValue × gris% , gris_min)` (se setado);
   `advalorem = declaredValue × advalorem%`; `+ toll_amount`.
5. `subtotal = fretePeso + gris + advalorem + toll`.
6. ICMS **por dentro**: `total = subtotal / (1 − icms%/100)` se `icms_percent` setado; senão
   `total = subtotal`.
7. `deliveryDays = zone.delivery_days`. Acumula em `options`, ordena por `amount`.

Se **nenhuma** transportadora cota e o item tem `overweightShippingAmount` → cobra o fixo;
senão → "a combinar".

### 5.4 Exemplo resolvido — 4 furadeiras

Furadeira: dims embaladas 35×30×28 cm, `weightKg` 15, `packagingWeightKg` 2, `stackable`
false, `shipsInOwnBox` false. Catálogo: `box-l` 70×60×50 / max 60 kg / tara 1,2;
`box-xl` 90×70×60 / max 80 kg / tara 1,8.

- FFD: as 4 unidades (17 kg cada = 68 kg) **estouram** `box-l` (max 60) → `box-xl`
  (grid 2×2 cabe; 68 + 1,8 tara = **69,8 kg**, ≤ 80). → **1 pacote** 90×70×60, 69,8 kg.
- Transportadora rodoviária (cubage 6000): cubado = 90×70×60/6000 = 63 kg; cobrado =
  max(69,8; 63) = **69,8 kg**. Lookup na zona do CEP → faixa de peso → valor + sobretaxas.
- Resultado: **1 frete consolidado**, não 4. (Naive seria 4× ~17,5 kg em 4 caixas.)

## 6. UI / navegação

### 6.1 Sidebar e rota

- Nova entrada **"Frete"** na sidebar (`nav-config.ts`), seção **"Sistema"** (config global,
  junto de "Site") — gated por `shipping.read`.
- `/dashboard/shipping` (`apps/web/src/app/dashboard/shipping/page.tsx`): Server Component
  com `requireCapabilityOrRedirect("shipping.read")` + `<EntityTabs>` (`?tab=`), abas:
  **Transportadoras** · **Caixas** · **Configurações**. Lê `searchParams.tab` para injetar a
  ação contextual no `PageHeader` (padrão `branches/[id]`).
  - Aba `transportadoras` (default): grid de cards (`useInfiniteList` + `<InfiniteSentinel>`,
    arquétipo *entity card*) das transportadoras. Ação no header: **"Nova transportadora"**
    (`Sheet`/drawer — form curto: nome, CNPJ, ativo, divisor, sobretaxas) visível só com
    `can(session, "shipping.manage")`. Card → detalhe.
  - Aba `caixas`: lista de caixas + criar (drawer curto). Ação no header: "Nova caixa".
  - Aba `config`: `ShippingSettingsForm` (origem + seguro) **movido** de `site/settings`.

### 6.2 Detalhe da transportadora

`/dashboard/shipping/carriers/[id]/page.tsx` (padrão `branches/[id]`): `EntityIdentityHeader`
+ `EntityTabs`:
- **Zonas & Tabela** — lista de zonas; cada zona com editor de `cep_ranges` (reusar o
  componente de faixas de CEP do form de branch), `delivery_days`, `min_freight_amount` + grid
  de faixas de peso (`weight_from`, `weight_to`, `base_amount`, `per_kg_amount`).
- **Sobretaxas** — `cubage_divisor`, GRIS (%/min), ad valorem (%), pedágio, ICMS (%).
- **Preview** — testa `CEP + lista de itens/peso` → chama o motor (`quoteShipping`) e mostra a
  cotação calculada. Valida a tabela antes de ir pro ar.

Editar = drawer `?edit=1`. Forms seguem `useFormErrors`/`LabeledField`/`<FieldError>`,
`MoneyInput`/`MaskedInput` para valores, `formatMeasure`/`formatMoney` na exibição (numeric vem
como string US — nunca renderizar cru).

### 6.3 `site/settings`

Remover a aba "Frete" de `apps/web/src/app/dashboard/site/settings/page.tsx` (fica Redes +
Local). `?tab=frete` → redirect para `/dashboard/shipping?tab=config`. Mover
`ShippingSettingsForm`/`ShippingPreviewRail`/`shipping-schema.ts` e as actions
`getOrCreateShippingSettings`/`listOriginBranchOptions`/`updateShippingSettings` para
`/dashboard/shipping`.

## 7. Permissões

Novas capabilities em `apps/web/src/lib/capabilities.ts` (1 entrada cada → aparecem na UI e
nascem deny-by-default):

| Capability | group | resource | action | defaultRoles |
|---|---|---|---|---|
| `shipping.read` | "Frete" | "Frete" | "Ver" | `SA` (super_admin + admin) |
| `shipping.manage` | "Frete" | "Frete" | "Gerenciar" | `S` (só super_admin) |

**Obrigatório:** adicionar `"Frete": "Sistema"` em `RESOURCE_SECTION` (`capabilities.ts`) —
senão o teste de exaustividade `sectionForCapability` quebra. Server actions: reads com
`requireCapability("shipping.read")`, mutations com `requireCapability("shipping.manage")` +
`logUserActivity` + `revalidatePath`/`revalidateTag`. Domínio é **global** (não branch-scoped).

## 8. Migração / sync / seed / handoff

- `bun db:sync` aplica schema + (re)cria CHECKs/índices. CI sincroniza
  `schema/shipping.ts` + `queries/shipping*.ts` + alteração de `tools.ts` pro ecommerce
  (ADR-0009).
- Atualizar contrato `docs/integration/admin-ecommerce.md`: novas tabelas, as funções
  `getActiveCarriersWithTables`/`getActiveBoxes`/`quoteShipping`, e a nota de que o storefront
  passa a cotar pela tabela própria (com "a combinar" no gap), substituindo o caminho SuperFrete.
- **Seed** (`db:seed-demo`): catálogo de caixas exemplo (S/M/L/XL) + 1 transportadora exemplo
  com 2 zonas (Curitiba/RMC e Brasil) e algumas faixas de peso, para o dev e o preview.
- **Handoff ecommerce (issue no repo `emach-ferramentas`/ecommerce):** trocar a chamada
  SuperFrete do checkout por `quoteShipping(...)` lendo as novas tabelas; tratar "a combinar".
  Não se mexe no repo ecommerce a partir daqui (ADR-0004 + regra cross-repo).

## 9. Testes

`packages/db/src/queries/shipping-quote.ts` é a lógica de risco → **TDD**, testes unitários
(rodados pela suíte vitest de `apps/web`, que importa de `@emach/db`):

- **Empacotamento:** 1 furadeira → box-s; 4 furadeiras → 1 box-xl (caso §5.4); item de 180 cm
  com `shipsInOwnBox` → pacote próprio; item que não cabe em nenhuma caixa → "fora de catálogo".
- **Peso cobrado:** `max(real, cubado)` com `cubage_divisor` 6000 e custom.
- **Lookup de faixa:** discreta, linear, excedente (faixa topo `weight_to NULL`), frete mínimo.
- **Sobretaxas:** GRIS com piso, ad valorem, pedágio, **ICMS por dentro** (`/(1−aliq)`).
- **Sem cobertura:** no_zone / no_rate → "a combinar"; `overweightShippingAmount` → fixo.

CRUD: actions com `requireCapability` + `logUserActivity`; smoke visual nas rotas novas
(`bun dev:web`) — `check-types` não pega hook client em Server Component nem SQL inválido.
Gate antes de commit/PR: `bun verify` (check-types + check + test).

## 10. Fases de implementação

1. **Schema + sync + contrato** — `schema/shipping.ts`, alterações em `tools.ts`, barrel,
   `bun db:sync`, atualizar contrato de integração.
2. **Permissões + navegação + relocação de settings** — capabilities + `RESOURCE_SECTION`,
   entrada na sidebar, `/dashboard/shipping` com as 3 abas, mover `ShippingSettingsForm` e
   remover a aba de `site/settings` (+ redirect).
3. **CRUD de caixas + CRUD de transportadora** — listagens, drawers de criação, detalhe da
   transportadora com editor de zonas/tabela e sobretaxas (actions + schemas Zod + forms).
4. **Motor de cotação (TDD) + Preview** — `queries/shipping.ts` (reads) + `shipping-quote.ts`
   (puro) com testes; aba Preview no detalhe.
5. **Fase 2 (depois)** — handoff ecommerce (issue), import CSV de tabela, flag `fragile`,
   eventual toggle de fallback SuperFrete.

## 11. Riscos / pontos de atenção

- **Numeric como string (pt-BR):** Drizzle devolve `numeric` como string US — sempre
  `formatMeasure`/`formatMoney` na UI; no motor, `Number(...)` no boundary.
- **`db.execute` raw:** se algum read usar `db.execute`, coercer timestamp com `toDate` e
  aliasar colunas `AS "camelCase"` (gotchas de `packages/db/CLAUDE.md`). Preferir query builder.
- **Sync surface:** nada em `schema/`/`queries/` pode importar de fora da superfície — motor puro.
- **`"use server"`:** não re-exportar não-async de actions; rodar `bun run build` após split.
- **Cobertura de CEP:** garantir que sempre exista zona "Brasil" coringa ou comunicar bem o
  "a combinar" — senão cliente fica sem opção de frete.
- **Acurácia do FFD (±12%):** aceitável; monitorar casos de mix heterogêneo. 3D exato é fase
  futura só se o frete por pedido for alto.

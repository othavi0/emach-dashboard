# Refatoração do fluxo de transportadoras: wizard de criação com zonas + obrigatoriedade

**Data:** 2026-06-23
**Rota afetada:** `/dashboard/shipping` e `/dashboard/shipping/carriers/[id]`
**Status:** aprovado no brainstorming, pronto para plano de implementação

## Contexto e problema

Hoje o fluxo de transportadoras (carriers) tem três falhas de produto:

1. **Criar não inclui zonas.** O "Nova transportadora" é um drawer (`carrier-create-sheet.tsx`, via `?newCarrier=1`) que insere **só** na tabela `carrier` (`createCarrier`, `actions.ts:224`). Zonas vivem em `carrier_zone`, cuja FK `carrier_id` é `notNull` — logo a zona **não pode** existir antes da transportadora ser salva. O fluxo é forçadamente em duas etapas (criar carrier → navegar pro detalhe → aba "Zonas & Tabela"), e dá pra criar uma transportadora "pela metade" que **não cota frete nenhum**.
2. **CNPJ é opcional.** `carrierSchema` usa `cnpj: ...optional()` (`carrier-schema.ts:15`) e a coluna é `nullable` (`shipping.ts:27`). Uma transportadora pode nascer sem identidade fiscal.
3. **Sobretaxas essenciais opcionais.** GRIS, ad valorem e ICMS são opcionais, embora componham praticamente toda tabela de carga fracionada.

Estado real do banco (consultado em 2026-06-23): **1 transportadora** (seed de teste, sem CNPJ / ICMS / ad valorem), 2 zonas, 6 rates, **0 transportadoras usando pedágio**. Não há legado a migrar — é pré-lançamento.

## Decisões (do brainstorming)

| # | Decisão |
|---|---|
| 1 | Transportadora **nasce cotável**: criar exige `carrier` + ≥1 zona (com faixa de CEP) + ≥1 faixa de peso/valor por zona. |
| 2 | Criar vira **wizard de 2 passos** (página `/new`), não drawer. |
| 3 | **Reusa** os componentes existentes de faixa de CEP (`CepRangesEditor`) e de tabela de peso (`RateTableEditor`). |
| 4 | Obrigatórios: **Nome, CNPJ, cubagem, ICMS, GRIS, ad valorem**. GRIS mínimo segue opcional. |
| 5 | **Pedágio sai do form** (e do cálculo do dashboard). |
| 6 | Enforcement **na tela E no banco** (`notNull`); CNPJ vira **único de verdade**. |
| 7 | **Editar dados** = drawer lateral; **editar zonas** = aba do detalhe. Create e edit compartilham os mesmos campos. |

## Arquitetura

### 1. Criar — wizard de 2 passos

**Nova rota:** `app/dashboard/shipping/carriers/new/page.tsx` (Server Component que monta o wizard). O botão "Nova transportadora" (`shipping-header-action.tsx`) passa a **navegar** para `/dashboard/shipping/carriers/new` em vez de setar `?newCarrier=1`. O drawer `carrier-create-sheet.tsx` é **removido**.

**Componente:** `carriers/_components/carrier-wizard.tsx` (client), espelhando o padrão de `tools/_components/tool-wizard.tsx` (stepper, estado de passo `active`/`stepDone`, validação por passo, navegação ao primeiro passo com erro via helper análogo ao `tool-form-steps.ts`/`firstStepWithError`).

- **Passo 1 · Dados** — reusa `carrier-form-fields.tsx` (atualizado, ver §Componentes). Campos: Nome\*, CNPJ\*, Divisor de cubagem\* (default 6000), GRIS%\* (+ GRIS mínimo opcional), Ad valorem%\*, ICMS%\*, Ativa, Observações. **Sem pedágio.**
- **Passo 2 · Zonas & peço** — lista controlada de zonas (≥1). Cada zona é um `ZoneFieldset` (novo, ver §Componentes) com: Nome\*, faixas de CEP\* (`CepRangesEditor`), Prazo/Frete-mín opcionais, e tabela de peso\* (≥1 faixa, `RateTableEditor`). Botão "+ Nova zona".

**Submit:** nova server action `createCarrierWithZones(input)` em `shipping/actions.ts`. A `createCarrier` antiga tem **um único caller** (o drawer `carrier-create-sheet.tsx:60`), então saem juntos: `createCarrier` (action), `carrier-create-sheet.tsx` (drawer) e a montagem `<CarrierCreateSheet />` em `carriers-tab.tsx:11`. O `shipping-header-action.tsx` deixa de setar `?newCarrier=1` e passa a navegar para `/new`.

### 2. Ver / Editar — detalhe `/carriers/[id]`

Mantém o `EntityIdentityHeader` + `EntityTabs` (`carriers/[id]/page.tsx`). Mudanças:

- Aba **"Sobretaxas"** → renomeada **"Dados & sobretaxas"** (`surcharges-tab.tsx`), **sem a linha de pedágio**.
- Abas **"Zonas & Tabela"** e **"Preview"** inalteradas. O `zone-editor.tsx` (persistência imediata via `upsertZone`/`saveZoneRates`) **continua** governando a edição de zonas no detalhe.
- **Editar dados** = drawer `?edit=1` (`carrier-edit-sheet.tsx`), reusando `carrier-form-fields.tsx` — herdam automaticamente os novos obrigatórios e a ausência de pedágio.

### 3. Schema do banco (`packages/db/src/schema/shipping.ts`) — push-only (ADR-0006)

| Coluna | De | Para |
|---|---|---|
| `carrier.cnpj` | `text` (nullable) | `text().notNull()` |
| índice `carrier_cnpj_unique_when_present` | partial (`where cnpj is not null`) | **unique total** em `cnpj` |
| `carrier.gris_percent` | `numeric(5,2)` nullable | `.notNull()` (CHECK `carrier_percents_valid` mantido) |
| `carrier.advalorem_percent` | nullable | `.notNull()` |
| `carrier.icms_percent` | nullable | `.notNull()` |
| `carrier.toll_amount` | `numeric(10,2)` nullable | **mantida** (ver §Decisões técnicas) |
| `carrier.gris_min_amount` | nullable | **mantida nullable** (opcional) |

Aplicação: backfill da seed → `bun db:sync` (dashboard) → sync TS pro ecommerce via CI (ADR-0009).

## Componentes (novos e reusados)

**Princípio:** o passo 2 do wizard cria zonas que **ainda não existem no banco** (acumuladas em estado, persistidas só no submit final). O `zone-editor.tsx` atual persiste **imediatamente** (chama `upsertZone`/`saveZoneRates`). São dois modos da mesma UI.

- **Novo — `ZoneFieldset` controlado** (`shipping/_components/zone-fieldset.tsx`): renderiza os campos de uma zona (Nome, `CepRangesEditor`, Prazo, Frete-mín, `RateTableEditor`) de forma **totalmente controlada** (`value` + `onChange`), **sem** chamar server actions. É a unidade reusável:
  - no **wizard** (modo draft): N `ZoneFieldset` num array de estado; persistidos juntos no submit.
  - opcionalmente, o `zone-editor.tsx` do detalhe pode ser refatorado para envolver o `ZoneFieldset` + a camada de persistência (reduz duplicação) — **alvo secundário**, não bloqueia o create.
- **Reusados sem mudança:** `CepRangesEditor` (`branches/_components/cep-ranges-editor.tsx`), `RateTableEditor` (`carriers/[id]/_components/rate-table-editor.tsx`).
- **Atualizado — `carrier-form-fields.tsx`:** remover o campo de pedágio; marcar CNPJ/GRIS/ad valorem/ICMS como `required` (asterisco via `LabeledField`).

## Fluxo de dados (transação)

`createCarrierWithZones` segue o padrão de `createTool` (`tools/actions.ts:79`) — uma única `db.transaction`:

```
1. id = crypto.randomUUID()
2. tx.insert(carrier).values({ id, name, cnpj: normalizeCnpj(cnpj), cubageDivisor, grisPercent, advaloremPercent, icmsPercent, ... })
3. para cada zona: zoneId = crypto.randomUUID(); tx.insert(carrierZone).values({ id: zoneId, carrierId: id, name, cepRanges, ... })
4. para cada rate da zona: tx.insert(carrierRate).values({ id, carrierId: id, zoneId, weightFromKg, baseAmount, perKgAmount, ... })
```

No sucesso: `revalidatePath("/dashboard/shipping")` + redirect/`router.push` para `/dashboard/shipping/carriers/${id}`.

## Validação (Zod)

- **`carrierSchema`** (`carrier-schema.ts`): `cnpj` deixa de ser `.optional()` → `z.string().trim().min(1, "CNPJ obrigatório").refine(isValidCnpj, "CNPJ inválido")`. `grisPercent`/`advaloremPercent`/`icmsPercent` deixam de ser `.optional().nullable()` → obrigatórios (`≥ 0`, mantendo os limites). Remover `tollAmount`. `grisMinAmount` segue opcional.
- **Novo `createCarrierSchema`** = `carrierSchema` **estendido** com `zones: z.array(zoneWithRatesSchema).min(1, "Adicione ao menos uma zona")`, onde `zoneWithRatesSchema` = `zoneSchema` (`zone-schema.ts`, já exige `cepRanges.min(1)`) + `rates: ratesSchema` (já exige `.min(1)`).
- O edit continua usando `carrierSchema` puro (sem zonas).

## Tratamento de erros

- Padrão do projeto: `useFormErrors<T>()` + `<FieldError>` por campo, foco no primeiro inválido. No wizard, navegar ao primeiro **passo** com erro (helper análogo a `firstStepWithError`).
- Erro de banco no `catch`: `getPgError(e)` (`src/lib/db-error.ts`) — mapear **`23505`** (unique) para mensagem amigável de **CNPJ já cadastrado**, ancorada no campo CNPJ (passo 1). Nunca `e.message.includes(...)`.

## Capabilities

`createCarrierWithZones` e `updateCarrier`: `await requireCapability("shipping.manage")` (super_admin por default) — mantido. Reads seguem `shipping.read`.

## Testes

- **Unit** (`shipping/_components/__tests__/`): `createCarrierSchema` — rejeita CNPJ ausente/inválido, exige ≥1 zona, exige ≥1 rate por zona, exige ICMS/GRIS/ad valorem; aceita payload completo.
- **Smoke visual** (manual, :3007): rodar o wizard, criar transportadora completa, abrir o detalhe e cotar no Preview; tentar CNPJ duplicado e ver a mensagem no campo.

## Decisões técnicas e pendências

1. **Pedágio — coluna mantida.** `toll_amount` **não** é dropada agora: o banco é compartilhado e o ecommerce lê `carrier` para cotar (ADR-0004). O campo sai da UI e do cálculo do dashboard; com a coluna sempre `null`/`0`, o efeito no frete é nulo. **Pendência:** abrir item para dropar a coluna em passo futuro coordenado com o repo ecommerce.
2. **Seed.** Antes de ligar o `notNull`, completar a transportadora de teste (CNPJ/ICMS/ad valorem) — via `UPDATE` no passo de migração do plano ou editando pela própria UI. Sem isso o push de `notNull` falha.

## Fora de escopo

- Drop da coluna `toll_amount` (futuro coordenado).
- Mudanças no motor de cotação além de ignorar o pedágio.
- Cobertura de zona por UF/estado (continua exclusivamente por faixa de CEP).
- Caixas (`shipping_box`) e configurações gerais de frete (`store_settings`) — inalteradas.

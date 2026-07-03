# Limpeza de frete pós-Frenet (issue #287 + código morto)

> Design doc — 2026-07-03. Status: aprovado para virar plano de implementação.
> Chore/limpeza: dropar o motor próprio de tabelas de frete (`carrier`/`carrier_zone`/
> `carrier_rate`) aposentado pela migração do storefront para a Frenet
> (othavi0/emach-ecommerce#178, na main), e remover o código morto associado no
> dashboard — coluna `tool.overweight_shipping_amount`, motor `quoteShipping`, UI de
> transportadoras e copy obsoleta de SuperFrete.

## 1. Contexto e problema

O storefront cotava frete no SuperFrete → migrou para o motor próprio de tabelas
(spec 2026-06-22) → migrou de novo para a **Frenet** (PR #178, merged 2026-07-03).
O fluxo vivo hoje é:

```
tool (weightKg, dims, packagingWeightKg, stackable, shipsInOwnBox)
  → packItems() consolida o carrinho nas caixas de shipping_box   [vivo]
  → 1 entrada por caixa no ShippingItemArray da Frenet             [vivo]
  → cliente escolhe serviço → order.shippingAmount/shippingMethod  [vivo]
```

O que ficou **sem nenhum consumidor em runtime** (verificado em 2026-07-03 nos dois
repos + banco):

- Tabelas `carrier`/`carrier_zone`/`carrier_rate` — zero leitura fora da própria UI
  de admin do dashboard. No banco só há dado de seed (1 carrier "Transportadora
  Exemplo", 2 zonas, 6 rates).
- `quoteShipping` + tipos `QuoteCarrier`/`QuoteZone`/`QuoteRate` em
  `packages/db/src/queries/shipping-quote.ts` — o ecommerce importa **só**
  `packItems` (e tipos de item/caixa) desse arquivo.
- `getActiveCarriersWithTables` em `packages/db/src/queries/shipping.ts` — único
  chamador é `preview-action.ts` da UI de transportadoras do dashboard.
- Coluna `tool.overweight_shipping_amount` — **morta duas vezes**: já era ignorada
  pelo motor de tabelas (spec 2026-06-22, "ignorando `tool.overweightShippingAmount`")
  e a Frenet também não a lê (item fora de catálogo de caixa → `negotiate: true`,
  "frete a combinar"). 0 tools a usam no banco.
- Copy de UI citando SuperFrete e o teto 30kg/100cm — hint/tooltip do step de
  logística do form de tools (`logistics-fields.tsx`), bloco condicional de
  overweight (`exceedsShippingQuoteLimit`), linha "Frete > 30kg" no detalhe do tool
  (`overview-tab.tsx:108-114`) e as linhas estáticas do `shipping-preview-rail.tsx`
  ("Cotação automática (SuperFrete)" etc.).

O que **permanece vivo** e não pode ser tocado:

- `shipping_box` + `getActiveBoxes` + tab Caixas — a Frenet cota por caixa
  consolidada; remover quebraria o checkout.
- `packItems` + tipos consumidos pelo ecommerce (superfície de sync, ADR-0009).
- `store_settings` (origem/seguro) + `getShippingSettings` — órfão *temporário*: a
  v1 da Frenet usa `env.FRENET_SELLER_CEP`, e o swap para ler a config do dashboard
  é pendência documentada na spec da Frenet do ecommerce. Fica; o wire vira issue lá.
- Capabilities `shipping.read`/`shipping.manage`, nav "Frete" — continuam gateando
  Caixas + Configurações.
- `order.shipping_unverified` e fluxo de revisão — ortogonal ao motor de cotação.

## 2. Banco (push-only, ADR-0006)

Drop físico via SQL direto (pg client — `drizzle-kit push` de drop pendura sem TTY),
na ordem filho→pai:

```sql
DROP TABLE carrier_rate;
DROP TABLE carrier_zone;
DROP TABLE carrier;
ALTER TABLE tool DROP COLUMN overweight_shipping_amount; -- leva o CHECK junto
```

Depois de remover o schema TS, `bun db:push` deve reportar schema≡banco (no-op).
Sem migração de dado: as 3 tabelas só têm seed e a coluna está 100% null.

## 3. `packages/db` (superfície sincronizada — gate é o CI do ecommerce)

- `src/schema/shipping.ts` — ficam só `shippingBox` + `ShippingBox`/`NewShippingBox`.
  Saem: `CarrierCepRange`, `carrier`, `carrierZone`, `carrierRate`, relations e types
  de carrier*. O barrel `schema/index.ts` usa `export *` — se ajusta sozinho.
- `src/schema/tools.ts` — sai `overweightShippingAmount` + check
  `overweight_shipping_non_negative`.
- `src/queries/shipping.ts` — sai `getActiveCarriersWithTables` (e o tipo interno
  `ShippingSchema` que só existe para o `db.query.carrier`). Fica `getActiveBoxes`.
- `src/queries/shipping-quote.ts` — sai `quoteShipping` + tipos/helpers exclusivos
  do motor (QuoteCarrier/QuoteZone/QuoteRate, peso cubado, sobretaxas GRIS/ad
  valorem/pedágio, ICMS "por dentro", `UnquotableReason` de zona/faixa se não for
  importado). **Regra dura:** antes de cortar, enumerar os imports reais no ecommerce
  (`rg "from.*shipping-quote" apps/ packages/` na main de othavi0/emach-ecommerce) e
  preservar todo símbolo importado — conhecidos: `packItems`, `QuoteItem`, `QuoteBox`,
  `ShippingPackage` (flag `outOfCatalog`).
- `src/queries/__tests__/shipping-quote.test.ts` — ficam os describes de `packItems`;
  saem os de `quoteShipping`.
- `scripts/seed/shipping.ts` — para de semear carrier/zone/rate; caixas ficam.
  `scripts/seed/truncate.ts` — sai `"carrier"` (e zone/rate se listados).
- Falso-positivo conhecido: `scripts/enrich-demo.ts:748,848` usa `carrier:` como chave
  de metadata JSON de `orderEvent` (string livre de rastreio) — **não** é a tabela,
  não tocar.

## 4. Dashboard UI (`apps/web/src/app/dashboard/`)

Remover (tudo em `shipping/`):

- Subárvore `carriers/` inteira: `new/page.tsx`, `[id]/page.tsx`,
  `[id]/_lib/tab-actions.ts` e os 10 componentes de `[id]/_components/`.
- `_components/`: `carriers-tab.tsx`, `carrier-card.tsx`, `carrier-card-grid.tsx`,
  `carrier-schema.ts`, `carrier-form-fields.tsx`, `carrier-wizard.tsx`,
  `carrier-wizard-steps.ts`, `zone-schema.ts`, `zone-fieldset.tsx`,
  `rate-rows-editor.tsx` + `__tests__/carrier-schema.test.ts`.
- `preview-action.ts` (motor de cotação legado), `_lib/derive-zone-name.ts` + teste.

Reestruturar (god-modules mistos — manter só box + settings):

- `data.ts` — saem `getCarriersPage`/`getCarrierDetail`/`getCarrierZones`/
  `getToolsForQuote`; fica `getBoxes`.
- `actions.ts` — saem `createCarrierWithZones`, `updateCarrier`, `deleteCarrier`,
  `upsertZone`, `deleteZone`, `saveZoneRates`, `fetchCarriersPage`; ficam settings
  (`getOrCreateShippingSettings`, `listOriginBranchOptions`, `updateShippingSettings`)
  e boxes (`createBox`, `updateBox`).
- `page.tsx` — de 3 tabs para 2: **Caixas** (default) | **Configurações**.
- `shipping-header-action.tsx` — o botão contextual "Nova transportadora" vira o
  gatilho de "Nova caixa" (na tab Caixas), reutilizando o `box-create-sheet` existente.

Form de tools (`tools/_components/`):

- `fields/logistics-fields.tsx` — sai o bloco condicional de overweight +
  `exceedsShippingQuoteLimit`; hint/tooltip reescritos: a loja cota via Frenet
  consolidando os itens nas caixas de envio cadastradas; item que não cabe na maior
  caixa ativa aparece como "frete a combinar".
- `tool-schema.ts`, `tool-form-state.ts`, `tool-form-steps.ts`,
  `_lib/tool-query-helpers.ts` (`normalizeToolPayload`), `[id]/edit/page.tsx` — sai
  `overweightShippingAmount` de schema/state/steps/payload/hidratação.
- `[id]/_components/overview-tab.tsx` — sai a `MetaRow` "Frete > 30kg".

Copy/config:

- `shipping/_components/shipping-preview-rail.tsx` — reescrever as linhas estáticas:
  saem "Item até 30 kg — Cotação automática (SuperFrete)" e "Item acima de 30 kg —
  Frete por-produto ou a combinar"; entram "Cotação — Frenet (multi-transportadora),
  sobre as caixas de envio" e "Item fora do catálogo de caixas — Frete a combinar".
  A linha "Frete grátis — apenas via cupom" fica.
- `lib/capabilities.ts` — descrições de `shipping.read`/`shipping.manage` sem
  "transportadoras, tabelas" (ex.: "Visualizar caixas de envio e config de frete").
- Nav "Frete" (`nav-config.ts`) fica como está.

## 5. Docs

- `docs/integration/admin-ecommerce.md` — a seção "Motor de cotação próprio
  (substitui SuperFrete)" é reescrita para a realidade Frenet: consolidação
  `packItems` + `shipping_box` (dashboard-owned), cotação na API Frenet com origem
  via `env.FRENET_SELLER_CEP` (v1), `store_settings` como fonte futura de
  origem/seguro, `outOfCatalog` → "frete a combinar". Referências a
  `overweight_shipping_amount` e ao fallback SuperFrete saem.
- `frenetapi.apib` (untracked na raiz) → `docs/integration/frenet-api.apib`,
  versionado como referência da API.

## 6. Propagação e verificação

1. `bun verify` (check-types + check + test) no dashboard.
2. `rg 'carrierZone|carrierRate|\bcarrier\b|overweightShipping|getActiveCarriersWithTables|quoteShipping'`
   em `packages/ apps/` — esperado: só o falso-positivo de metadata em
   `enrich-demo.ts` e strings de fixture não relacionadas.
3. Smoke run-time (`bun dev:web`): `/dashboard/shipping` (2 tabs, CRUD de caixa,
   settings), `/dashboard/tools/new` e `/dashboard/tools/[id]` (step logística sem
   overweight, overview sem "Frete > 30kg") — mudou schema/queries SSR e
   `check-types` não pega SQL inválido.
4. Merge na main → `sync-db-schema.yml` abre PR no ecommerce removendo os mesmos
   símbolos. **Gate:** `check-types` + `test:ci` verdes no PR de sync antes de
   mergear lá.
5. Abrir issue no othavi0/emach-ecommerce: "Frenet: ler `getShippingSettings` em vez
   de env" — `SellerCEP` ← CEP da filial de origem (`shippingOriginBranchId`),
   `ShipmentInvoiceValue` respeitando `insurancePolicy`/`insuranceCapAmount`,
   fallback para env quando `originCep` null.

## 7. Não-objetivos

- **Expor `packagingWeightKg`/`stackable`/`shipsInOwnBox` no form de tools** — gap
  funcional real (o checkout lê, ninguém escreve; tudo nos defaults), mas é feature
  com decisão de UX própria. Vira issue separada no dashboard, junto com o check
  "não cabe na maior caixa ativa" que substituiria o antigo warning de 30kg.
- Coluna `order.shippingServiceCode` (persistir serviço escolhido) — pendência do
  ecommerce, fora deste repo.
- Remover `store_settings`/capabilities/nav de frete — continuam em uso.
- Qualquer mudança no algoritmo `packItems` ou no fluxo de checkout do ecommerce.

## 8. Riscos

- **Sync quebrar o ecommerce:** mitigado pela regra de enumerar imports reais antes
  de cortar `shipping-quote.ts` + gate de CI no PR de sync.
- **Drop sem TTY pendurar:** mitigado usando SQL direto + `db:push` no-op como
  verificação (padrão documentado em `packages/db/CLAUDE.md`).
- **God-module split regressivo:** `data.ts`/`actions.ts`/`page.tsx` misturam os 3
  domínios; o smoke run-time das 2 tabs cobre o caminho.

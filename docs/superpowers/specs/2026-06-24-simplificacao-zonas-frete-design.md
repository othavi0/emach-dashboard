# Simplificação do editor de Zonas & Tabela (frete)

> Spec de design — 2026-06-24
> Rota: `/dashboard/shipping/carriers/[id]?tab=zonas` (tab "Zonas & Tabela") + wizard de criar transportadora.

## Problema

Ao criar/editar uma zona de frete, o usuário seleciona uma cobertura présetada (Brasil
todo ou um estado, ex: Rio Grande do Sul) mas **ainda é obrigado a digitar um "Nome"**
para a zona. Esse nome:

- É **puramente um rótulo interno do admin**. O motor de cotação casa a zona **só pelo
  CEP** (`packages/db/src/queries/shipping-quote.ts:181` — `carrier.zones.find((z) =>
  matchCepRange(cep, z.cepRanges))`), nunca pelo nome.
- **Nunca é exibido ao cliente** no checkout — o resultado da cotação devolve
  `carrier.name` + `zone.deliveryDays`, não `zone.name`.
- Só aparece como `<h3>` do card aqui no admin.

A cobertura présetada já dá identidade à zona, então o nome é redundância — sobrou de
quando a zona foi modelada copiando o padrão de filial.

Problemas correlatos levantados na mesma tela:

1. A faixa de CEP présetada (modo `presetOnly`) renderiza um input "Rótulo (opcional)"
   editável **e** uma lixeira por linha, mesmo com o CEP `readOnly` — três camadas de
   nome competindo (nome da zona + rótulo por faixa + nome do preset) e um delete que
   "não faz sentido" sobre algo présetado.
2. A divisória (`Separator`) entre o form e a tabela não vai até a borda do card
   (`my-4` dentro de `p-4` → 16px de recuo), violando a regra edge-to-edge do `DESIGN.md`.
3. A CTA "Nova zona" é `variant="outline" size="sm"` — sem destaque para uma ação
   primária.

## Decisões (aprovadas)

| # | Decisão |
|---|---------|
| D1 | **Remover o nome da zona da UI.** A identidade da zona passa a ser a própria cobertura de CEP. |
| D2 | **Não migrar schema agora.** `carrier_zone.name` continua `notNull`; o nome passa a ser **derivado no servidor** a partir dos `cepRanges`. Dropar a coluna = follow-up cross-repo (ver §Out-of-scope). |
| D3 | **Faixa de CEP em modo preset vira chip de cobertura** não-editável (`Estado · faixa`), com X = "remover este estado". Some o input "Rótulo (opcional)". Modo livre (filiais) **intocado**. |
| D4 | **Polish:** divisória edge-to-edge; CTA "Nova zona" com destaque (add-card full-width tracejado). |

## Design

### 1. Derivação do nome (sem migração de schema)

Helper puro, testável, em `_lib`:

```
deriveZoneName(cepRanges: CarrierCepRange[]): string
```

Mapeia as faixas de volta para UF via `BRASIL_PRESET` / `UF_CEP_PRESETS`
(`apps/web/src/app/dashboard/branches/_components/cep-presets.ts`):

- Faixa == `BRASIL_PRESET` (`00000000`–`99999999`) → `"Brasil"`.
- 1 UF coberta → nome do estado (ex: `"Rio Grande do Sul"`).
- 2–3 UFs → siglas unidas (ex: `"RS, SC, PR"`).
- ≥4 UFs → `"N estados"`.
- Fallback (faixa custom não casada com preset) → algo determinístico tipo
  `"Faixa personalizada"` (não deve acontecer no modo preset, mas defende o `notNull`).

**Onde aplicar** (os 3 sites que gravam `carrier_zone.name`, em
`apps/web/src/app/dashboard/shipping/actions.ts`):

- `:253` — `insert(carrierZone)` no create de transportadora (wizard).
- `:371` — `update(carrierZone)` no `upsertZone` (editar zona existente).
- `:383` — `insert(carrierZone)` no `upsertZone` (nova zona no detalhe).

Todos passam a usar `deriveZoneName(zone.cepRanges)` em vez de `zone.name`.

### 2. Schemas

- `apps/web/src/app/dashboard/shipping/_components/zone-schema.ts`: remover o campo
  `name` de `zoneSchema` (linha 21). `ZoneFormValues` deixa de ter `name`.
- `apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts`: `ZoneDraft`
  (linha 78) perde `name`; o valor inicial do draft (linha ~58) perde `name: ""`.
  `zoneWithRatesSchema` herda de `zoneSchema` — cascateia automaticamente.
  (Atenção: a linha 19 desse arquivo é o **nome da transportadora**, não da zona —
  **não** mexer.)

### 3. UI do card de zona — `carriers/[id]/_components/zone-editor.tsx`

- Remover o `<LabeledField label="Nome" required>`.
- `ZoneHeader`: título = cobertura derivada (chamar `deriveZoneName` no client a partir
  do `zone.cepRanges`, ou usar `zone.name` já derivado vindo do servidor — preferir o
  segundo, evita lógica duplicada).
- `Separator` (linha ~323): edge-to-edge — `-mx-4` (card é `p-4`), conforme `DESIGN.md`.
- Manter Faixas de CEP, Prazo (dias), Frete mínimo (R$).

### 4. UI do wizard — `_components/zone-fieldset.tsx`

- Remover o `<LabeledField label="Nome da zona" required>` (linha 51).
- `<legend>` "Zona N" pode passar a refletir a cobertura derivada quando houver
  `cepRanges` (opcional; "Zona N" como fallback enquanto vazio).
- Manter Prazo, Frete mínimo, Tabela de peso.

### 5. Faixa de CEP em modo preset — `branches/_components/cep-ranges-editor.tsx`

**Mudanças gated por `presetOnly === true`** (modo livre de filiais permanece idêntico):

- Não renderizar o input "Rótulo (opcional)".
- Não renderizar `MaskedInput` `readOnly` de De/Até.
- Renderizar cada faixa como **chip/linha de cobertura** compacta e não-editável:
  `Rio Grande do Sul · 90000-000–99999-999` (label do preset + faixa formatada),
  com botão X `aria-label="Remover estado da cobertura"` → `removeRow(idx)`.
- **Um chip por faixa**, rotulado pelo preset. Estados multi-faixa (AM, DF, GO têm 2
  faixas) aparecem como dois chips com o mesmo rótulo de estado — aceitável (são raros);
  o X remove a faixa correspondente. Não agrupar por estado nesta fase (mantém o
  `removeRow(idx)` 1:1 com a faixa, sem lógica extra).

### 6. Polish da CTA "Nova zona" — `carriers/[id]/_components/zones-tab.tsx` + `zone-editor.tsx`

- Trocar o botão `outline size="sm"` por um **add-card full-width tracejado**
  (`border-dashed`, largura total, ícone `Plus` + "Nova zona") ao fim da lista —
  afordância forte de "adicionar item à lista".
- Auditar as demais divisórias do card no mesmo passe (edge-to-edge onde couber).

## Verificação

- `bun verify` (check-types + check + test).
- Teste unitário de `deriveZoneName` (Brasil / 1 UF / 2–3 UFs / ≥4 UFs / multi-faixa
  AM-DF-GO / fallback).
- Smoke visual (browser) — **obrigatório**, pois `check-types` não pega regressão de
  UI/SSR:
  - Criar transportadora pelo wizard sem digitar nome de zona → salva, nome derivado
    aparece no detalhe.
  - Editar zona no detalhe: adicionar/remover estado pelo chip X; salvar.
  - Filiais (modo livre) **inalteradas** — rótulo e digitação manual continuam.
  - Divisória edge-to-edge; CTA com destaque.

## Out-of-scope (follow-ups rastreados)

1. **Auditoria cross-system da cobertura de CEP / "estados".** O conceito de
   cobertura por estado/CEP é usado em mais lugares do sistema (filiais, sugestão de
   filial por CEP, possivelmente checkout/ecommerce). Antes de evoluir mais, **revisar
   o que é afetado** e analisar se algumas telas/sessões deixam de ser necessárias com
   a identidade derivada. Consumidores conhecidos do `CepRangesEditor`:
   `branches/_components/branch-form-fields.tsx` (livre),
   `shipping/_components/zone-fieldset.tsx` (preset, wizard),
   `shipping/carriers/[id]/_components/zone-editor.tsx` (preset, detalhe).
   Único dono dos presets: `branches/_components/cep-presets.ts`.
   → Abrir como tarefa de auditoria separada.
2. **Dropar fisicamente `carrier_zone.name`.** Requer PR cross-repo (banco
   compartilhado com e-commerce, ADR-0009). Só depois de confirmar que nada no
   ecommerce lê a coluna.
3. **Mover a CTA "Nova zona" para o header da tab** (padrão entity-detail canônico) —
   requer wiring de ação por-tab em `page.tsx`. Não essencial agora.

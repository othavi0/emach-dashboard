# Unidade de peso no cadastro de ferramentas (kg/g)

Data: 2026-07-29 · Status: aprovado em brainstorm (opção A do visual companion)

## Problema

No passo 4 do wizard de ferramentas ("Logística & frete"), "Peso (kg)" e "Peso da
embalagem (kg)" forçam entrada em quilogramas. Itens leves (broca de 80 g, embalagem
de 350 g) exigem digitar `0,08` / `0,35` — propenso a erro e ilegível. O peso alimenta
a cotação de frete Frenet no checkout do ecommerce (despacho = `weight_kg +
packaging_weight_kg`), então erro de grandeza aqui vira frete errado na loja.

## Decisão

Seletor de unidade **kg/g** acoplado ao input, com conversão automática na borda da
UI. **Grama é a menor unidade** (decidido com o user; mg foi descartado — exigiria
migração `numeric(10,3) → (10,6)` + mudança de contrato, e Frenet não cota sub-grama).
Aplica-se **aos dois campos** de peso do passo 4.

**Nada muda no dado**: form state (`weightKg`/`packagingWeightKg`), schema Zod,
coluna `numeric(10,3)` e contrato admin↔ecommerce (`docs/integration/
admin-ecommerce.md`) permanecem em kg. O ecommerce não é tocado.

## Design

### Componente `WeightInput` (`apps/web/src/components/weight-input.tsx`)

`MaskedInput` + seletor de unidade (kg/g) colado à direita do input (grupo com borda
`border-input` compartilhada, seletor em `bg-card` com valor em `--primary`).

- **Contrato externo**: `value?: number` (kg), `onChange(kg: number | undefined)`,
  `defaultUnit: "kg" | "g"`, mais repasse de `id`/`aria-invalid`/`disabled` vindos do
  `LabeledField` (spread `{...field}` no input numérico, não no seletor).
- **Unidade é estado interno.** Modo g usa `integerMask` (gramas inteiras — resolução
  do banco é 1 g); modo kg usa `decimalMask`.
- **Trocar unidade converte o número exibido** (350 g ⇄ 0,35 kg); o valor emitido não
  muda no toggle.
- **Unidade inicial**: valor existente > 0 e < 1 kg abre em g; caso contrário,
  `defaultUnit` do campo (produto → kg, embalagem → g).
- **Hint de conversão**: em modo g, "= 0,35 kg"; em modo kg com valor < 1, "= 350 g".
  Renderizado via prop `hint` do `LabeledField` (a embalagem concatena o hint atual
  "Somado ao peso do produto no despacho.").
- Emite kg arredondado a 3 casas decimais (evita drift de float na ida-e-volta g→kg).
- Seletor com `aria-label="Unidade de peso"`. Foco/erro seguem no input numérico
  (`focusFirstError` e `aria-invalid` inalterados).

### Helpers puros (`apps/web/src/app/dashboard/tools/_lib/weight-unit.ts`)

`kgToDisplay(kg, unit)`, `displayToKg(n, unit)`, `initialUnit(kg, fallback)` —
extraídos pra `_lib` (regra do projeto: helper sync testável não vive em componente).

### Integração (`logistics-fields.tsx`)

Os dois campos passam a usar `WeightInput` dentro dos `LabeledField` existentes.
Labels perdem a unidade: "Peso" e "Peso da embalagem". Wizard e edição herdam juntos
via `tool-sections.ts` — nenhuma duplicação. `STEP_FIELDS`, `tool-schema.ts` e
`tool-form-state.ts` não mudam.

### Exibição (`apps/web/src/lib/format/number.ts` + `spec-rows.ts`)

Novo `formatWeight(value)`: ≥ 1 kg → `"2,5 kg"` (via `formatMeasure`); > 0 e < 1 kg →
`"350 g"`; 0 ou nulo → mesmo comportamento atual (`"0 kg"` / `"—"`). `spec-rows.ts` troca o `` `${formatMeasure(tool.weightKg)} kg` `` por
`formatWeight`. Demais superfícies que exibem peso migram se encontradas no plano.

### Testes (vitest, `environment: node`)

- `weight-unit.test.ts`: conversões ida-e-volta sem drift (350 g → 0.35 → 350 g),
  arredondamento a 3 casas, `initialUnit` nas bordas (0, 0.999, 1, undefined).
- `number.test.ts` (ou novo): `formatWeight` nas faixas g/kg e valores nulos.

## Fora de escopo (YAGNI)

- Miligrama (sem requisito real; exigiria migração + contrato).
- Unidade nas dimensões (cm cobre o catálogo inteiro).
- Preferência de unidade persistida por usuário.
- Mudança em `shipping-quote.ts`, caixas de envio ou qualquer superfície do ecommerce.

## Verificação de pronto

Funcional (testes dos helpers verdes + `bun verify`), perceptual (screenshot do passo
4 lado a lado com o mockup A aprovado), dados (cadastrar 350 g no browser e conferir
`packaging_weight_kg = 0.350` no banco e "350 g" no detalhe).

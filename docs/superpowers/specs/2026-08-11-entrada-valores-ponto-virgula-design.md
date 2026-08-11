# Entrada de valores: aceitar ponto e vírgula como separador decimal

Data: 2026-08-11 · Status: aprovado em brainstorm (escopo "3 campos + parser de milhar", modelo "texto tolerante")

## Problema

Dois defeitos independentes, um reportado e um silencioso.

**Reportado.** Em `/dashboard/tools/[id]?tab=variantes`, digitar `12,50` no preço de uma
variante devolve o toast "Preço inválido" e nada é salvo; `12.50` salva normalmente.
Reproduzido no browser em 2026-08-11 (`12,50` ❌, `12.50` ✅, `1.500` ❌, `100.00` ✅).
A cadeia: `variants-tab.tsx:350` é um `<Input>` de texto cru — sem máscara, ao contrário
do resto do app — que repassa a string bruta a `updateToolVariant`, onde
`tool-schema.ts:55-58` valida com `/^\d+(\.\d{1,2})?$/`. A regex exige ponto, a vírgula
não casa, o `safeParse` rejeita antes de qualquer query. Nada vira `NaN`, nada quebra:
é uma rejeição de validação cuja causa real (o separador) nunca é comunicada.

Só três campos do app fogem do padrão da casa assim:

| Campo | Arquivo | Sintoma com vírgula |
| --- | --- | --- |
| Preço inline de variante | `variants-tab.tsx:350` | "Preço inválido" |
| Teto do seguro de frete | `shipping-settings-form.tsx:170` | `Number()` → `NaN` → erro **enganoso** "Informe o teto do seguro", como se o campo estivesse vazio |
| Qtd. de picking | `picking-execution.tsx:336` | `type="number"` — o browser recusa a tecla, o caractere nem chega ao `value` |

**Silencioso, e pior.** `sanitizeDecimal` (`masks/decimal.ts:3-12`) troca **todo** ponto
por vírgula e mantém apenas a primeira, então separador de milhar colide com o decimal.
Executado contra os parsers reais do repo:

```
entrada    | decimalMask | brlMask | percentageMask
1.234,56   | 1.23456     | 1234.56 | 1.23456
1,234.56   | 1.23456     | 1234.56 | 1.23456
```

Peso, dimensões, specs numéricas e desconto percentual gravam um valor ~1000× menor sem
toast, sem erro de validação, sem sinal nenhum — inclusive ao **colar**. O bug reportado
ao menos bloqueia o salvamento; este mente em silêncio. `percentageMask` (`masks/
percentage.ts:5-18`) e as duplicatas `sanitizePercent`/`parsePercent` (`discount-format.ts:9-30`)
repetem o mesmo algoritmo e o mesmo defeito.

`brlMask` não é afetado: descarta todo separador e trata os 2 últimos dígitos como
centavos (modelo digit-shift), acertando `1.234,56` por construção do modelo.

## Decisão

**Um parser tolerante único**, com a regra "o último separador é o decimal; os anteriores
são milhar". Escolhido sobre o digit-shift (`brlMask`) porque é o que foi pedido — aceitar
ponto **e** vírgula —, preserva o hábito de quem hoje digita `100.00` na tabela, e é o
único modelo que também serve a peso (3 casas) e percentual, onde o digit-shift não se
aplica. O digit-shift permanece onde já está (criação de variante, desconto fixo): não
tem o bug e não será mexido.

Comportamento: o campo aceita qualquer coisa enquanto se digita e formata no blur.

## Design

### Parser (`apps/web/src/lib/masks/parse-decimal.ts`, novo)

```ts
parseLocaleNumber(display: string, maxFractionDigits: number): number | undefined
```

1. Descarta tudo que não seja dígito, `.` ou `,`.
2. Sem separador → `Number(digits)`.
3. Com separador → o **último** delimita a parte decimal; os anteriores são milhar e
   caem fora.
4. **Desempate da ambiguidade**: se há um **único** separador seguido de exatamente 3
   dígitos e `3 > maxFractionDigits`, ele é milhar, não decimal.
5. Casas decimais em excesso são **arredondadas** a `maxFractionDigits` (`1,2345` num
   campo de dinheiro → `1.23`). Sem isso o valor chegaria ao `numeric(10,2)` com mais
   precisão do que a coluna guarda e o banco arredondaria em silêncio — o mesmo tipo de
   divergência invisível que este spec existe para eliminar.
6. Entrada vazia ou sem dígito → `undefined`.

Resultados por campo, com a regra 4 em ação:

| Entrada | dinheiro (2 casas) | peso (3 casas) |
| --- | --- | --- |
| `12,50` / `12.50` | 12.5 | 12.5 |
| `1.234,56` / `1,234.56` | 1234.56 | 1234.56 |
| `1500` | 1500 | 1500 |
| `1.500` / `1,500` | **1500** (3 casas não existem em centavos → milhar) | **1.5** (3 casas são válidas → decimal) |
| `0,5` | 0.5 | 0.5 |

É o único ponto onde a mesma sequência de teclas significa coisas diferentes em campos
diferentes. Quem quiser 1500 kg digita `1500`; nenhuma ferramenta do catálogo pesa isso.

### Máscaras que passam a usar o parser

| Máscara | `maxFractionDigits` | Consumidores |
| --- | --- | --- |
| `decimalMask` (`masks/decimal.ts`) | 3 | peso, dimensões, specs numéricas, `WeightInput` |
| `percentageMask` (`masks/percentage.ts`) | 2 | desconto percentual, filtros de promoção |
| `sanitizePercent`/`parsePercent` (`discount-format.ts`) | 2 | `DiscountInput`, ramo percentual |
| `amountMask` (**novo**, `masks/amount.ts`) | 2 | dinheiro em texto livre; `format` produz `1.234,56` |
| `brlMask`, `integerMask` | — | **não mudam** |

`discount-format.ts` entra porque é o mesmo algoritmo copiado: consertar só
`percentageMask` deixaria o desconto de promoção quebrado. Isto é aplicar o fix nos dois
lugares, não consolidar as duplicatas — a consolidação fica fora de escopo.

O `sanitize` de `decimalMask`/`percentageMask` também muda: hoje ele reescreve a cada
tecla (é onde o milhar colapsa). Passa a apenas filtrar caracteres inválidos durante a
digitação, preservando `.` e `,` como digitados; o `format` no blur normaliza. O
contrato `Mask<T>` (`masks/index.ts`) e o `MaskedInput` não mudam.

### Os três campos fora do padrão

- **`variants-tab.tsx:350`** — `<Input>` → `MaskedInput mask={amountMask}`;
  `state.priceAmount` passa de `string` a `number | undefined`, e a comparação
  `state.priceAmount === initial.priceAmount` do `handleSave` (linha 216) acompanha.
- **`shipping-settings-form.tsx:170`** — `<Input>` → `MaskedInput mask={amountMask}`;
  `capAmount` vira `number | undefined` e o `Number(capAmount)` da linha 63 sai. É esse
  cast que hoje produz `NaN` e faz o zod disparar "Informe o teto do seguro" para um
  campo preenchido. Segue dentro do `LabeledField` com `{...field}`.
- **`picking-execution.tsx:336`** — `type="number"` → `MaskedInput mask={integerMask}`,
  preservando o clamp `min={1}`/`max={remaining}` na validação do dialog. Campo de
  quantidade inteira, onde vírgula não faz sentido; entra por consistência e é o
  primeiro item a cortar se o PR precisar encolher.

### Servidor

`updateVariantSchema.priceAmount` (`tool-schema.ts:55-58`) sai de
`z.string().regex(/^\d+(\.\d{1,2})?$/, "Preço inválido")` para
`z.number().nonnegative()`, alinhando com `toolVariantSchema`, que já usa `z.number()` na
criação. O client passa a enviar número, e o servidor deixa de adivinhar formato de
texto. `updateToolVariant` (`tools/actions.ts:544`) acompanha a mudança de tipo na
gravação em `tool_variant.price_amount numeric(10,2)`.

`shippingSettingsSchema.insuranceCapAmount` (`shipping-schema.ts:21-24`) permanece
`z.number()` — o que muda é o client parar de mandar `NaN`.

### Testes (vitest, `environment: node`)

- `masks/__tests__/parse-decimal.test.ts` — tabela por precisão (2 e 3 casas):
  `12,50`, `12.50`, `1.234,56`, `1,234.56`, `1500`, `1.500`, `0,5`, `""`, `"abc"`,
  `","`, `"1.2.3,4"`, `"1,2345"`. Inclui explicitamente o desempate da regra 4 e o
  arredondamento da regra 5 nas duas precisões.
- `masks/__tests__/amount.test.ts` — ida-e-volta `format`/`parse` sem drift.
- `lib/__tests__/discount-format.test.ts` (existente) — casos de milhar somados aos que
  já cobrem `sanitizePercent`/`parsePercent`; os testes atuais devem seguir verdes.

## Fora de escopo (YAGNI)

- Consolidar as duplicatas `discount-format.ts` ↔ `masks/percentage.ts`/`currency-brl.ts`
  (ambas recebem o fix; unificar é refactor à parte).
- Regra ast-grep barrando `<Input>` cru em campo de valor — considerada e descartada
  nesta rodada por custo e falso-positivo.
- Migrar `brlMask`/digit-shift para o modelo tolerante (criação de variante e desconto
  fixo seguem como estão).
- Dependência externa de máscara (`react-number-format`, `imask`): a camada `Mask<T>`
  já cobre o caso e puxar lib faria dois padrões coexistirem.
- Formatação de exibição fora de forms (`formatMeasure`, `formatWeight`), que já está
  correta.

## Verificação de pronto

Funcional: testes novos verdes + `bun verify`. Perceptual: screenshot da aba Variantes e
do form de frete comparados ao padrão irmão. Dados: no browser, salvar `12,50` e
`1.234,56` no preço de uma variante `EM-TEST-*` e conferir `price_amount` no banco,
revertendo ao valor original ao fim.

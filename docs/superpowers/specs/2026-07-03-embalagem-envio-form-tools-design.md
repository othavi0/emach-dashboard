# Embalagem & envio no form de tools (escopo C do #287)

> Design doc — 2026-07-03. Status: aprovado para virar plano de implementação.
> Follow-up do PR #288, entregue no MESMO branch/PR (`issue-frenet`).
> Fecha o gap funcional: o checkout Frenet do ecommerce lê `tool.packagingWeightKg`,
> `tool.stackable` e `tool.shipsInOwnBox` na consolidação em caixas (`packItems`),
> mas nenhuma UI do dashboard escreve esses campos — todo tool vive nos defaults
> (0 / true / false). Inclui o substituto correto do antigo warning de 30kg.

## 1. Contexto

O que cada campo faz no algoritmo vivo (`packages/db/src/queries/shipping-quote.ts`):

- `packagingWeightKg` — peso de despacho = `weightKg + packagingWeightKg`; entra no
  limite de peso da caixa e no peso cotado na Frenet. Zerado = frete subcotado para
  itens com proteção pesada.
- `stackable` — `false` reserva a coluna inteira acima do item (footprint × altura
  interna da caixa) na consolidação de volume.
- `shipsInOwnBox` — `true` = a unidade vira pacote próprio com as próprias dims;
  nunca vira "a combinar".

Regra de "a combinar" real (relida do `packItems`): para uma unidade sozinha, o
algoritmo tenta **todas** as caixas ativas (menor→maior via `boxesAsc.find`); só é
`outOfCatalog` se **nenhuma** serve. O warning do form usa essa regra — "não cabe
em nenhuma caixa de envio ativa" — não "maior caixa" nem o antigo teto 30kg/100cm.

Decisão de layout (mockups no visual companion, usuário escolheu **A**): subseção
fixa "Embalagem & envio" sempre visível no step Logística — 1 campo numérico +
2 switches + warning condicional. Colapsável foi rejeitado (esconder o dado foi o
que criou o gap).

## 2. Form (wizard e edit compartilham os módulos — `tool-sections.ts`/`use-tool-submit.ts` intocados)

- `tools/_components/tool-schema.ts` — `toolFormSchema` ganha:
  - `packagingWeightKg`: número não-negativo, default 0 (aceitar NaN→0 no estilo
    dos helpers existentes);
  - `stackable`: `z.boolean().default(true)`;
  - `shipsInOwnBox`: `z.boolean().default(false)`.
- `tools/_components/tool-form-state.ts` — `ToolFormState` trata
  `packagingWeightKg` como `number | undefined` (mesmo padrão de `weightKg`);
  `EMPTY_TOOL_VALUES` += `packagingWeightKg: undefined`, `stackable: true`,
  `shipsInOwnBox: false`.
- `tools/_components/tool-form-steps.ts` — `STEP_FIELDS.logistics` += os 3 campos
  (o assert type-level `_stepFieldsAreExhaustive` obriga).
- `tools/_components/fields/logistics-fields.tsx` — subseção "Embalagem & envio"
  abaixo do grid de 5 campos:
  - `LabeledField` + `MaskedInput` (`decimalMask`) "Peso da embalagem (kg)",
    placeholder "0", hint "Somado ao peso do produto no despacho.", `HelpTooltip`
    (espuma/proteção; despacho = produto + embalagem).
  - `Switch` "Empilhável" (default on) + `HelpTooltip` — pode ir sobre/sob outros
    itens na consolidação; desligado reserva a coluna da caixa.
  - `Switch` "Viaja na própria embalagem" (default off) + `HelpTooltip` — não
    consolida com outros itens; usa as próprias dimensões na cotação (ex.: item
    de 180cm).
  - Switches ficam FORA de `LabeledField` (convenção do repo para controles
    booleanos), com label própria via `<Label>`.
- `tools/_lib/tool-query-helpers.ts` — `normalizeToolPayload` +=
  `packagingWeightKg: (input.packagingWeightKg ?? 0).toFixed(3)`,
  `stackable: input.stackable`, `shipsInOwnBox: input.shipsInOwnBox`.
- `tools/[id]/edit/page.tsx` — hidratação dos 3 a partir do row
  (`Number(row.packagingWeightKg)`, booleans diretos).

## 3. Warning "não cabe em nenhuma caixa de envio ativa"

- **Dados:** `tools/new/page.tsx` e `tools/[id]/edit/page.tsx` chamam
  `getActiveBoxes(db)` (`@emach/db/queries/shipping` — server-side, permitido) e
  passam `QuoteBox[]` (5 números + id por caixa) como prop até `LogisticsFields`.
- **Helper puro novo:** `tools/_lib/fits-shipping-box.ts` — sem imports de runtime
  de `@emach/db` (client-safe; `import type { QuoteBox }` é permitido, apagado no
  compile). Replica a regra por unidade do `packItems`:
  `fitsAnyBox(item, boxes)` = existe caixa com (a) dims ordenadas desc do item ≤
  dims ordenadas desc da caixa (rotação), (b) `weightKg + packagingWeightKg +
  tareWeightKg ≤ maxWeightKg`, (c) volume do item ≤ volume interno × 0.9
  (FILL_FACTOR local, mesma constante).
- **Render:** no `LogisticsFields`, quando peso+dims preenchidos ∧
  `shipsInOwnBox === false` ∧ `!fitsAnyBox(...)` → box de aviso (mesmo estilo
  visual do antigo: borda/fundo `warning`, ícone `TriangleAlert`):
  *"Não cabe em nenhuma caixa de envio ativa — na loja este item aparece como
  'Frete a combinar'. Se ele viaja em embalagem própria, ligue a opção acima."*
- **Edge:** lista de caixas vazia → mesmo aviso (fiel: sem catálogo, tudo é
  `outOfCatalog`). `shipsInOwnBox` ligado → nunca avisa.
- É aviso informativo, **não** bloqueia submit.

## 4. Detalhe do tool

`tools/[id]/_components/overview-tab.tsx`, card "Logística & metadados", 2 linhas
novas via `MetaRow`:

- "Embalagem": `+X kg` via `formatMeasure` quando `packagingWeightKg > 0`; `—`
  quando 0.
- "Envio": `"Embalagem própria"` se `shipsInOwnBox`; senão `"Consolida em caixa"`;
  sufixo `" · não empilhável"` quando `stackable === false`.

## 5. Testes e verificação

- Unit `tools/_lib/__tests__/fits-shipping-box.test.ts`: cabe na menor; cabe só
  com rotação; estoura dimensão em todas; estoura peso (com tara) na única que
  caberia por dims; lista vazia → false; fill factor (volume > 90%) → false.
- Zod: defaults dos 3 campos quando ausentes do input.
- `bun verify` + `bun run build` não exigido (nenhum arquivo `"use server"`
  refatorado — actions de tools só ganham campos no payload via helper).
- Smoke `:3007`: criar/editar tool preenchendo os 3 campos e confirmar
  persistência; warning dispara com dims artificiais (ex.: 200×80×80) e some ao
  ligar "viaja na própria embalagem"; overview mostra as linhas novas.

## 6. Entrega

Commits no branch `issue-frenet` (Conventional Commits PT ≤50 chars); push
atualiza o PR othavi0/emach-dashboard#288; adicionar seção "Embalagem & envio no
form" ao corpo do PR via `gh pr edit`.

## 7. Não-objetivos

- Mudar o algoritmo `packItems`/superfície sincronizada (ADR-0009) — o helper do
  warning é cópia local client-safe, não refactor do motor.
- Backfill dos 11 tools existentes (ficam nos defaults; operador ajusta caso a
  caso pela UI nova).
- Editor/preview de empacotamento no dashboard.

## 8. Riscos

- **Divergência helper × packItems:** a regra é duplicada por necessidade
  (client-safe). Mitigação: teste unit espelha os casos do
  `shipping-quote.test.ts` e comentário no helper aponta a fonte canônica.
- **Hook auto-format:** `bun fix` pós-Edit pode reordenar campos e invalidar
  `old_string` — re-ler antes de re-tentar (padrão da casa).

# Simplificação do frete: remoção de config morta + fix do drawer de caixas + delete

Data: 2026-07-29 · Aprovado em sessão pelo user.

## Contexto (verificado)

- O checkout do ecommerce chama `packItems(items, boxes)` **sem opts** e não seleciona
  `tool.upright_only` — logo `shipping_fill_factor`, `shipping_box_padding_cm` e
  `upright_only` **não afetam a cotação real**. São config/flag mortos.
- `shipping_box` estava vazio: toda cotação saía "Frete a combinar".
- Drawer de caixas: campos numéricos nascem com `0` (padrão canônico do form de
  ferramenta é vazio + placeholder); label "Comprimento (cm)" quebra em 2 linhas.
- Não existe delete de caixa (nenhuma FK referencia `shipping_box`).

## Decisões (user)

1. **Remover de vez** `fillFactor` + `boxPaddingCm` (UI + colunas).
2. **Remover de vez** `uprightOnly` (form + motor + coluna).
3. Cadastrar trio de caixas **P/M/G** (30×20×15 10kg 0,3 · 40×30×25 20kg 0,6 · 60×40×40 30kg 1,2).
4. **Delete de caixa** com AlertDialog de confirmação; switch "Ativa" permanece.

## Design

### Motor (`packages/db/src/queries/shipping-quote.ts`)

- `PackOptions` deixa de existir; `packItems(items, boxes)` usa `FILL_FACTOR = 0.9`
  interno (constante documentada). Sem padding no `emitPackage`.
- `QuoteItem` perde `uprightOnly`; `fitsByDims`/`footprint` só com rotação livre.
- Espelho client-safe `apps/web/.../fits-shipping-box.ts` idem. Testes dos dois lados.

### Settings (`store-settings`)

- Schema TS e `getShippingSettings` perdem `shippingFillFactor`/`shippingBoxPaddingCm`
  (+ checks). UI: seção "Empacotamento" some do form e do preview rail;
  `shippingSettingsSchema` e `updateShippingSettings` idem.

### Tool

- Coluna `upright_only` sai do schema TS; switch sai de `logistics-fields.tsx`;
  limpar `tool-schema`, `tool-form-state`, `tool-form-steps`, `tool-query-helpers`,
  `overview-tab` (" · este lado para cima"), `shipping/data.ts`.

### ⚠️ Drop físico das colunas: DEFERIDO (banco compartilhado)

O ecommerce **deployado** ainda seleciona `shipping_fill_factor`/`shipping_box_padding_cm`
(via `getShippingSettings`) e o código antigo de ambos os apps pode selecionar
`tool.upright_only` via `select().from(tool)`. Dropar agora quebra os apps no ar.

**NÃO rodar `bun db:sync` até o momento coordenado** (o push proporia o drop).
Sequência: merge aqui → PR de sync no ecommerce (CI ajusta o teste que referencia
`fillFactor`) → deploy dos dois apps → então:

```sql
ALTER TABLE store_settings
  DROP COLUMN shipping_fill_factor,
  DROP COLUMN shipping_box_padding_cm;
ALTER TABLE tool DROP COLUMN upright_only;
```

### Drawer de caixas

- Form state com `number | undefined` (novo tipo local, como o form de ferramenta);
  campos nascem vazios com placeholder; zod continua exigindo > 0 no submit.
- Labels da grade de dimensões sem quebra de linha (abreviar "Compr. (cm)").
- `deleteBox` server action (`shipping.manage` + `logUserActivity` + `revalidatePath`);
  botão "Excluir" no rodapé do drawer de edição (esquerda, variant não-coral) com
  `AlertDialog` controlado. `EntityEditSheet` ganha prop opcional `footerStart`.

### Docs

`docs/integration/admin-ecommerce.md`: remover fillFactor/boxPaddingCm/uprightOnly e
corrigir a seção desatualizada (o storefront JÁ usa `getShippingSettings` p/ origem+seguro).

### Verificação

`bun verify` + `bun run build` (mexe em `actions.ts` "use server") + smoke visual:
criar P/M/G, editar uma, deletar uma descartável, form de ferramenta sem o switch,
warning "não cabe" sumindo. Fora de escopo: hydration mismatch do `NavigationAnnouncer`
(reportar como issue).

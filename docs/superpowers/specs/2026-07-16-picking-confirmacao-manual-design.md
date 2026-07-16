# Picking: confirmação manual de item (issue #325)

Data: 2026-07-16 · Status: aprovado

## Problema

O matching da bipagem é exclusivamente por barcode (`separacao/_lib/picking-logic.ts` → `matchPickItem`). Quando a etiqueta física está ilegível/danificada — ou a variante é legada sem barcode — o operador tem o item na mão mas a única saída é "Item não encontrado" (`reportMissing`), um falso-negativo obrigatório que força a sessão para `exception`.

## Decisões

- **Qty > 1:** dialog único com campo de quantidade (default = restante, max = restante). Insere 1 registro de scan por unidade com o mesmo motivo — auditoria por unidade preservada para o relatório de produtividade (#324) e cobre o caso misto (parte rasgada confirma manual, parte ausente vai de `reportMissing`).
- **Marcador no scan log:** coluna booleana autoritativa (`manual`), não só sentinel em `scannedCode`. O sentinel `"manual"` entra em `scannedCode` (notNull) apenas como valor legível.
- **Paridade com re-bipe:** confirmação manual limpa `notFound` (mesma semântica do scan que resolve pendência) e atualiza `lastScannedAt`.

## Design

### 1. Schema — `packages/db/src/schema/orders.ts` (`orderPickingScan`)

Colunas aditivas:

- `manual: boolean("manual").notNull().default(false)`
- `manualReason: text("manual_reason")` (nullable; preenchido só quando `manual = true`)

Aplicação via `bun db:sync` (push-only, ADR-0006). Aditivo → seguro no banco compartilhado; sync TS pro ecommerce sai no CI PR automático (ADR-0009).

### 2. Server action — `confirmItemManually(pickingItemId, qty, reason)` em `separacao/actions.ts`

Espelho estrutural de `reportMissing`:

1. Carrega `orderPickingItem` → `orderPicking`.
2. `lockOrderAndAuthorize(tx, "orders.pick", orderId)`.
3. `assertInProgress(picking)` + `assertOwner(picking, session.user)`.
4. Guard `autoCancelIfOrderLeftPreparing` (mesmo contrato do PR #319: retorna erro amigável sem throw).
5. Validações: `reason.trim().length >= 10`; `qty` inteiro, `1 <= qty <= qtyExpected - qtyPicked`.
6. Efeitos: `qtyPicked += qty`, `notFound = false`, `lastScannedAt = now`; insere `qty` registros em `orderPickingScan` com `manual: true`, `manualReason: reason`, `scannedCode: "manual"`, ator da sessão.
7. `revalidatePickingPaths(orderId)` no fim (não é hot-path como `scanItem`).

Retorno: `ActionResult<{ qtyPicked: number; qtyExpected: number }>`. Catch padrão: `logger.error` + `isCapabilityError` + mensagem amigável.

### 3. UI — `picking-execution.tsx` (`FocusCard`)

- Botão secundário `outline` "Confirmar sem bipar" ao lado de "Item não encontrado" (não é destrutivo — action do dialog com estilo default, não vermelho).
- `AlertDialog` com Textarea de motivo (mínimo 10 chars, hint de mínimo como no `DestructiveActionDialog`) + campo de quantidade com default = restante, oculto quando restante = 1.
- No sucesso: atualiza `localItems` (qtyPicked, `notFound: false`) e re-foca o próximo item incompleto — mesma mecânica do scan aceito.

### 4. Testes — `__tests__/picking-actions.test.ts` (padrão `makeMockTx`)

- Happy path: confirma o restante, item completo, N registros de scan com `manual: true` e `manualReason`.
- Motivo < 10 chars rejeitado; `qty` fora de `1..restante` rejeitado.
- Limpa `notFound` de item antes reportado ausente.
- Guard de owner (outro usuário não confirma).
- Guard de pedido que saiu de `preparing` (sessão auto-cancelada, erro amigável).

## Critérios de aceite (da issue)

- Item com etiqueta rasgada é confirmado com motivo e a sessão fecha `completed` (não `exception`).
- O scan log distingue manual de bipado (`manual: true` + `manualReason`).
- Testes seguem o padrão de `picking-actions.test.ts` (makeMockTx).

## Fora de escopo

- UI de leitura do scan log (nada renderiza scans hoje; fica pro #324).
- Mudanças no fluxo de `reportMissing`.

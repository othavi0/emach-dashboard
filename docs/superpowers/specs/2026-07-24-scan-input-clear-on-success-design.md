# ScanInput: limpar só no sucesso

Data: 2026-07-24 · Status: aprovado em brainstorming (abordagem A)

## Contexto

Após bip (Enter), colar ou leitura por pistola, o `ScanInput` **sempre**
limpava o valor (`setValue("")` antes/ao chamar `onScan`). Isso é o padrão
clássico de warehouse (campo livre pro próximo bip), mas no fluxo com digitação
ou colar é **contra-intuitivo**: o operador perde o que acabou de enviar —
sobretudo quando o código é rejeitado e ele quer corrigir.

Decisão: limpar **somente** quando o bip for bem-sucedido; em erro, manter o
texto e **selecionar tudo** para o próximo bip do leitor **substituir**, nunca
concatenar.

## Comportamento

| Resultado | Input | Detalhe |
| --- | --- | --- |
| `accepted` | limpa | Pronto pro próximo |
| `already_complete` | limpa | Código válido; item já completo |
| `not_in_order` | mantém + `select()` | Ver/corrigir; próximo bip sobrescreve |
| Action error (`!result.ok`) | mantém + `select()` | Idem |
| Código vazio (só whitespace) | não chama `onScan` | Como hoje |

## Contrato `ScanInput`

```ts
onScan: (code: string) => void | Promise<"clear" | "keep">
```

Fluxo de `submit(raw)`:

1. `code = normalizeScanCode(raw)`; se vazio, return.
2. Marca busy (serializa submits; Enter/paste extras no-op enquanto pendente).
3. **Não** limpa ainda.
4. `outcome = await Promise.resolve(onScan(code))`.
5. Se `outcome === "keep"`: `setValue(code)` + `select()` no input (garante valor
   após paste com `preventDefault`).
6. Caso contrário (`"clear"` ou `undefined` legada): `setValue("")` + focus.
7. Libera busy.

Paste: continua `preventDefault` + `submit(clipboardText)`.

Hint: pode mencionar “em erro o código fica selecionado” se couber em uma linha;
não obrigatório.

## `handleScan` (picking-execution)

- Processa **um** `code` por chamada e retorna `"clear" | "keep"`.
- `accepted` / `already_complete` → atualiza estado local como hoje → `"clear"`.
- `not_in_order` → feedback como hoje → `"keep"`.
- `!result.ok` → `notify.error` → `"keep"`.

### Serialização / fila de bip rápido

Hoje o pai tem `queueRef` + `drainingRef` para bip em rajada. Com `ScanInput`
fazendo `await onScan`:

- **ScanInput** serializa com flag busy (ou fila local curta): um `onScan` por
  vez até o await resolver.
- **Pai** processa um código por chamada; a fila multi-código no pai **pode**
  ser removida se o ScanInput serializar, **ou** mantida se for mais barato
  deixar o pai drenar — desde que cada código da fila produza um outcome e o
  ScanInput só aplique clear/keep do **último** bip daquele submit (um submit =
  um code). Preferência de implementação: **um code por `onScan`**, serialização
  no ScanInput; remover queue do pai se ficar morta.

## Arquivos

| Arquivo | Mudança |
| --- | --- |
| `separacao/_components/scan-input.tsx` | Outcome async; busy; clear/keep + select |
| `separacao/_components/picking-execution.tsx` | `handleScan` → `"clear" \| "keep"` |
| Testes de `normalizeScanCode` / mapping se extrair helper | Ajustar/estender |

Sem mudança de server action, schema ou match de barcode.

## Aceite

1. Bip aceito → input vazio, foco mantido.
2. Fora do pedido → código permanece e fica selecionado.
3. Erro de action → código permanece e fica selecionado.
4. Já completo → limpa.
5. Após erro, próximo bip do leitor **substitui** (não concatena).
6. Paste sucesso limpa; paste erro mantém.

## Fora de escopo

- Faixa “último bip” separada do input.
- Debounce / auto-submit por comprimento.
- Mudança de anti-cola de barcode na checklist.
- Strip de barcode no payload.

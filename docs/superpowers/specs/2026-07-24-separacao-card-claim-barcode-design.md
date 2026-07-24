# Separação: card = claim, barcode oculto, paste no bip

Data: 2026-07-24 · Status: aprovado em brainstorming (abordagem A)

## Contexto

Dois atritos reais na operação de separação, mais um polish no campo de bip:

1. **Card ≠ Separar.** Em `/dashboard/separacao` (tab A separar), o card é um
   `<Link>` para `/dashboard/separacao/[orderId]`. Só o CTA "Separar" chama
   `startPicking` e depois navega. Clicar no card cai na tela intermediária
   `StartPicking` ("Nenhuma separação em andamento… Iniciar separação") — legada
   e redundante: o operador já expressou a intenção de separar.
2. **Barcode visível na execução.** Em `picking-execution.tsx`, o código de barras
   do item aparece no `FocusCard` e na checklist à direita. O operador pode copiar
   o valor e digitar/colar no campo de bip em vez de conferir a peça física.
3. **Colar no bip não valida.** `ScanInput` só submete no Enter. Colar o código
   deixa o valor no input sem ação até o Enter manual.

Decisões de brainstorming: abordagem **A** (auto-claim no client + card
unificado); **remover `StartPicking` por completo**; reabertura de exceção também
auto-claima quando o ator tem permissão; barcode some **só da UI** (não strip do
payload); colar = submete na hora; digitar continua com Enter.

Nada disto muda schema, match de barcode no server, guards de posse
(`exceptionResumeDenial`, 23505), nem "Confirmar sem bipar".

## 1. Fila — card = claim (tab A separar)

Arquivo: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`.

- Em **A separar**, o card inteiro roda o mesmo handler do CTA atual:
  1. `startPicking(orderId)`
  2. se `ok` → `router.push(/dashboard/separacao/{orderId})`
  3. se erro → `notify.error`, **não** navega
- Um único handler; o rodapé "Separar" vira reforço visual / atalho de teclado,
  sem navegação paralela via `Link` "burro".
- Em **modo bulk/seleção** (`SelectableItem` ativo), o clique no card continua
  só selecionando — **não** claima.
- Tabs **Em separação** / **Exceções**: card permanece `Link` para a rota
  (retomar própria sessão; reabrir exceção via auto-claim na rota; alheio →
  readonly / bloqueio).

## 2. Rota — AutoClaim no lugar de StartPicking

Arquivos:

- **Novo:** `separacao/_components/auto-claim-picking.tsx`
- **Removido:** `separacao/_components/start-picking.tsx`
- **Ajuste:** `separacao/[orderId]/page.tsx`

### Matriz de render da rota (inalterada nos ramos de execução)

| Estado | Render |
| --- | --- |
| Dono + `in_progress` ou `completed` (pedido `preparing`) | `PickingExecution` |
| Dono + `completed` + pedido saiu de `preparing` | `PickingDispatched` |
| Outro + `in_progress` | `PickingReadonly` |
| Sem sessão acionável **ou** última sessão `exception`/`canceled`/null, e ator **pode** claimar | `AutoClaimPicking` |
| Idem, ator **não pode** (exceção alheia + role `user`) | Mensagem de bloqueio (sem botão, sem loop) |

### `AutoClaimPicking` (client)

Props: `orderId`; `canStart: boolean`; `exceptionContext` opcional (só para
copy enquanto inicia — **sem** confirmação).

- Se `!canStart`: render só do bloqueio (texto atual de posse de exceção).
- Se `canStart`: no mount, **uma** chamada a `startPicking(orderId)`:
  - ok → `router.refresh()` (RSC re-renderiza em `PickingExecution`)
  - erro → toast + link "Voltar à fila"; **não** retenta em loop
- Guard `useRef` ("já disparou") para Strict Mode não dobrar o claim.
- UI: spinner / "Iniciando separação…" (e, se reopen, linha curta sobre a
  exceção anterior — informativa, sem botão).

Side-effect **não** roda no GET do Server Component: a mutação continua na
server action, disparada pelo client (padrão existente do CTA da fila).

## 3. Barcode oculto na execução

Arquivo: `separacao/_components/picking-execution.tsx`.

| Superfície | Depois |
| --- | --- |
| `FocusCard` | Nome + tensão; **sem** span do barcode |
| `ChecklistItemRow` | Linha secundária só com tensão, se houver; se não houver tensão, omite o `<p>` secundário (não deixa `—` no lugar do barcode) |
| Estado `exc` | Continua "Falta reportada · em exceção" |

**Inalterado:**

- `variantSnapshot.barcode` no DB e no match server (`scanItem` / `matchPickItem`)
- `LocalItem.barcode` pode permanecer no estado client (não stripamos o payload RSC neste passo — anti-cola de tela, não forense DevTools)
- "Confirmar sem bipar" com motivo auditado
- `PickingReadonly` e painel de conclusão

## 4. ScanInput — paste submete

Arquivo: `separacao/_components/scan-input.tsx`.

```
onPaste:
  preventDefault
  code = clipboardData.getData("text").trim()
  se vazio → return
  limpa input
  onScan(code)
  re-foco (mesmo padrão do Enter)
```

- Digitação + **Enter** → inalterado.
- Leitor USB (digita + Enter) → inalterado.
- Hint: algo como  
  `Foco automático · leitor dá Enter sozinho · colar também valida na hora`.

**Fora:** debounce ao digitar; auto-submit por comprimento mínimo.

## 5. Arquivos tocados (checklist de implementação)

| Arquivo | Ação |
| --- | --- |
| `separacao/_components/picking-order-card.tsx` | Card A separar = claim |
| `separacao/_components/start-picking.tsx` | Remover |
| `separacao/_components/auto-claim-picking.tsx` | Criar |
| `separacao/[orderId]/page.tsx` | Trocar StartPicking → AutoClaimPicking |
| `separacao/_components/picking-execution.tsx` | Esconder barcode na UI |
| `separacao/_components/scan-input.tsx` | onPaste + hint |
| Testes sob `separacao/__tests__/` / `_components` | Ajustar imports; cobrir paste / auto-claim se o padrão do módulo permitir mock leve |

Sem mudança em `actions.ts` (claim), schema, ou capabilities.

## 6. Critérios de aceite

1. Em A separar, clique no card (fora do bulk) inicia separação e abre a execução
   **sem** tela "Iniciar separação".
2. CTA "Separar" no card tem o **mesmo** efeito.
3. Deep-link `/dashboard/separacao/{id}` sem sessão própria claima sozinho
   (inclui reabertura de exceção com permissão).
4. Exceção alheia + role `user` → só bloqueio, sem loop de claim.
5. Durante a execução, nenhum barcode de produto aparece no foco nem na checklist.
6. Colar código no campo de bip valida na hora; digitar + Enter e leitor com Enter
   continuam ok.
7. Race de claim (outro operador / 23505) → toast, sem navegar e sem retry
   infinito no auto-claim.

## 7. Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Strict Mode monta 2× | `useRef` "já disparou"; `startPicking` já trata corrida (23505) |
| Flash "Iniciando…" no deep-link | Aceito na abordagem A; copy curto |
| Bulk mode claima ao clicar | Claim só fora do modo seleção do `SelectableItem` |
| Barcode ainda no DevTools / RSC | Escopo consciente; strip de payload = follow-up |

## 8. Fora de escopo

- Strip de `barcode` no props/JSON enviado ao client
- Debounce ou auto-submit por N dígitos
- Mudança em picking-list PDF, detalhe do pedido, ou catálogo de ferramentas
- Remover "Confirmar sem bipar"
- Side-effect de claim no Server Component (GET)

## 9. Testes e verificação

- Ajustar qualquer teste que importe `StartPicking` ou assuma navegação sem claim.
- Preferir teste unitário do handler de paste do `ScanInput` se for barato isolar;
  senão smoke manual nos critérios 5–6.
- Smoke: A separar → clique no card → execução direta; deep-link de pedido a
  separar e de exceção própria; exceção alheia com role user; bip por Enter e por
  colar; inspeção visual sem barcode na execução.
- `bun verify` (ou ao menos `check-types` + `check` no pacote web) antes de
  considerar pronto.

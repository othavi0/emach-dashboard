# Plan 029: Decompor BranchStockEditSheet em três sub-forms testáveis

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- \
>   apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx \
>   apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts \
>   apps/web/src/app/dashboard/tools/\[id\]/_components/estoque-tab.tsx \
>   apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`BranchStockEditSheet` é um Client Component de 986 linhas com três modos de
formulário (entrada/baixa/ajuste), painel de movimentos e edição de limites,
todos no mesmo escopo — exigindo um `biome-ignore noExcessiveCognitiveComplexity`
na linha 249. Os três corpos de form têm schema Zod próprio mas não têm testes.
Extrair cada corpo para um componente irmão isolado elimina a supressão de lint,
torna cada sub-form testável independentemente e reduz a carga cognitiva de quem
precisar evoluir um dos modos sem entender os outros dois. Nenhuma mudança de
comportamento ou UX é introduzida.

## Current state

### Arquivos envolvidos

- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`
  — componente monolítico de 986 linhas; contém os três formulários inline,
  handlers de submit, estado local para cada modo, `MovementsCard`, `StatCard`,
  `SupplierCombobox` e a lógica de abertura do Sheet.

- `apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts`
  — schemas Zod e tipos para os três modos:
  - `stockEntrySchema` / `StockEntryInput` (L38–51)
  - `stockWriteOffSchema` / `StockWriteOffInput` (L57–79): tem refine cross-field
    (`reason === "outro"` → `note` obrigatório); `_form` não é usado aqui — o
    refine aponta para `path: ["note"]`
  - `stockRecountSchema` / `StockRecountInput` (L82–94)

- `apps/web/src/app/dashboard/stock/_components/stock-threshold-schema.ts`
  — schema de limites (separado dos schemas de movimentação):
  - `stockThresholdSchema` / `StockThresholdInput` (L1–23): tem refine
    `reorderPoint >= minQty`

- `apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx`
  — call-site 1 (L55–63): usa `lead` padrão (`"tool"`):
  ```tsx
  // branch-stock-infinite.tsx:55-63
  <BranchStockEditSheet
    branchId={branchId}
    branchName={branchName}
    canMutate={canMutate}
    onClose={() => setSelectedRow(null)}
    row={selectedRow}
    suppliers={suppliers}
  />
  ```

- `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx`
  — call-site 2 (L85–93): passa `lead="branch"`:
  ```tsx
  // estoque-tab.tsx:85-93
  <BranchStockEditSheet
    branchId={selected?.branchId ?? ""}
    branchName={selected?.branchName ?? ""}
    canMutate={canMutate}
    lead="branch"
    onClose={() => setSelected(null)}
    row={selectedRow}
    suppliers={suppliers}
  />
  ```

### Trechos de ancoragem no arquivo a decompor

```tsx
// branch-stock-edit-sheet.tsx:249
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sheet de edição de estoque com três modos (entrada/baixa/ajuste), limites e histórico; complexidade inerente ao domínio

// branch-stock-edit-sheet.tsx:239-247 (props do shell)
interface BranchStockEditSheetProps {
  branchId: string;
  branchName: string;
  canMutate: boolean;
  lead?: "branch" | "tool";
  onClose: () => void;
  row: BranchStockRow | null;
  suppliers: ActiveSupplierOption[];
}

// branch-stock-edit-sheet.tsx:262-289 (estado modo + erros)
const [mode, setMode] = useState<Mode>("entrada");
const [qty, setQty] = useState<number | undefined>(undefined);
const [supplierId, setSupplierId] = useState<string>("");
const [writeOffReason, setWriteOffReason] = useState<StockWriteOffReason>("perda");
const [targetQty, setTargetQty] = useState<number | undefined>(undefined);
const [note, setNote] = useState("");
// três useFormErrors<T>(), um por modo (entradaErrors / baixaErrors / ajusteErrors)

// branch-stock-edit-sheet.tsx:332-363 — handleEntradaSubmit (safeParse + startAdjustTransition)
// branch-stock-edit-sheet.tsx:365-396 — handleBaixaSubmit
// branch-stock-edit-sheet.tsx:398-428 — handleAjusteSubmit
// branch-stock-edit-sheet.tsx:616-689 — JSX form entrada (mode === "entrada")
// branch-stock-edit-sheet.tsx:691-774 — JSX form baixa  (mode === "baixa")
// branch-stock-edit-sheet.tsx:776-832 — JSX form ajuste (mode === "ajuste")
```

### Convenções que este plano deve honrar

**Forms:** `useFormErrors<T>()` de `src/lib/use-form-errors.ts` —
`reportValidationError(zodError)` = setErrors + toast + foco; `clearErrors()`
ao resetar. Cada campo inválido usa `<LabeledField error={errors.X} ...>` de
`@/components/labeled-field`. Ver `apps/web/CLAUDE.md` (seção "Convenções de UX
em forms").

**Anti-patterns banidos** (raiz `CLAUDE.md`): `: any` / `as any` / `@ts-ignore`;
`key={index}`; `React.forwardRef`; `useMemo`/`useCallback` manuais; `console.*`.

**Testes:** vitest, `environment: node`; sem mock de `@emach/db` neste caso (os
sub-forms são Client Components puros — lógica testável é a validação Zod inline,
não o submit em si). Estrutura igual ao existente em
`apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts`:
`import { describe, expect, it } from "vitest"`.

**"use client":** os três novos componentes são Client Components — manter a
diretiva no topo.

## Commands you will need

| Purpose        | Command                                                              | Expected on success      |
|----------------|----------------------------------------------------------------------|--------------------------|
| Typecheck      | `bun check-types`                                                    | exit 0, sem erros        |
| Lint           | `bun check`                                                          | exit 0                   |
| Testes (todos) | `bun --cwd apps/web test`                                            | verde (≥359 testes base) |
| Testes (stock) | `bun --cwd apps/web test src/app/dashboard/stock`                    | verde                    |
| Guard forms    | `bun guard:forms`                                                    | exit 0                   |
| Build          | `bun run --cwd apps/web build`                                       | exit 0                   |

## Scope

**In scope** (os únicos arquivos que você deve criar ou modificar):

- `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`
  — transformar em shell fino; remover biome-ignore quando a complexidade cair
- `apps/web/src/app/dashboard/stock/_components/stock-entry-form.tsx` (criar)
- `apps/web/src/app/dashboard/stock/_components/stock-write-off-form.tsx` (criar)
- `apps/web/src/app/dashboard/stock/_components/stock-recount-form.tsx` (criar)
- `apps/web/src/app/dashboard/stock/_components/__tests__/stock-movement-schemas.test.ts`
  (criar)

**Out of scope** (NÃO tocar, mesmo que pareça relacionado):

- `apps/web/src/app/dashboard/stock/_components/stock-movement-schema.ts` —
  schemas já corretos; não alterar.
- `apps/web/src/app/dashboard/stock/_components/stock-threshold-schema.ts` —
  schema de limites; não alterar.
- `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx` — call-site
  que apenas usa o shell; não requer mudança.
- `apps/web/src/app/dashboard/stock/_components/branch-stock-infinite.tsx` —
  idem.
- Qualquer mudança de comportamento, UX, layout ou output das server actions.
- `plans/README.md` — um agente dedicado mantém o índice; não tocar.

## Git workflow

- Branch: `advisor/029-decompose-branch-stock-edit-sheet`
- Commits Conventional Commits em PT, subject ≤ 50 chars. Exemplos coerentes
  com o histórico do repo:
  - `refactor(stock): extrai StockEntryForm do sheet`
  - `refactor(stock): extrai StockWriteOffForm do sheet`
  - `refactor(stock): extrai StockRecountForm do sheet`
  - `refactor(stock): simplifica BranchStockEditSheet`
  - `test(stock): valida schemas dos 3 modos de movimentação`
- **NÃO** fazer push nem abrir PR sem instrução explícita.

## Steps

### Step 1: Criar branch e confirmar estado do arquivo-alvo

Crie a branch de trabalho e confirme que o arquivo monolítico está no estado
esperado.

```bash
git checkout -b advisor/029-decompose-branch-stock-edit-sheet
```

Confirme a existência do `biome-ignore` na linha 249 e dos três handlers de
submit nas linhas 332, 365 e 398:

```bash
grep -n "biome-ignore\|handleEntradaSubmit\|handleBaixaSubmit\|handleAjusteSubmit" \
  apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx
```

Esperado: linha 249 com `biome-ignore lint/complexity/noExcessiveCognitiveComplexity`,
e definições dos três handlers nas proximidades de L332, L365, L398.

**Verify**: `bun check-types` → exit 0 (baseline limpo antes de qualquer edição)

---

### Step 2: Definir as props compartilhadas (interface SharedStockFormProps)

Antes de criar os três arquivos, identifique o que é compartilhado entre os
formulários:

- `branchId: string` — passado para o schema (não renderizado)
- `variantId: string` — vem de `row.variantId` no shell
- `isAdjusting: boolean` — o `isPending` do `useTransition` do shell
- `onSuccess: () => void` — chama `router.refresh(); onClose()` no shell
- Cada form recebe seu próprio `useFormErrors` via estado interno (sem lifting);
  o shell **não** precisa passar `errors` — cada sub-form instancia o próprio
  `useFormErrors<T>()` internamente.

O `useTransition` (`startAdjustTransition`) permanece no **shell**, que passa o
`isPending` e o `start*` para os sub-forms. Alternativamente, cada sub-form pode
ter seu próprio `useTransition` — isso é mais simples e evita prop drilling.
**Opção recomendada:** cada sub-form tem seu próprio `useTransition` (exatamente
como já existe no monolítico, apenas relocado). O shell passa apenas
`variantId`, `branchId`, `isDisabled` (booleano externo que reflete se o sheet
ainda está carregando o `reservedQty`, vindo do `useTransition` do `useEffect`
de init) e `onSuccess`.

Interface base sugerida (não precisa de arquivo separado — embutir em cada
componente ou criar um `_lib/stock-form-types.ts` se preferir):

```ts
// props comuns aos três sub-forms
interface StockFormSharedProps {
  branchId: string;
  isDisabled: boolean;  // bloqueia campos enquanto shell carrega reservedQty
  onSuccess: () => void;
  variantId: string;
}
```

**Verify**: nenhum comando neste passo — é passo de leitura/decisão.

---

### Step 3: Criar `stock-entry-form.tsx`

Crie
`apps/web/src/app/dashboard/stock/_components/stock-entry-form.tsx`.

O componente recebe:

```ts
interface StockEntryFormProps extends StockFormSharedProps {
  suppliers: ActiveSupplierOption[];
}
```

Corpo:

1. Estado local: `qty: number | undefined`, `supplierId: string`,
   `note: string`.
2. `useFormErrors<StockEntryInput>()` — erros, `reportEntradaError`,
   `clearErrors`.
3. `useTransition()` → `[isPending, start]`.
4. `handleSubmit(e)`:
   - `e.preventDefault()`, `clearErrors()`
   - Monta `StockEntryInput` com `variantId`, `branchId`, `qty ?? NaN`,
     `supplierId`, `note` trim
   - `stockEntrySchema.safeParse(input)` → se falhar: `reportEntradaError(parsed.error)`
   - `start(async () => { const r = await recordStockEntry(parsed.data); if (r.ok) { notify.success("Entrada registrada"); onSuccess(); } else { notify.error(r.error || "Não foi possível registrar a entrada"); } })`
5. JSX: exatamente o `<form>` do bloco `mode === "entrada"` de
   `branch-stock-edit-sheet.tsx:616-689` — sem alterar nenhum class, id, label
   ou comportamento. `disabled` dos controles = `isPending || isDisabled`.

Imports necessários do monolítico: `Button`, `LabeledField`, `MaskedInput`,
`Textarea`, `Spinner`, `integerMask`, `notify`, `ActiveSupplierOption`,
`useFormErrors`, `recordStockEntry`, `StockEntryInput`, `stockEntrySchema`,
`SupplierCombobox` (ver nota abaixo).

> **Nota sobre `SupplierCombobox`:** este componente está atualmente definido
> como função interna no final de `branch-stock-edit-sheet.tsx` (L925–986).
> Duas opções: (a) mover para arquivo próprio
> `_components/supplier-combobox.tsx` e importar dos dois arquivos; (b) copiar
> a implementação para `stock-entry-form.tsx`. Opção (a) é preferível para
> evitar duplicação. **Faça isso neste step** se escolher (a): crie
> `supplier-combobox.tsx`, importe em `stock-entry-form.tsx` e depois atualize
> o import em `branch-stock-edit-sheet.tsx` no Step 6. Se escolher (b),
> documente o risco de divergência no futuro.

**Verify**: `bun check-types` → exit 0

---

### Step 4: Criar `stock-write-off-form.tsx`

Crie
`apps/web/src/app/dashboard/stock/_components/stock-write-off-form.tsx`.

O componente recebe apenas `StockFormSharedProps` (sem `suppliers`).

Corpo:

1. Estado local: `qty: number | undefined`, `writeOffReason: StockWriteOffReason`
   (default `"perda"`), `note: string`.
2. `useFormErrors<StockWriteOffInput>()`.
3. `useTransition()`.
4. `handleSubmit(e)`: padrão idêntico ao do Step 3 mas usando
   `stockWriteOffSchema.safeParse()` + `recordStockWriteOff()`.
   Mensagem de sucesso: `"Baixa registrada"`.
5. JSX: exatamente o `<form>` de `branch-stock-edit-sheet.tsx:691-774`.
   Atenção ao campo `note` com `required={writeOffReason === "outro"}` (L742)
   e ao `placeholder` condicional (L749–752) — preservar exatamente.

Imports: `Button`, `Label`, `LabeledField`, `MaskedInput`, `Textarea`,
`Spinner`, `integerMask`, `notify`, `useFormErrors`, `recordStockWriteOff`,
`StockWriteOffInput`, `StockWriteOffReason`, `stockWriteOffSchema`,
`stockWriteOffReasons`, `WRITE_OFF_REASON_LABEL`.

> **Nota:** `WRITE_OFF_REASON_LABEL` está definido em `branch-stock-edit-sheet.tsx:79-82`
> (não exportado, não está em `stock-movement-schema.ts`). Mova-o para
> `stock-movement-schema.ts` (exportar) e importe de lá em ambos os arquivos,
> ou redefina no próprio `stock-write-off-form.tsx`. Preferir mover para
> `stock-movement-schema.ts` por coerência — os outros labels já estão lá.
>
> **STOP:** se mover `WRITE_OFF_REASON_LABEL` para `stock-movement-schema.ts`
> exigir alterar mais de 2 arquivos além dos in-scope, escolha a opção de
> redefinir localmente e documente no arquivo com comentário.

**Verify**: `bun check-types` → exit 0

---

### Step 5: Criar `stock-recount-form.tsx`

Crie
`apps/web/src/app/dashboard/stock/_components/stock-recount-form.tsx`.

O componente recebe:

```ts
interface StockRecountFormProps extends StockFormSharedProps {
  currentQty: number;  // exibido no placeholder "Atual: N"
}
```

Corpo:

1. Estado local: `targetQty: number | undefined`, `note: string`.
2. `useFormErrors<StockRecountInput>()`.
3. `useTransition()`.
4. `handleSubmit(e)`: usando `stockRecountSchema.safeParse()` + `adjustStock()`.
   Mensagem de sucesso: `"Estoque ajustado"`.
5. JSX: exatamente o `<form>` de `branch-stock-edit-sheet.tsx:776-832`.
   Atenção ao `placeholder={\`Atual: ${currentQty}\`}` (L795 no original usa
   `row.quantity` — substituir por `currentQty` via prop).

Imports: `Button`, `LabeledField`, `MaskedInput`, `Textarea`, `Spinner`,
`integerMask`, `notify`, `useFormErrors`, `adjustStock`, `StockRecountInput`,
`stockRecountSchema`.

**Verify**: `bun check-types` → exit 0

---

### Step 6: Simplificar `branch-stock-edit-sheet.tsx` em shell fino

Agora que os três sub-forms existem, reescreva `branch-stock-edit-sheet.tsx`
para ser um shell que:

1. **Mantém** todo o estado que pertence ao shell:
   - `mode: Mode` (controla qual sub-form renderizar)
   - `minQty`, `reorderPoint`, `isUpdatingLimits` (painel de limites)
   - `reservedQty`, o `useEffect` de init e o `useTransition` de
     `getReservedQtyByVariantBranch`
   - O segmented control de modo (botões entrada/baixa/ajuste — L591–613)
   - O handler de limites `handleLimitsSubmit` (L430–448)
   - `MovementsCard`, `StatCard`, `SupplierCombobox` (se não movido no Step 3)

2. **Remove** do shell:
   - `qty`, `supplierId`, `writeOffReason`, `targetQty`, `note` (agora internos
     a cada sub-form)
   - Os três `useFormErrors` de modo
   - O `useTransition` de submit de operação (agora interno a cada sub-form;
     o shell mantém apenas o `useTransition` do `useEffect` de init)
   - Os três handlers `handleEntradaSubmit`, `handleBaixaSubmit`,
     `handleAjusteSubmit`
   - Os três blocos `{mode === "entrada" && <form ...>}` (L615–689,
     L691–774, L776–832)

3. **Substitui** os três blocos de form por:
   ```tsx
   {mode === "entrada" && (
     <StockEntryForm
       branchId={branchId}
       isDisabled={isAdjusting}
       onSuccess={() => { router.refresh(); onClose(); }}
       suppliers={suppliers}
       variantId={row.variantId}
     />
   )}
   {mode === "baixa" && (
     <StockWriteOffForm
       branchId={branchId}
       isDisabled={isAdjusting}
       onSuccess={() => { router.refresh(); onClose(); }}
       variantId={row.variantId}
     />
   )}
   {mode === "ajuste" && (
     <StockRecountForm
       branchId={branchId}
       currentQty={row.quantity}
       isDisabled={isAdjusting}
       onSuccess={() => { router.refresh(); onClose(); }}
       variantId={row.variantId}
     />
   )}
   ```
   > Ajuste: se cada sub-form tem seu próprio `useTransition`, o `isAdjusting`
   > passado como `isDisabled` reflete apenas o loading do `reservedQty` do init
   > (o `useTransition` do `useEffect`). Se quiser bloquear o segmented control
   > enquanto um submit estiver pendente, os sub-forms precisariam reportar de
   > volta ao shell — isso aumenta acoplamento. Recomendação: **não** bloquear o
   > segmented control durante submit (comportamento atual não bloqueia o selector
   > de modo de forma explícita — verificar no monolítico antes de decidir). Se
   > o selector atualmente fica bloqueado, o sub-form precisa de um callback
   > `onPending(bool)` ou o shell leva de volta o `useTransition`. Neste caso,
   > **pare e reporte** antes de implementar esse callback (está fora do escopo
   > de "refactor puro").
   >
   > **Reset de campos ao trocar de modo (comportamento a preservar):** no monolítico,
   > o segmented control (L602–607) chama `setNote(""); setQty(undefined); setSupplierId("")`
   > ao mudar o modo — zerando os campos visíveis. Com sub-forms autônomos esse reset
   > externo não existe mais. Para preservar o comportamento, cada sub-form deve
   > resetar seu estado interno quando a prop `variantId` mudar OU implementar um
   > `useEffect([mode], () => reset())` onde `mode` é re-recebido como prop. A opção
   > mais simples é fazer cada sub-form depender de um `key` derivado do modo no shell:
   > `<StockEntryForm key="entrada" .../>` — quando o modo muda, o React desmonta e
   > remonta o sub-form com estado zerado, replicando exatamente o comportamento atual.
   > **Use esta abordagem (`key={mode}` em cada instância)** para garantir que não há
   > regressão comportamental.

4. **Remove** o `biome-ignore lint/complexity/noExcessiveCognitiveComplexity`
   da linha 249 (agora obsoleto). Se o biome ainda reclamar após a extração,
   **pare e reporte** em vez de recolocar o suppressor.

5. **Atenção ao `useEffect` de init (L302–328):** ele chama `clearEntradaErrors()`,
   `clearBaixaErrors()`, `clearAjusteErrors()`. Com os sub-forms autônomos, esse
   reset não é mais possível via `clearErrors` do shell. Em vez disso, cada
   sub-form precisa limpar seus próprios erros quando a `variantId` mudar. Uma
   forma: cada sub-form recebe `variantId` e usa `useEffect([variantId], () =>
   clearErrors())`. Isso é refactor puro — implementar nos sub-forms nos Steps
   3-5 (ou adicionar aqui ao refatorar).

6. **`WRITE_OFF_REASON_LABEL`** e quaisquer constantes movidas no Step 4: remover
   do shell se foram movidas para `stock-movement-schema.ts`; manter se foram
   redefinidas localmente no sub-form.

**Verify**:
```bash
bun check-types          # exit 0
bun check                # exit 0
bun guard:forms          # exit 0
```

---

### Step 7: Escrever testes de validação Zod dos três schemas

Crie
`apps/web/src/app/dashboard/stock/_components/__tests__/stock-movement-schemas.test.ts`.

Modelo estrutural: `apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts`
(describe/it/expect sem dependência de `@emach/db` ou server actions).

**Casos obrigatórios:**

`stockEntrySchema`:
- aceita input válido (quantity=5, supplierId="sup1", variantId="v1", branchId="b1")
- rejeita quantity=0 (`min(1, "Quantidade deve ser maior que zero")`)
- rejeita quantity negativa
- rejeita supplierId vazio (`min(1, "Fornecedor obrigatório na entrada")`)
- rejeita quantity não-inteira (ex: 1.5) — `z.int`
- aceita note ausente (campo opcional)
- rejeita note > 500 chars

`stockWriteOffSchema`:
- aceita input válido (reason="perda", note ausente)
- rejeita quantity=0
- rejeita supplierId ausente (campo não existe — testar que schema não exige)
- quando reason="outro" e note vazia: rejeita com path `["note"]` e mensagem
  `"Observação obrigatória quando motivo é 'Outro'"` (refine da L71–77 de
  `stock-movement-schema.ts`)
- quando reason="outro" e note preenchida: aceita
- quando reason="perda" e note vazia: aceita (note opcional para "perda")

`stockRecountSchema`:
- aceita newQty=0 (min=0, diferente dos outros dois)
- rejeita newQty negativo
- rejeita newQty não-inteiro
- aceita note ausente

```ts
// Estrutura do arquivo de teste:
import { describe, expect, it } from "vitest";
import {
  stockEntrySchema,
  stockWriteOffSchema,
  stockRecountSchema,
} from "../stock-movement-schema";

describe("stockEntrySchema", () => { /* ... */ });
describe("stockWriteOffSchema", () => { /* ... */ });
describe("stockRecountSchema", () => { /* ... */ });
```

**Verify**: `bun --cwd apps/web test src/app/dashboard/stock` → verde,
incluindo os novos testes.

---

### Step 8: Smoke visual nos dois call-sites

`check-types` não detecta hook client (`useState`, `useTransition`) importado em
Server Component. Após as extrações, confirme visualmente:

1. Inicie o dev server: `bun dev:web` (porta padrão 3000)
2. Navegue para `/dashboard/stock/branches` → selecione qualquer ferramenta de
   qualquer filial → o Sheet deve abrir com os três modos funcionando:
   - Entrada: campo quantidade + combobox de fornecedor + note → submit registra
   - Baixa: campo quantidade + botões de motivo + note → submit registra
   - Ajuste: campo quantidade contada + note → submit salva
3. Navegue para `/dashboard/tools/[id]?tab=estoque` → selecione uma filial →
   o mesmo Sheet deve abrir com `lead="branch"` (header mostra nome do branch,
   não da ferramenta)
4. Verifique no console do browser: sem `undefined` ou erros de React

Se qualquer funcionalidade estiver quebrada: **pare, reverta o passo mais
recente e reporte.**

**Verify**: `bun check-types && bun check && bun guard:forms && bun --cwd apps/web test`
→ todos exit 0, testes verdes.

---

### Step 9: Commitar

```bash
git add apps/web/src/app/dashboard/stock/_components/
git commit -m "refactor(stock): extrai 3 sub-forms do BranchStockEditSheet"

git add apps/web/src/app/dashboard/stock/_components/__tests__/stock-movement-schemas.test.ts
git commit -m "test(stock): valida schemas dos 3 modos de movimentação"
```

**Verify**: `git log --oneline -3` → dois commits na branch `advisor/029-decompose-branch-stock-edit-sheet`.

## Test plan

Arquivo a criar:
`apps/web/src/app/dashboard/stock/_components/__tests__/stock-movement-schemas.test.ts`

Modelo estrutural:
`apps/web/src/app/dashboard/stock/_components/__tests__/stock-status.test.ts`
(sem dependência de `@emach/db`, sem mock de server actions — só importa schemas
Zod puros e testa `safeParse`).

Casos cobertos: listados no Step 7. Total esperado: ≥ 15 novos casos de teste.

Comando de verificação:
`bun --cwd apps/web test src/app/dashboard/stock` → verde, incluindo os novos
testes.

## Done criteria

Machine-checkable. TODOS devem valer:

- [ ] `bun check-types` exits 0
- [ ] `bun check` exits 0 (sem biome-ignore ativo em `branch-stock-edit-sheet.tsx`)
- [ ] `bun guard:forms` exits 0
- [ ] `bun --cwd apps/web test` exits 0; testes de `stock-movement-schemas.test.ts`
  existem e passam (≥ 15 novos casos)
- [ ] `grep -n "noExcessiveCognitiveComplexity" apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`
  retorna zero linhas
- [ ] `wc -l apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx`
  retorna ≤ 450 linhas (down de 986)
- [ ] Os arquivos criados existem:
  - `apps/web/src/app/dashboard/stock/_components/stock-entry-form.tsx`
  - `apps/web/src/app/dashboard/stock/_components/stock-write-off-form.tsx`
  - `apps/web/src/app/dashboard/stock/_components/stock-recount-form.tsx`
- [ ] Nenhum arquivo fora da lista "In scope" foi modificado (`git diff --name-only HEAD~1`)
- [ ] `plans/README.md` status row updated (somente se o executor não recebeu instrução de que um revisor mantém o índice — ver nota no cabeçalho)

## STOP conditions

Pare e reporte (não improvise) se:

- O arquivo `branch-stock-edit-sheet.tsx` não tiver o `biome-ignore` na linha
  249 nem os três handlers nas proximidades de L332/L365/L398 (drift desde o
  planejamento).
- A extração dos sub-forms exigir mover estado para cima (lifting) de forma que
  altere o comportamento do Sheet — ex.: o segmented control bloqueia durante
  submit e os sub-forms precisam de um callback `onPending(bool)` de volta ao
  shell (isso ultrapassa refactor puro).
- O reset de campos ao trocar de modo (via `key={mode}` ou equivalente) alterar
  algum comportamento observável além de zerar os campos — ex.: loops de
  re-montagem, perda de foco inesperada, ou estado de erro que deveria persistir.
- `SupplierCombobox` ou `WRITE_OFF_REASON_LABEL` moverem-se para arquivos que
  não estão na lista "In scope".
- O `biome-ignore` ainda for necessário após a extração (complexidade não caiu
  o suficiente).
- Qualquer step de verificação falhar duas vezes após uma tentativa razoável de
  correção.
- `bun run --cwd apps/web build` falhar (sempre rodar build antes de considerar
  completo — `check-types` não pega import de módulo `server-only` em Client
  Component nem SQL inválido em templates).

## Maintenance notes

- **Para quem evoluir um dos modos no futuro:** cada sub-form (`stock-entry-form.tsx`,
  `stock-write-off-form.tsx`, `stock-recount-form.tsx`) é agora autônomo —
  adicionar um campo exige editar apenas o sub-form e o schema correspondente em
  `stock-movement-schema.ts`.

- **Se um quarto modo for adicionado** (ex: "transferência entre filiais"): criar
  `stock-transfer-form.tsx` e adicionar o botão no segmented control do shell.
  Não expandir de volta o monolítico.

- **`SupplierCombobox`** (se movido para `supplier-combobox.tsx`): verificar se
  há outros pontos no dashboard que precisam de picker de fornecedor — pode ser
  elevado para `src/components/` se se tornar compartilhado.

- **Reviewer deve verificar** no PR: que nenhum client hook (`useState`,
  `useRouter`, `useTransition`) foi acidentalmente importado num Server Component;
  que o segmented control de modo ainda reseta `note`/`qty`/`supplierId` ao trocar
  de modo — confirmado via `key={mode}` nos sub-forms (comportamento de L603–610
  do original); que o `useEffect` de init (variantId) limpa os erros de cada
  sub-form (ou que `key={row?.variantId}` no shell garante remontagem).

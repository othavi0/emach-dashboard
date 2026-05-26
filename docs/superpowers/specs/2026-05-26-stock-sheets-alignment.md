# Alinhamento `BranchStockEditSheet` × `StockCellSheet`

> Item #2 do follow-up out-of-scope da PR #66 (unificação tools×stock).

**Goal:** Alinhar o sheet legacy `BranchStockEditSheet` ao pattern moderno introduzido pelo `StockCellSheet` na Slice 4, com bonus de hardening (Zod no StockCellSheet, cleanup de órfãos pós-Slice 6).

**Arquitetura:** mudança coesa, M (~3 arquivos modificados + 3 deletados). PR único, sem decomposição em slices. Schema Zod separado em UI (estrito) vs server (mantém enum completo para writes automáticos via pedidos).

**Tech stack:** Next 16 RSC + React 19 + Base UI primitives + Zod + Drizzle.

---

## Decisões trancadas

1. **Motivos no UI:** 4 botões toggle — `entrada_compra`, `ajuste_inventario`, `perda`, `outro`. **Removidos:** `__none__` (sem motivo), `saida_venda` (continua válido server-side para writes via pedidos).
2. **Default reason:** `entrada_compra`.
3. **Nota:** `Textarea rows={2}` sempre visível, placeholder `"NF #1234, fornecedor X…"`. Multi-linha mantido (mitiga regressão vs `Textarea` atual).
4. **Schema:** novo `stockAdjustmentUiSchema` UI-side com `reason` **obrigatório** (`z.enum` 4 motivos). Server-side `stockAdjustmentSchema` mantém `reason` opcional com enum completo (5 motivos).
5. **Cores status:** tokens — `bg-destructive/15 text-destructive` / `bg-warning/15 text-warning` / `bg-success/15 text-success` / `bg-muted text-muted-foreground`.
6. **Big number qty atual:** 36px (`font-bold text-[36px] tabular-nums`).
7. **Limites alerta:** inline em cada sheet (delete `BranchStockThresholdInputs`).
8. **Histórico:** pattern rico aplicado nos dois sheets — badge delta colorido + REASON_LABELS legíveis + actor name (`Sistema` ou nome) + relative time (`há 2h`).
9. **Zod no StockCellSheet:** importa `stockAdjustmentUiSchema`, `safeParse`, exibe erros inline (`errors.newQty`, `errors.reasonNote`).
10. **Cleanup:** deletar 3 órfãos pós-Slice 6 (`adjust-stock-dialog.tsx`, `stock-adjust-button.tsx`, `branch-stock-threshold-inputs.tsx`).

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts` | Modificar | + `stockAdjustmentUiSchema` (UI-strict). Server schema intacto. |
| `apps/web/src/app/dashboard/stock/_components/branch-stock-edit-sheet.tsx` | Refactor pesado | Select → 4 botões; cores tokens; nota sempre visível; limites inline; histórico rico (já era) |
| `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx` | Modificar | + Zod (`stockAdjustmentUiSchema`); + histórico rico (actor + relative time); `Input` nota → `Textarea rows={2}` |
| `apps/web/src/app/dashboard/stock/_components/branch-stock-threshold-inputs.tsx` | **Deletar** | Inline no sheet, único consumidor |
| `apps/web/src/app/dashboard/stock/_components/adjust-stock-dialog.tsx` | **Deletar** | Órfão pós-Slice 6 |
| `apps/web/src/app/dashboard/stock/_components/stock-adjust-button.tsx` | **Deletar** | Órfão pós-Slice 6 |

---

## Detalhes técnicos

### Schema (UI vs server)

```typescript
// stock-adjustment-schema.ts

export const STOCK_MOVEMENT_REASONS = [
  "entrada_compra", "saida_venda", "ajuste_inventario", "perda", "outro",
] as const;

export const STOCK_MOVEMENT_REASONS_UI = [
  "entrada_compra", "ajuste_inventario", "perda", "outro",
] as const;

// Server-side: aceita saida_venda (writes automáticos via pedidos), reason opcional
export const stockAdjustmentSchema = /* ... mantém atual ... */;

// UI-side: reason obrigatório, sem saida_venda
export const stockAdjustmentUiSchema = z
  .object({
    variantId: z.string().min(1, "Variante obrigatória"),
    branchId: z.string().min(1, "Filial obrigatória"),
    newQty: z.int("Quantidade deve ser inteira").min(0).max(999_999),
    reason: z.enum(STOCK_MOVEMENT_REASONS_UI),
    reasonNote: z.string().trim().max(500).optional(),
  })
  .refine(
    (d) => d.reason !== "outro" || (typeof d.reasonNote === "string" && d.reasonNote.length > 0),
    { path: ["reasonNote"], message: "Observação obrigatória quando motivo é 'Outro'" }
  );
```

### Pattern de motivo (toggle 4 botões)

```tsx
<Label className="text-xs uppercase">Motivo</Label>
<div className="grid grid-cols-2 gap-2">
  {(Object.keys(REASON_LABEL_UI) as ReasonUi[]).map((r) => (
    <Button
      key={r}
      onClick={() => setReason(r)}
      size="sm"
      variant={reason === r ? "default" : "outline"}
    >
      {REASON_LABEL_UI[r]}
    </Button>
  ))}
</div>
```

### Histórico rico (compartilhado)

```tsx
<ul className="flex flex-col gap-2.5">
  {movements.map((m) => (
    <li className="flex items-start gap-3 text-xs" key={m.id}>
      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
        m.delta >= 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
      }`}>
        {m.delta >= 0 ? "+" : ""}{m.delta}
      </span>
      <div className="min-w-0 flex-1">
        <p>
          {m.reason ? (REASON_LABELS[m.reason] ?? m.reason) : "Sem motivo"}
          {m.reasonNote ? <span className="ml-1 text-muted-foreground">— {m.reasonNote}</span> : null}
        </p>
        <p className="text-muted-foreground">
          {m.actorName ?? "Sistema"} · {formatRelative(m.createdAt)}
        </p>
      </div>
    </li>
  ))}
</ul>
```

Verificar se `StockMovementRow` retornado por `getStockMovementsByVariantBranch` já inclui `actorName`. Se não, adicionar JOIN com `user`.

### Limites inline

Substituir `<BranchStockThresholdInputs />` por inputs + submit local consumindo `updateStockThresholds`. Mesma estrutura do StockCellSheet (linhas 240-269).

---

## Riscos & mitigações

1. **Schema mais restrito quebra `adjustStock`?** ✓ Mitigado: schemas separados. Server aceita `STOCK_MOVEMENT_REASONS` completo + reason opcional (compat com pedidos automáticos). UI usa schema estrito.
2. **`saida_venda` sumindo manualmente:** confirmado intencional — saídas devem vir só de pedidos. Se operador precisar registrar saída manual fora de pedido (cenário raro), usa "ajuste_inventario" com nota explicativa.
3. **`Textarea rows={2}` overrides simples:** ambos sheets ganham multi-linha. Mais espaço pra contexto, não regressão.
4. **Órfãos deletados quebram algo?** Verificado: zero consumidores. Safe.
5. **`actorName` ausente em `StockMovementRow`:** se atual return type já tem (BranchStockEditSheet já usa), zero work. Caso contrário, adicionar JOIN `user` em `getStockMovementsByVariantBranch`.

---

## Test Plan

- [ ] `bun check-types` — 0 erros.
- [ ] `/dashboard/branches/[id]/stock` — abrir sheet de qualquer card:
  - [ ] 4 botões de motivo aparecem em grid 2×2.
  - [ ] Default selecionado: "Entrada compra".
  - [ ] Nota é `Textarea` sempre visível.
  - [ ] Cores status seguem tokens (destructive/warning/success).
  - [ ] Limites inline (sem componente separado).
  - [ ] Salvar ajuste → toast + sheet fecha + lista revalida.
  - [ ] Salvar com motivo="outro" sem nota → erro inline "Observação obrigatória".
- [ ] `/dashboard/tools/[id]?tab=estoque` — abrir sheet de qualquer célula:
  - [ ] Mesmo pattern 4 botões.
  - [ ] Nota é `Textarea rows={2}`.
  - [ ] Validação Zod ativa (campo qty vazio → erro inline).
  - [ ] Histórico mostra actor name + relative time.
- [ ] `grep -r "BranchStockThresholdInputs\|AdjustStockDialog\|StockAdjustButton" apps/web/src` → zero matches.

---

## Próximos passos

Spec aprovada → `writing-plans` cria o plano com tasks granulares → implementação inline (PR único, sem subagent-driven). Plano provavelmente em 4-5 tasks (schema, sheet legacy, sheet novo, cleanup, smoke).

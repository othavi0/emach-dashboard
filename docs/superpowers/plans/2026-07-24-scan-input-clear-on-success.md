# ScanInput limpar só no sucesso — Implementation Plan

> **For agentic workers:** Steps use checkbox syntax. Small change — execute inline or SDD.

**Goal:** Limpar o campo de bip só quando o scan for aceito; em erro manter o código selecionado.

**Architecture:** `onScan` passa a retornar `Promise<"clear"|"keep">`. ScanInput serializa submits (busy). handleScan processa um código e devolve o outcome. Fila de bip rápido fica no ScanInput (ou pai processa um por vez).

**Spec:** `docs/superpowers/specs/2026-07-24-scan-input-clear-on-success-design.md`

## Task 1: ScanInput + handleScan

**Files:**
- Modify `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx`
- Modify `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`
- Test: extend or add unit for outcome mapping if extracted; keep normalizeScanCode tests

### ScanInput

```ts
onScan: (code: string) => void | Promise<"clear" | "keep" | undefined>
```

- busy ref/state: while awaiting, ignore new Enter/paste
- submit: normalize → await onScan → keep: setValue(code)+select; else clear+focus

### handleScan

- Single code per call, return `"clear" | "keep"`
- accepted / already_complete → clear
- not_in_order / !ok → keep
- Remove queueRef/drainingRef if ScanInput serializes; OR keep queue but then each onScan is one code from ScanInput serial path

Prefer: remove parent queue; ScanInput busy serializes.

### Tests

- normalizeScanCode still pass
- Optional pure: `scanOutcomeFromResult(kind | error): "clear"|"keep"`

### Commit

`fix: limpa bip só quando aceito`

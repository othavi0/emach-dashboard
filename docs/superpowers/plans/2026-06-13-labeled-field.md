# LabeledField Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o componente `<LabeledField>` (render-prop) que encapsula `Label` + controle (`aria-invalid`) + `<FieldError>` + `hint`, e migrar `supplier-form-fields.tsx` como piloto, sem mudança visual.

**Architecture:** Componente render-prop em `apps/web/src/components/labeled-field.tsx`. O `field` injetado carrega só `{ id, "aria-invalid": true | undefined }`; `disabled` continua manual. Teste via `renderToStaticMarkup` (react-dom/server) em `environment: node` — sem Testing Library/jsdom. Spec: `docs/superpowers/specs/2026-06-13-labeled-field-design.md`.

**Tech Stack:** React 19, Next 16, vitest 4 (`environment: node`), `react-dom/server`, `@emach/ui` (Label/Input/Textarea), Biome/ultracite (`bun check`).

---

## File Structure

- **Create:** `apps/web/src/components/labeled-field.tsx` — o componente (1 responsabilidade: layout label+controle+erro+hint).
- **Create:** `apps/web/src/components/labeled-field.test.tsx` — teste unitário via `renderToStaticMarkup`.
- **Modify:** `apps/web/vitest.config.ts` — adicionar `.test.tsx` ao `include`.
- **Modify:** `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx` — migrar 6 campos.

Branch já criado: `feat/154-labeled-field`. Spec já commitado.

---

### Task 1: Habilitar `.test.tsx` no vitest

**Files:**
- Modify: `apps/web/vitest.config.ts:6`

- [ ] **Step 1: Adicionar o glob `.test.tsx` ao include**

Trocar a linha do `include`:

```ts
		include: ["__tests__/**/*.test.ts", "src/**/*.test.ts"],
```

por:

```ts
		include: [
			"__tests__/**/*.test.ts",
			"src/**/*.test.ts",
			"src/**/*.test.tsx",
		],
```

- [ ] **Step 2: Verificar que a suíte existente continua verde**

Run: `bun --cwd apps/web test`
Expected: PASS — mesma contagem de testes de antes (nenhum `.test.tsx` existe ainda; a mudança só amplia o glob).

- [ ] **Step 3: Commit**

```bash
git add apps/web/vitest.config.ts
git commit -m "test: incluir .test.tsx no vitest (issue #154)"
```

---

### Task 2: Componente `<LabeledField>` (TDD)

**Files:**
- Test: `apps/web/src/components/labeled-field.test.tsx`
- Create: `apps/web/src/components/labeled-field.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/components/labeled-field.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LabeledField } from "./labeled-field";

function render(ui: React.ReactElement): string {
	return renderToStaticMarkup(ui);
}

describe("LabeledField", () => {
	it("renderiza o label e o asterisco quando required", () => {
		const html = render(
			<LabeledField id="f" label="Nome" required>
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain("Nome");
		expect(html).toContain(" *");
		expect(html).toContain('for="f"');
	});

	it("não renderiza o asterisco quando não required", () => {
		const html = render(
			<LabeledField id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).not.toContain(" *");
	});

	it("injeta aria-invalid=true no controle quando há error", () => {
		const html = render(
			<LabeledField error="Obrigatório" id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain('aria-invalid="true"');
	});

	it("omite aria-invalid quando não há error", () => {
		const html = render(
			<LabeledField id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).not.toContain("aria-invalid");
	});

	it("renderiza a mensagem de erro com a âncora data-error", () => {
		const html = render(
			<LabeledField error="Obrigatório" id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain('data-error="true"');
		expect(html).toContain("Obrigatório");
	});

	it("renderiza o hint quando passado", () => {
		const html = render(
			<LabeledField hint="Markdown suportado" id="f" label="Obs">
				{(field) => <textarea {...field} />}
			</LabeledField>
		);
		expect(html).toContain("Markdown suportado");
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test labeled-field`
Expected: FAIL — `Failed to resolve import "./labeled-field"` (o componente ainda não existe).

- [ ] **Step 3: Implementar o componente**

Criar `apps/web/src/components/labeled-field.tsx`:

```tsx
import { Label } from "@emach/ui/components/label";
import type { ReactNode } from "react";

import { FieldError } from "@/components/field-error";

interface LabeledFieldProps {
	id: string;
	label: ReactNode;
	required?: boolean;
	error?: string;
	/** Tooltip/HelpTooltip ao lado do label. */
	help?: ReactNode;
	/** Texto auxiliar abaixo do erro (ex: "Markdown suportado"). */
	hint?: ReactNode;
	children: (field: { id: string; "aria-invalid": true | undefined }) => ReactNode;
}

/**
 * Encapsula Label + controle + FieldError numa unidade. O render-prop garante
 * que `id` e `aria-invalid` cheguem ao controle (children faz o spread de
 * `field`), e que o `<FieldError>` (âncora `data-error` do focusFirstError)
 * exista sempre. Convenção documentada em apps/web/CLAUDE.md.
 */
export function LabeledField({
	id,
	label,
	required,
	error,
	help,
	hint,
	children,
}: LabeledFieldProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label
				className={help ? "flex items-center gap-1.5" : undefined}
				htmlFor={id}
			>
				{label}
				{required && <span className="text-destructive"> *</span>}
				{help}
			</Label>
			{children({ id, "aria-invalid": error ? true : undefined })}
			<FieldError>{error}</FieldError>
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
		</div>
	);
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test labeled-field`
Expected: PASS — 6 testes verdes.

- [ ] **Step 5: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: ambos verdes. (Se o hook de auto-format reordenar props, re-rodar; não quebra nada funcional.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/labeled-field.tsx apps/web/src/components/labeled-field.test.tsx
git commit -m "feat(forms): componente <LabeledField> com teste"
```

---

### Task 3: Migrar `supplier-form-fields.tsx` para `<LabeledField>`

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`

Mapa de migração (sem mudança visual — mesma árvore DOM):

| Campo          | id                | required | help                                  | hint                 |
| -------------- | ----------------- | -------- | ------------------------------------- | -------------------- |
| `name`         | `supplier-name`   | sim      | —                                     | —                    |
| `contactEmail` | `supplier-email`  | não      | —                                     | —                    |
| `phone`        | `supplier-phone`  | não      | —                                     | —                    |
| `website`      | `supplier-website`| não      | `<HelpTooltip text="URL completa…" />`| —                    |
| `cnpj`         | `supplier-cnpj`   | não      | `<HelpTooltip title/body/example… />` | —                    |
| `notes`        | `supplier-notes`  | não      | —                                     | "Markdown suportado" |

- [ ] **Step 1: Reescrever o corpo do componente usando `<LabeledField>`**

Substituir todo o `return (...)` de `SupplierFormFields` por:

```tsx
	return (
		<div className="flex flex-col gap-4">
			<LabeledField error={errors.name} id="supplier-name" label="Nome" required>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Bosch Brasil"
						value={values.name ?? ""}
					/>
				)}
			</LabeledField>

			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					error={errors.contactEmail}
					id="supplier-email"
					label="E-mail (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ contactEmail: e.target.value })}
							placeholder="contato@fornecedor.com"
							type="email"
							value={values.contactEmail ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.phone}
					id="supplier-phone"
					label="Telefone (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ phone: e.target.value })}
							placeholder="(11) 99999-9999"
							value={values.phone ?? ""}
						/>
					)}
				</LabeledField>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					error={errors.website}
					help={<HelpTooltip text="URL completa, começando com https://." />}
					id="supplier-website"
					label="Website (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ website: e.target.value })}
							placeholder="https://..."
							type="url"
							value={values.website ?? ""}
						/>
					)}
				</LabeledField>
				<LabeledField
					error={errors.cnpj}
					help={
						<HelpTooltip
							body="Só os dígitos são salvos; a máscara é apenas visual."
							example="12.345.678/0001-90 → 12345678000190"
							title="CNPJ"
						/>
					}
					id="supplier-cnpj"
					label="CNPJ (opcional)"
				>
					{(field) => (
						<Input
							{...field}
							disabled={disabled}
							onChange={(e) => onPatch({ cnpj: e.target.value })}
							placeholder="00.000.000/0000-00"
							value={values.cnpj ?? ""}
						/>
					)}
				</LabeledField>
			</div>

			<LabeledField
				error={errors.notes}
				hint="Markdown suportado"
				id="supplier-notes"
				label="Observações (opcional)"
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ notes: e.target.value })}
						placeholder="Condições comerciais, contato responsável ou instruções internas."
						rows={5}
						value={values.notes ?? ""}
					/>
				)}
			</LabeledField>
		</div>
	);
```

- [ ] **Step 2: Ajustar os imports**

No topo do arquivo, **remover** `Label` e `FieldError` (não mais usados diretamente) e **adicionar** `LabeledField`. Resultado:

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { Textarea } from "@emach/ui/components/textarea";

import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import type { SupplierFormValues } from "./supplier-schema";
```

(Conferir que `Label` de `@emach/ui/components/label` e `FieldError` de `@/components/field-error` ficaram sem uso e foram removidos — o `bun check` acusa import não usado.)

- [ ] **Step 3: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: ambos verdes, sem import órfão.

- [ ] **Step 4: Rodar a suíte de testes**

Run: `bun --cwd apps/web test`
Expected: PASS — suíte completa verde (inclui o `labeled-field.test.tsx`).

- [ ] **Step 5: Smoke visual no browser**

Run: `bun --cwd apps/web dev` (ou `/dev-here <porta>`), abrir `/dashboard/suppliers`, abrir o form de criar fornecedor.

Verificar:
1. Layout idêntico ao anterior (label, tooltips de website/cnpj, "Markdown suportado" abaixo de Observações, asterisco em Nome).
2. Submeter com Nome vazio → toast de erro + `<FieldError>` abaixo de Nome + foco/scroll no campo Nome (via `focusFirstError`).
3. Sem erro no console nem no overlay do Next.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx
git commit -m "refactor(suppliers): adotar <LabeledField> nos 6 campos"
```

---

## Self-Review (preenchido)

**1. Cobertura do spec:**
- Componente render-prop com a API → Task 2 Step 3. ✓
- `field` entrega `id` + `aria-invalid` (`true | undefined`) → Task 2 Steps 1/3. ✓
- Asterisco quando `required` + `<FieldError>` com `data-error` → Task 2. ✓
- Slot `hint` (adendo ao issue) → Task 2 Step 3 + teste Step 1. ✓
- Teste unitário (label/asterisco, aria-invalid true/undefined, mensagem de erro, hint) → Task 2 Step 1. ✓
- `supplier-form-fields.tsx` migrado nos 6 campos sem mudança visual → Task 3. ✓
- `check-types` / `bun check` / `test` verdes → Tasks 2–3. ✓
- Smoke (erro por campo + foco/scroll) → Task 3 Step 5. ✓
- Infra de teste (`.test.tsx` no include) → Task 1. ✓

**2. Placeholder scan:** sem TBD/TODO/"add error handling" — todo passo tem código ou comando concreto. ✓

**3. Type consistency:** `LabeledField` / `LabeledFieldProps` / `field = { id, "aria-invalid" }` idênticos entre teste (Task 2 Step 1), implementação (Task 2 Step 3) e uso (Task 3). Imports (`@/components/labeled-field`, `@emach/ui/components/label`, `@/components/field-error`) consistentes. ✓

**Premissa fora de escopo (registrada no spec):** controles custom (Select/CepInput/…) e campos não-planos (`_form`, arrays, radio-groups) não entram neste PR — piloto é 100% `Input`/`Textarea` nativo.

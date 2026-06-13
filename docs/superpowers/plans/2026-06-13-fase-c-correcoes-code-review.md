# Fase C — Correções do code-review (notificações de erro) (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 7 findings do code-review da migração de notificações (Fase A/B): erros invisíveis em vários campos, `focusFirstError` virando no-op, `isSpecFilled` ignorando `valueNumericMax`, contagem do toast inflada, e a fragilidade de raiz (fiação manual repetida + `aria-invalid` como convenção não-enforçada).

**Architecture:** Atacar a **raiz** primeiro: (1) um componente `<FieldError>` que renderiza o `<p>` de erro padronizado com `data-error="true"`, (2) `focusFirstError` resiliente que rola até `[aria-invalid="true"], [data-error="true"]` (desacopla o scroll da presença de `aria-invalid` em inputs custom como `CepInput`/`UfSelect`), (3) um hook `useFormErrors<T>()` que encapsula estado tipado + report (setErrors + toast + foco), (4) `errorToastMessage` contando campos destacados em vez de `issues.length`. Com a infra robusta, fiar `<FieldError>` em todo campo que falta fecha a classe inteira de regressões.

**Tech Stack:** Zod 4, React 19 / Next 16, sonner (`notify`), Vitest (node).

Findings de referência (code-review): F1 branch fields sem erro; F2 spec-fields não usa `errors`; F3 promotion sem `aria-invalid`; F4 attribute options/swatches sem `aria-invalid`; F5 `isSpecFilled` ignora `valueNumericMax`; F6 toast conta `issues.length` (infla com path vazio/duplicado); F7 race de timing do foco no wizard.

---

### Task 1: `<FieldError>` + `focusFirstError` resiliente + `errorToastMessage` por campos (F2/F3/F4/F6/F7 — infra)

**Files:**
- Modify: `apps/web/src/lib/form-errors.ts`
- Create: `apps/web/src/components/field-error.tsx`
- Test: `apps/web/src/lib/__tests__/form-errors.test.ts` (append)

- [ ] **Step 1: Atualizar teste de `errorToastMessage` e `zodIssuesToFieldErrors` (empty path → `_form`)**

Em `form-errors.test.ts`, adicionar:

```ts
describe("zodIssuesToFieldErrors — empty path", () => {
	it("mapeia issue de path vazio para a chave _form", () => {
		const err = {
			issues: [{ path: [], message: "Erro geral do formulário" }],
		} as unknown as import("zod").ZodError;
		expect(zodIssuesToFieldErrors(err)._form).toBe("Erro geral do formulário");
	});
});
```

E trocar os testes de `errorToastMessage` para a nova assinatura (recebe o mapa de erros, conta chaves):

```ts
describe("errorToastMessage", () => {
	it("conta campos destacados (chaves), não issues", () => {
		expect(errorToastMessage({ name: "x" })).toBe(
			"1 erro — corrija os campos destacados"
		);
		expect(errorToastMessage({ name: "x", email: "y" })).toBe(
			"2 erros — corrija os campos destacados"
		);
	});
});
```

- [ ] **Step 2: Run — espera falhar**

Run: `bun --cwd apps/web test form-errors`
Expected: FAIL (`_form` undefined; `errorToastMessage` ainda recebe number).

- [ ] **Step 3: Implementar em `form-errors.ts`**

Trocar `zodIssuesToFieldErrors` para mapear path vazio em `_form`, `errorToastMessage` para receber o mapa, e `focusFirstError` para o seletor duplo + double-rAF:

```ts
"use client";

import type { ZodError } from "zod";

/**
 * Converte um ZodError em erros por campo (chave = path[0]). Issues de path
 * vazio (refinements de raiz) caem na chave especial `_form`, para nunca
 * sumirem. Mantém o primeiro erro de cada chave.
 */
export function zodIssuesToFieldErrors<T = Record<string, string>>(
	error: ZodError
): Partial<Record<keyof T & string, string>> & { _form?: string } {
	const out: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
		if (out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out as Partial<Record<keyof T & string, string>> & { _form?: string };
}

/** Texto do toast — conta os CAMPOS destacados (chaves), não os issues do Zod. */
export function errorToastMessage(fieldErrors: Record<string, unknown>): string {
	const count = Object.keys(fieldErrors).length;
	return `${count} ${count === 1 ? "erro" : "erros"} — corrija os campos destacados`;
}

/**
 * Rola/foca o primeiro campo inválido. Para foco usa `[aria-invalid="true"]`
 * (a11y, inputs nativos); para rolagem aceita também `[data-error="true"]`
 * (o `<FieldError>`), garantindo scroll mesmo em inputs custom que não
 * repassam aria-invalid. Double-rAF cobre o commit de um novo passo do wizard.
 */
export function focusFirstError(container?: HTMLElement | null): void {
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			const root: ParentNode = container ?? document;
			const focusable = root.querySelector<HTMLElement>(
				'[aria-invalid="true"]'
			);
			const scrollTarget =
				focusable ??
				root.querySelector<HTMLElement>('[data-error="true"]');
			scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
			focusable?.focus({ preventScroll: true });
		});
	});
}
```

- [ ] **Step 4: Criar `<FieldError>` component**

Create `apps/web/src/components/field-error.tsx`:

```tsx
interface FieldErrorProps {
	children?: string;
}

/**
 * Mensagem de erro por campo padronizada. `data-error` marca o elemento para
 * o fallback de scroll de `focusFirstError`. Não renderiza nada quando vazio.
 */
export function FieldError({ children }: FieldErrorProps) {
	if (!children) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" data-error="true">
			{children}
		</p>
	);
}
```

- [ ] **Step 5: Run — espera passar**

Run: `bun --cwd apps/web test form-errors`
Expected: PASS.

- [ ] **Step 6: Atualizar os callers de `errorToastMessage` (assinatura mudou)**

`errorToastMessage` agora recebe o mapa de erros, não `count`. Atualizar todos os call sites. Para cada arquivo abaixo, trocar `notify.error(errorToastMessage(parsed.error.issues.length))` (ou `.issueCount`) por `notify.error(errorToastMessage(fieldErrors))`, onde `fieldErrors` é o objeto recém-setado:

- `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`
- `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx`
- `apps/web/src/app/dashboard/suppliers/_components/supplier-form.tsx`
- `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx`
- `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx`
- `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx`
- `apps/web/src/app/dashboard/categories/_components/category-form.tsx`
- `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`
- `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`
- `apps/web/src/app/dashboard/site/settings/_components/social-settings-form.tsx` (sem state de erros — passar `{}`? Não: este form não tem mapa; ver Task 5)
- `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts` (usa `parsed.fieldErrors`)

Padrão (ex. branch-form):
```ts
const fieldErrors = zodIssuesToFieldErrors<BranchFormValues>(parsed.error);
setErrors(fieldErrors);
notify.error(errorToastMessage(fieldErrors));
focusFirstError();
```
Para `use-tool-submit.ts`: `notify.error(errorToastMessage(parsed.fieldErrors))`.

- [ ] **Step 7: Verify types + commit**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test`
Expected: verde.

```bash
git add apps/web/src/lib/form-errors.ts apps/web/src/lib/__tests__/form-errors.test.ts apps/web/src/components/field-error.tsx apps/web/src/app/dashboard
git commit -m "fix: focusFirstError resiliente (data-error) + toast conta campos + FieldError"
```

---

### Task 2: `isSpecFilled` conta `valueNumericMax` (F5)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` (append)

- [ ] **Step 1: Teste**

Append em `tool-schema.test.ts`:

```ts
it("conta numeric_range preenchido só com valueNumericMax", () => {
	expect(countFilledSpecs({ a: { valueNumericMax: 50 } }, ["a"])).toBe(1);
});
it("NaN em valueNumericMax não conta", () => {
	expect(
		countFilledSpecs({ a: { valueNumericMax: Number.NaN } }, ["a"])
	).toBe(0);
});
```

- [ ] **Step 2: Run — falha**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL (`valueNumericMax` não conta hoje).

- [ ] **Step 3: Implementar**

Em `isSpecFilled` (`tool-schema.ts`), adicionar o branch antes do `valueBool`:

```ts
	if (typeof v.valueNumeric === "number" && !Number.isNaN(v.valueNumeric)) {
		return true;
	}
	if (typeof v.valueNumericMax === "number" && !Number.isNaN(v.valueNumericMax)) {
		return true;
	}
	if (typeof v.valueBool === "boolean") {
		return true;
	}
```

- [ ] **Step 4: Run — passa + commit**

Run: `bun --cwd apps/web test tool-schema`
Expected: PASS.

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
git commit -m "fix: countFilledSpecs conta numeric_range preenchido só com máximo"
```

---

### Task 3: spec-fields exibe o erro da regra de specs (F2)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx`

- [ ] **Step 1: Consumir `errors` e exibir**

`SpecFields` recebe `errors` via `ToolFieldGroupProps` mas não usa. Destruturar `errors` e, quando `errors.attributeValues` existir, renderizar `<FieldError>` perto do contador "X de 4 preenchidas", e marcar o container do editor com `data-error`:

1. `import { FieldError } from "@/components/field-error";`
2. Assinatura: `export function SpecFields({ values, onPatch, errors }: ToolFieldGroupProps) {`
3. Abaixo do header com o contador, adicionar:
```tsx
<FieldError>{errors.attributeValues}</FieldError>
```
(O `<FieldError>` já tem `data-error="true"`, então `focusFirstError` rola até o passo de specs.)

- [ ] **Step 2: Verify types + smoke (porta 3008)**

Run: `bun --cwd apps/web check-types`
Smoke: criar tool, preencher tudo menos specs (<4), marcar status Ativo, criar → o wizard navega ao passo Especificações, toast aparece, e a mensagem "Ativar exige ao menos 4 especificações…" é exibida no passo + a página rola até lá.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx
git commit -m "fix: spec-fields exibe erro da regra de mínimo de specs"
```

---

### Task 4: branch-form-fields — erro em todos os campos (F1)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/branches/_components/cep-input.tsx` (aceitar `aria-invalid`)
- Modify: `apps/web/src/components/uf-select.tsx` (aceitar `aria-invalid`)

- [ ] **Step 1: `CepInput` e `UfSelect` aceitam `aria-invalid`**

`CepInput` (`Props` + trigger): adicionar `"aria-invalid"?: boolean | undefined;` à interface `Props`, desestruturar e repassar ao `<Input>` interno. `UfSelect`: idem, repassar ao `SelectTrigger`.

- [ ] **Step 2: Trocar os `<p>` manuais por `<FieldError>` e fiar os campos faltantes**

Em `branch-form-fields.tsx`:
1. `import { FieldError } from "@/components/field-error";`
2. Trocar os dois `{errors.name && <p…>}` / `{errors.cep && <p…>}` / blocos por `<FieldError>{errors.X}</FieldError>`.
3. Adicionar `aria-invalid={errors.<campo> ? true : undefined}` + `<FieldError>{errors.<campo>}</FieldError>` em: `phone` (MaskedInput repassa aria-invalid), `street`, `streetNumber`, `complement`, `neighborhood`, `city` (todos `<Input>`), `cep` (CepInput agora aceita), `state` (UfSelect agora aceita), `status` (SelectTrigger).
4. Manter os `<FieldError>` de bloco para `businessHours` e `cepRanges`.

- [ ] **Step 3: Verify + smoke**

Run: `bun --cwd apps/web check-types`
Smoke (porta 3008): editar filial, digitar telefone inválido → erro aparece sob o campo Telefone + foco/scroll. Sem caixa.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx apps/web/src/app/dashboard/branches/_components/cep-input.tsx apps/web/src/components/uf-select.tsx
git commit -m "fix: branches exibe erro em todos os campos (telefone, endereço)"
```

---

### Task 5: promotion + social — `aria-invalid`/FieldError e migração ao helper (F3 + cleanup)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`
- Modify: `apps/web/src/app/dashboard/site/settings/_components/social-settings-form.tsx`

- [ ] **Step 1: `promotion-form-fields.tsx` — `aria-invalid` + `<FieldError>`**

Para cada campo que já renderiza erro (`title`, `description`, `discountValue`, `code`, `maxRedemptions`, `minOrderAmount`, `startsAt`, `endsAt`, `toolIds`): adicionar `aria-invalid={errors.<campo> ? true : undefined}` ao input/select correspondente e trocar o `<p>` de erro por `<FieldError>{errors.<campo>}</FieldError>` (`import { FieldError } from "@/components/field-error"`). Campos cujo controle não aceita `aria-invalid` (ex: DatePicker) ficam só com o `<FieldError>` (o `data-error` garante o scroll).

- [ ] **Step 2: `promotion-form.tsx` — usar `zodIssuesToFieldErrors` (remove duplicação)**

Trocar o `zodErrorsToFieldMap` local por `zodIssuesToFieldErrors<PromotionFormValues>` de `@/lib/form-errors`; remover a função local; tipar `errors` como `Partial<Record<keyof PromotionFormValues, string>>`. O `_form`, se existir, pode ser ignorado (sem campo) — o toast já conta as chaves.

- [ ] **Step 3: `social-settings-form.tsx` — manter `aria-invalid` reativo + FieldError já existe**

O form usa `invalidUrl` reativo (cobre o caso comum). Para o caso `>2048` (refine), adicionar um estado `formError` opcional: no submit, se `parsed.error`, setar `setFormError(zodIssuesToFieldErrors(parsed.error)._form ?? "Revise os links")` e renderizar `<FieldError>{formError}</FieldError>` no topo da section. Toast: `errorToastMessage` com o mapa. Garante que o erro de `max(2048)` apareça (hoje some).

- [ ] **Step 4: Verify + smoke + commit**

Run: `bun --cwd apps/web check-types`
Smoke: promoção inválida → foco/scroll no 1º campo + erro inline. 

```bash
git add apps/web/src/app/dashboard/promotions apps/web/src/app/dashboard/site/settings/_components/social-settings-form.tsx
git commit -m "fix: promotions/social com aria-invalid + FieldError, sem duplicação"
```

---

### Task 6: attribute-form — `aria-invalid` em options/swatches + helper (F4 + cleanup)

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`

- [ ] **Step 1: `aria-invalid`/FieldError em options e swatches**

1. `import { FieldError } from "@/components/field-error";` e trocar os `{errors.label && <p…>}`, `{errors.options && <p…>}`, `{errors.swatches && <p…>}` por `<FieldError>`.
2. No primeiro `<Input>` de cada linha de `options` e `swatches`, adicionar `aria-invalid={errors.options ? true : undefined}` / `aria-invalid={errors.swatches ? true : undefined}` (marca ao menos um input do grupo para foco). O `<FieldError data-error>` abaixo da `<section>` garante o scroll de qualquer forma.

- [ ] **Step 2: Usar `zodIssuesToFieldErrors` no submit (remove o loop inline)**

Trocar o `for…of issues` que monta `fieldErrors` por `const fieldErrors = zodIssuesToFieldErrors<AttributeFormValues>(result.error);` (`import` do helper). `notify.error(errorToastMessage(fieldErrors))`.

- [ ] **Step 3: Verify + smoke + commit**

Run: `bun --cwd apps/web check-types`
Smoke: criar atributo tipo "lista" sem opções → erro sob a seção Opções + scroll.

```bash
git add apps/web/src/app/dashboard/categories/_components/attribute-form.tsx
git commit -m "fix: attribute-form com aria-invalid em options/swatches, sem loop duplicado"
```

---

### Task 7: hook `useFormErrors` + tipar estados soltos (raiz + cleanup)

**Files:**
- Modify: `apps/web/src/lib/form-errors.ts` (adicionar hook)
- Modify: forms com estado `errors` solto: `user-edit-sheet.tsx`, `shipping-settings-form.tsx` (tipar)
- Test: `apps/web/src/lib/__tests__/form-errors.test.ts` (o hook em si não precisa de teste DOM; cobertura via funções puras já existe)

- [ ] **Step 1: Adicionar `useFormErrors` em `form-errors.ts`**

```ts
import { useCallback, useState } from "react";
import type { ZodError } from "zod";
import { notify } from "@/lib/notify";

export function useFormErrors<T = Record<string, string>>() {
	const [errors, setErrors] = useState<
		Partial<Record<keyof T & string, string>> & { _form?: string }
	>({});
	const reportValidationError = useCallback((error: ZodError) => {
		const fieldErrors = zodIssuesToFieldErrors<T>(error);
		setErrors(fieldErrors);
		notify.error(errorToastMessage(fieldErrors));
		focusFirstError();
	}, []);
	const clearErrors = useCallback(() => setErrors({}), []);
	return { errors, setErrors, reportValidationError, clearErrors };
}
```

(`form-errors.ts` já tem `"use client"`; o hook convive com as funções puras. Os `import` de react/notify ficam no topo.)

- [ ] **Step 2: Migrar `user-edit-sheet.tsx` e `shipping-settings-form.tsx` para o hook (tipos fortes)**

Trocar o `useState<Partial<Record<string,string>>>({})` + bloco manual por `const { errors, reportValidationError, clearErrors } = useFormErrors<XFormValues>()`. No submit: `reportValidationError(parsed.error)`. No reset/open: `clearErrors()`. (Demais forms podem migrar incrementalmente; estes dois fecham o finding de estado solto.)

- [ ] **Step 3: Verify final completo**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test && bun check`
Expected: tipos OK, suíte verde, lint limpo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/form-errors.ts apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx
git commit -m "refactor: hook useFormErrors + estados de erro tipados"
```

---

## Self-Review

**Cobertura dos findings:**
- F1 (branch fields sem erro) → Task 4. ✓
- F2 (spec-fields não usa errors) → Task 3. ✓
- F3 (promotion sem aria-invalid) → Task 5. ✓
- F4 (attribute options/swatches) → Task 6. ✓
- F5 (isSpecFilled valueNumericMax) → Task 2. ✓
- F6 (toast conta issues.length) → Task 1 (errorToastMessage por chaves) + empty-path→`_form`. ✓
- F7 (race de foco) → Task 1 (double-rAF). ✓
- Raiz (fiação manual + aria-invalid não-enforçado) → Task 1 (`<FieldError>` + focus resiliente) + Task 7 (hook). ✓
- Cleanup (duplicação promotion/attribute, estados soltos) → Tasks 5, 6, 7. ✓

**Placeholder scan:** sem TBD; código nos steps. Onde a fiação é repetitiva (campos), o padrão concreto + lista de campos está dado.

**Type consistency:** `zodIssuesToFieldErrors<T>` agora retorna `… & { _form?: string }`; `errorToastMessage(fieldErrors: Record<string,unknown>)`; `focusFirstError(container?)`; `<FieldError>{string|undefined}</FieldError>`; `useFormErrors<T>()`. Usados de forma consistente.

**Ordem:** Task 1 (infra: muda assinatura de `errorToastMessage` e atualiza todos os callers) primeiro — sem ela os demais não compilam. Tasks 2-6 dependem do `<FieldError>`/focus da Task 1. Task 7 (hook) por último, opcional-incremental.

**Risco:** Task 1 Step 6 toca muitos arquivos (mudança de assinatura) — `check-types` fecha o contrato. Smoke visual obrigatório nas Tasks 3/4/5/6 (UI).

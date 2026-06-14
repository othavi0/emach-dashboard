# Fase A — Migração de notificações de erro para toast + erro por campo (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o `FormErrorPanel` (caixa vermelha no topo) de todos os forms do dashboard, padronizando o feedback de validação em **toast de contagem** (sonner via `notify`) **+ erro por campo** (`aria-invalid` + `<p>` vermelho), com foco/scroll no primeiro campo inválido após falha.

**Architecture:** Um módulo central `src/lib/form-errors.ts` concentra a conversão de `ZodError` → erros por campo, o texto do toast e o foco no primeiro `[aria-invalid="true"]`. Forms que já têm erro por campo só perdem o painel; forms que não têm ganham erro por campo. O wizard de tools recebe helpers para navegar até o primeiro passo com erro.

**Tech Stack:** Zod 4, React 19 / Next 16, sonner (`notify`), Vitest (environment node).

Spec de referência: `docs/superpowers/specs/2026-06-13-toast-notifications-and-min-specs-design.md`.

**Padrão de erro por campo (canônico, de `identity-fields.tsx`):**
```tsx
<Input aria-invalid={errors.campo ? true : undefined} ... />
{errors.campo && <p className="text-destructive text-xs">{errors.campo}</p>}
```

---

### Task 1: Módulo central `src/lib/form-errors.ts`

**Files:**
- Create: `apps/web/src/lib/form-errors.ts`
- Test: `apps/web/src/lib/__tests__/form-errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/__tests__/form-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { errorToastMessage, zodIssuesToFieldErrors } from "../form-errors";

const schema = z.object({
	name: z.string().min(1, "Nome obrigatório"),
	email: z.string().email("E-mail inválido"),
});

describe("zodIssuesToFieldErrors", () => {
	it("mapeia o primeiro erro por chave top-level (path[0])", () => {
		const r = schema.safeParse({ name: "", email: "x" });
		if (r.success) {
			throw new Error("esperava falha");
		}
		const errors = zodIssuesToFieldErrors(r.error);
		expect(errors.name).toBe("Nome obrigatório");
		expect(errors.email).toBe("E-mail inválido");
	});

	it("não sobrescreve: mantém o primeiro erro de cada chave", () => {
		const err = {
			issues: [
				{ path: ["name"], message: "primeiro" },
				{ path: ["name"], message: "segundo" },
			],
		} as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err).name).toBe("primeiro");
	});

	it("usa path[0] para erros aninhados (ex: businessHours.weekdays)", () => {
		const err = {
			issues: [{ path: ["businessHours", "weekdays", "opensAt"], message: "Horário inválido" }],
		} as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err).businessHours).toBe("Horário inválido");
	});

	it("ignora issues sem path", () => {
		const err = { issues: [{ path: [], message: "geral" }] } as unknown as z.ZodError;
		expect(zodIssuesToFieldErrors(err)).toEqual({});
	});
});

describe("errorToastMessage", () => {
	it("singular", () => {
		expect(errorToastMessage(1)).toBe("1 erro — corrija os campos destacados");
	});
	it("plural", () => {
		expect(errorToastMessage(3)).toBe("3 erros — corrija os campos destacados");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test form-errors`
Expected: FAIL — módulo `../form-errors` não existe.

- [ ] **Step 3: Implement the module**

Create `apps/web/src/lib/form-errors.ts`:

```ts
"use client";

import type { ZodError } from "zod";

/**
 * Converte um ZodError em erros por campo, chaveados pela primeira parte do
 * path (path[0]). Erros aninhados (ex: businessHours.weekdays.opensAt) ficam
 * sob a chave top-level (businessHours), mostrados no nível do bloco. Mantém o
 * primeiro erro de cada chave.
 */
export function zodIssuesToFieldErrors<T = Record<string, string>>(
	error: ZodError
): Partial<Record<keyof T & string, string>> {
	const out: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.length > 0 ? String(issue.path[0]) : "";
		if (key && out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out as Partial<Record<keyof T & string, string>>;
}

/** Texto padrão do toast de validação (substitui o antigo "veja detalhes acima"). */
export function errorToastMessage(count: number): string {
	return `${count} ${count === 1 ? "erro" : "erros"} — corrija os campos destacados`;
}

/**
 * Foca e rola até o primeiro elemento com `aria-invalid="true"`. Em
 * requestAnimationFrame para rodar após o React pintar os erros. Opcionalmente
 * restrito a um container.
 */
export function focusFirstError(container?: HTMLElement | null): void {
	requestAnimationFrame(() => {
		const root: ParentNode = container ?? document;
		const el = root.querySelector<HTMLElement>('[aria-invalid="true"]');
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "center" });
			el.focus({ preventScroll: true });
		}
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test form-errors`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/form-errors.ts apps/web/src/lib/__tests__/form-errors.test.ts
git commit -m "feat: módulo form-errors (erro por campo + toast + foco)"
```

---

### Task 2: Helpers de step do wizard de tools

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts` (create)

Esses helpers permitem o wizard (a) setar erros por campo do passo atual ao tentar avançar e (b) navegar até o primeiro passo com erro no submit final.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";
import { firstStepWithError, getStepFieldErrors } from "../tool-form-steps";

describe("getStepFieldErrors", () => {
	it("retorna erro por campo só dos campos do passo", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "" };
		const errors = getStepFieldErrors(values, "identity");
		expect(errors.name).toBeTruthy();
	});

	it("vazio quando o passo não tem erro", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };
		const errors = getStepFieldErrors(values, "identity");
		expect(errors.name).toBeUndefined();
	});
});

describe("firstStepWithError", () => {
	it("retorna 'identity' quando o nome está vazio", () => {
		const values = { ...EMPTY_TOOL_VALUES, name: "" };
		expect(firstStepWithError(values)).toBe("identity");
	});

	it("retorna null quando tudo válido para draft", () => {
		const values = {
			...EMPTY_TOOL_VALUES,
			name: "Furadeira",
			weightKg: 1,
			lengthCm: 1,
			widthCm: 1,
			heightCm: 1,
			categoryIds: ["c1"],
			primaryCategoryId: "c1",
		};
		expect(firstStepWithError(values)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test tool-form-steps`
Expected: FAIL — `getStepFieldErrors` / `firstStepWithError` não exportados.

- [ ] **Step 3: Implement the helpers**

Em `tool-form-steps.ts`, adicionar ao final (usa `toolFormSchema`, `STEP_FIELDS`, `TOOL_STEPS`, `ToolStepId`, `ToolFormValues` já no arquivo):

```ts
export function getStepFieldErrors(
	values: unknown,
	stepId: ToolStepId
): Partial<Record<keyof ToolFormValues, string>> {
	const parsed = toolFormSchema.safeParse(values);
	if (parsed.success) {
		return {};
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const out: Partial<Record<keyof ToolFormValues, string>> = {};
	for (const issue of parsed.error.issues) {
		const key = issue.path[0] as keyof ToolFormValues | undefined;
		if (key && fields.has(String(key)) && out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out;
}

export function firstStepWithError(values: unknown): ToolStepId | null {
	const parsed = toolFormSchema.safeParse(values);
	if (parsed.success) {
		return null;
	}
	for (const step of TOOL_STEPS) {
		if (stepHasErrors(parsed, step.id)) {
			return step.id;
		}
	}
	return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test tool-form-steps`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts \
  apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts
git commit -m "feat: helpers getStepFieldErrors e firstStepWithError do wizard"
```

---

### Task 3: Migrar tools (use-tool-submit + wizard + edit-view)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx`

- [ ] **Step 1: Reescrever `use-tool-submit.ts`**

Substituir o conteúdo de `use-tool-submit.ts` por (remove `issues`/`setIssues`/`errorRef`/`FormIssue`; adiciona callback `onValidationFail`):

```ts
"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useState, useTransition } from "react";
import { errorToastMessage, focusFirstError } from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { useToolFormContext } from "./tool-form-context";
import type { ToolFormState } from "./tool-form-state";
import type { ToolFormValues } from "./tool-schema";
import { parseToolForm, persistTool } from "./tool-submit";

const SUCCESS_MESSAGE: Record<"create" | "edit", string> = {
	create: "Ferramenta criada com sucesso",
	edit: "Ferramenta atualizada com sucesso",
};

interface UseToolSubmitArgs {
	mode: "create" | "edit";
	setErrors: Dispatch<SetStateAction<Partial<Record<keyof ToolFormValues, string>>>>;
	values: ToolFormState;
	/** Wizard injeta para navegar até o passo com erro antes de focar. */
	onValidationFail?: (errorKeys: string[]) => void;
}

export function useToolSubmit({ mode, values, setErrors, onValidationFail }: UseToolSubmitArgs) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const [isPending, startTransition] = useTransition();

	function submit() {
		const parsed = parseToolForm(values);
		setErrors(parsed.fieldErrors);
		if (!(parsed.ok && parsed.data)) {
			notify.error(errorToastMessage(parsed.issues.length));
			if (onValidationFail) {
				onValidationFail(Object.keys(parsed.fieldErrors));
			} else {
				focusFirstError();
			}
			return;
		}
		const data = parsed.data;
		startTransition(async () => {
			const res = await persistTool(mode, data, toolId);
			if (res.ok) {
				notify.success(SUCCESS_MESSAGE[mode]);
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				notify.error(res.error || "Falha ao salvar");
			}
		});
	}

	return { submit, isPending };
}
```

- [ ] **Step 2: Atualizar `tool-wizard.tsx`**

Mudanças:
1. Remover `import { FormErrorPanel } from "@/components/form-error-panel";`.
2. Adicionar imports: `import { errorToastMessage, focusFirstError } from "@/lib/form-errors";` e `import { notify } from "@/lib/notify";` e em `./tool-form-steps` incluir `getStepFieldErrors`, `firstStepWithError`, `STEP_FIELDS`.
3. Trocar a desestruturação `const { submit, isPending, issues, setIssues, errorRef } = useToolSubmit({...})` por:

```tsx
const handleValidationFail = (errorKeys: string[]) => {
	const idx = TOOL_STEPS.findIndex((s) =>
		(STEP_FIELDS[s.id] as readonly string[]).some((f) => errorKeys.includes(f))
	);
	if (idx >= 0) {
		setActive(idx);
	}
	focusFirstError();
};
const { submit, isPending } = useToolSubmit({
	mode: "create",
	values,
	setErrors,
	onValidationFail: handleValidationFail,
});
```

(`setActive` é declarado logo abaixo — mover a declaração `const [active, setActive] = useState(0)` para ANTES de `useToolSubmit`, ou usar uma `ref`/função. Mais simples: declarar `const [active, setActive] = useState(0)` antes do `useToolSubmit`.)

4. Reescrever `next()` para usar erro por campo + foco em vez de `setIssues`:

```tsx
function next() {
	const stepErrors = getStepFieldErrors(values, step.id);
	if (Object.keys(stepErrors).length > 0 && !step.optional) {
		setErrors(stepErrors);
		notify.error(errorToastMessage(Object.keys(stepErrors).length));
		focusFirstError();
		return;
	}
	setActive((i) => Math.min(i + 1, TOOL_STEPS.length - 1));
}
```

5. Remover a linha `<FormErrorPanel issues={issues} ref={errorRef} />` (linha ~93).

- [ ] **Step 3: Atualizar `tool-edit-view.tsx`**

1. Remover `import { FormErrorPanel } ...`.
2. Remover a linha `<FormErrorPanel issues={issues} ref={errorRef} />` (linha ~59).
3. Ajustar a desestruturação de `useToolSubmit` para `{ submit, isPending }` (sem `issues`/`errorRef`). O edit-view não passa `onValidationFail` → `focusFirstError()` roda direto (sem steps).

- [ ] **Step 4: Verify types + tests**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test`
Expected: sem erros de tipo; suíte verde.

- [ ] **Step 5: Smoke no browser (porta 3008)**

1. `http://localhost:3008/dashboard/tools/new` (tab 226480268): clicar "Criar ferramenta" com o form vazio.
   - Esperado: toast "N erros — corrija os campos destacados"; **sem** caixa vermelha; o wizard navega ao passo "Identidade" e foca o campo Nome (com `aria-invalid`, `<p>` vermelho abaixo).
2. Preencher Nome, clicar "Próximo" pulando campo obrigatório de outro passo → toast + foco no campo do passo.
3. Editar uma tool existente (`/dashboard/tools/<id>/edit`), apagar o Nome, salvar → toast + foco no campo, sem caixa.
4. `read_console_messages` (`onlyErrors`): sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts \
  apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx \
  apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx
git commit -m "refactor: tools usa toast + foco no campo, sem FormErrorPanel"
```

---

### Task 4: Migrar attribute-form + category-form

Ambos já têm `errors` por campo; só removem o painel e a lista de issues, e ganham foco.

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`
- Modify: `apps/web/src/app/dashboard/categories/_components/category-form.tsx`

- [ ] **Step 1: `attribute-form.tsx`**

1. Remover `import { FormErrorPanel } ...` (e `FormIssue` se importado).
2. Adicionar `import { errorToastMessage, focusFirstError } from "@/lib/form-errors";`.
3. Remover o state `const [allIssues, setAllIssues] = useState<...>([])` e todos os `setAllIssues(...)`.
4. Remover a linha `<FormErrorPanel issues={allIssues} />`.
5. No submit, onde hoje faz `setAllIssues(...)` + `notify.error("... veja detalhes acima")`, deixar:

```ts
setErrors(fieldErrors);
notify.error(errorToastMessage(issues.length));
focusFirstError();
return;
```

(`issues` aqui é o array local já calculado antes do `setAllIssues`; se ele só existia para o painel, usar `parsed.error.issues.length` ou o length de `fieldErrors`. Use `Object.keys(fieldErrors).length` se `issues` for removido.)

- [ ] **Step 2: `category-form.tsx`**

1. Remover `import { FormErrorPanel, type FormIssue } ...`.
2. Adicionar `import { errorToastMessage, focusFirstError } from "@/lib/form-errors";`.
3. Remover `const [formIssues, setFormIssues] = useState<FormIssue[]>([])` e os `setFormIssues(...)`.
4. Remover a função local `buildFormIssues` (não mais usada).
5. Remover `<FormErrorPanel issues={formIssues} />`.
6. No submit, manter `setErrors(zodErrorsToFieldMap(parsed.error))` (mantém o remap slug→name), e trocar o resto por:

```ts
setErrors(zodErrorsToFieldMap(parsed.error));
notify.error(errorToastMessage(parsed.error.issues.length));
focusFirstError();
return;
```

- [ ] **Step 3: Verify**

Run: `bun --cwd apps/web check-types && bunx ultracite check apps/web/src/app/dashboard/categories/_components/attribute-form.tsx apps/web/src/app/dashboard/categories/_components/category-form.tsx`
Expected: sem erros.

- [ ] **Step 4: Smoke (porta 3008)**

`/dashboard/categories`: abrir criação de categoria e de atributo, submeter inválido → toast + foco no campo, sem caixa. Console sem erros.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/attribute-form.tsx \
  apps/web/src/app/dashboard/categories/_components/category-form.tsx
git commit -m "refactor: categories/attribute forms usam toast + foco, sem painel"
```

---

### Task 5: Migrar promotion-form + social-settings-form

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`
- Modify: `apps/web/src/app/dashboard/site/settings/_components/social-settings-form.tsx`

- [ ] **Step 1: `promotion-form.tsx`**

1. Remover `import { FormErrorPanel, ... zodIssuesToFormIssues } ...` (manter nada de form-error-panel).
2. Adicionar `import { errorToastMessage, focusFirstError, zodIssuesToFieldErrors } from "@/lib/form-errors";`.
3. Remover `const [formIssues, setFormIssues] = useState<FormIssue[]>([])` e `setFormIssues`.
4. Remover `<FormErrorPanel issues={formIssues} />` (manter o banner inline de `serverError`, que é erro de server action, não Zod).
5. No submit (path de validação), trocar para:

```ts
const fieldErrors = zodIssuesToFieldErrors<PromotionFormValues>(parsed.error);
setErrors(fieldErrors);
notify.error(errorToastMessage(parsed.error.issues.length));
focusFirstError();
return;
```

(O `errors` já é passado a `<PromotionFormFields errors={errors} />` — confirmar que o tipo do state `errors` aceita o retorno; se for `Record<string,string>`, ok.)

- [ ] **Step 2: `social-settings-form.tsx`**

1. Remover `import { FormErrorPanel, type FormIssue, zodIssuesToFormIssues } ...`.
2. Adicionar `import { errorToastMessage, focusFirstError } from "@/lib/form-errors";`.
3. Remover `const [issues, setIssues] = useState<FormIssue[]>([])` e `setIssues`.
4. Remover `<FormErrorPanel issues={issues} />`.
5. No submit, trocar `setIssues(...)` por:

```ts
notify.error(errorToastMessage(parsed.error.issues.length));
focusFirstError();
return;
```

(Os inputs já têm `aria-invalid={invalidUrl}` reativo — o `focusFirstError` encontra o primeiro inválido sem depender de novo state.)

- [ ] **Step 3: Verify + smoke + commit**

Run: `bun --cwd apps/web check-types`
Smoke: `/dashboard/promotions` (criar promoção inválida) e `/dashboard/site/settings` (URL social inválida) → toast + foco, sem caixa.

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx \
  apps/web/src/app/dashboard/site/settings/_components/social-settings-form.tsx
git commit -m "refactor: promotions e social settings usam toast + foco, sem painel"
```

---

### Task 6: Branch — erro por campo (form-fields compartilhado) + form + edit-sheet

`branch-form-fields.tsx` é usado pelo `branch-form.tsx` (página) e pelo `branch-edit-sheet.tsx` (drawer). Adicionar `errors` aqui cobre os dois.

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx`

- [ ] **Step 1: `branch-form-fields.tsx` — aceitar e renderizar `errors`**

1. Adicionar à interface `Props`: `errors?: Partial<Record<keyof BranchFormValues, string>>;` e desestruturar com default `errors = {}`.
2. Para cada campo top-level simples (`name`, `phone`, `cep`, `street`, `streetNumber`, `complement`, `neighborhood`, `city`, `state`, `status`), adicionar ao input/select `aria-invalid={errors.<campo> ? true : undefined}` e logo abaixo `{errors.<campo> && <p className="text-destructive text-xs">{errors.<campo>}</p>}`.
3. Para os blocos aninhados `businessHours` e `cepRanges`: renderizar uma única `<p className="text-destructive text-xs">{errors.businessHours}</p>` / `{errors.cepRanges}` abaixo do respectivo bloco (não por sub-campo). Não passar `aria-invalid` nesses (não há um input único).

- [ ] **Step 2: `branch-form.tsx` — usar erro por campo**

1. Remover `import { FormErrorPanel, type FormIssue, zodIssuesToFormIssues } ...`.
2. Adicionar `import { errorToastMessage, focusFirstError, zodIssuesToFieldErrors } from "@/lib/form-errors";`.
3. Trocar `const [issues, setIssues] = useState<FormIssue[]>([])` por `const [errors, setErrors] = useState<Partial<Record<keyof BranchFormValues, string>>>({})`.
4. Remover `<FormErrorPanel issues={issues} />`.
5. No `handleSubmit`: `setErrors({})` no início; no ramo de falha:

```ts
const fieldErrors = zodIssuesToFieldErrors<BranchFormValues>(parsed.error);
setErrors(fieldErrors);
notify.error(errorToastMessage(parsed.error.issues.length));
focusFirstError();
return;
```

6. Passar `errors={errors}` para `<BranchFormFields ... />`.

- [ ] **Step 3: `branch-edit-sheet.tsx` — usar erro por campo**

1. Remover `useState<FormIssue[]>` / `zodIssuesToFormIssues` / `FormIssue` imports.
2. Adicionar `import { errorToastMessage, focusFirstError, zodIssuesToFieldErrors } from "@/lib/form-errors";`.
3. Trocar o state de issues por `const [errors, setErrors] = useState<Partial<Record<keyof BranchFormValues, string>>>({})`.
4. No `handleSubmit`, ramo de falha igual ao Step 2.5.
5. Remover a prop `issues={issues}` do `<EntityEditSheet>` e passar `errors={errors}` para `<BranchFormFields>`.

- [ ] **Step 4: Verify**

Run: `bun --cwd apps/web check-types`
Expected: sem erros (a remoção de `issues` do EntityEditSheet acontece na Task 9 — até lá, passar `issues` ainda compila; este passo só adiciona `errors`).

- [ ] **Step 5: Smoke (porta 3008)**

`/dashboard/branches/new` (ou criar): submeter sem nome → toast + foco no Nome + `<p>` vermelho. Editar uma filial pelo drawer (`?edit=1`) com nome vazio → idem. Sem caixa. Console limpo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx \
  apps/web/src/app/dashboard/branches/_components/branch-form.tsx \
  apps/web/src/app/dashboard/branches/[id]/_components/branch-edit-sheet.tsx
git commit -m "feat: branches com erro por campo + toast, sem painel"
```

---

### Task 7: Supplier — erro por campo (form-fields compartilhado) + form + edit-sheet

Análogo ao branch, porém **mais simples** (6 campos top-level, sem aninhamento).

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-form.tsx`
- Modify: `apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx`

- [ ] **Step 1: `supplier-form-fields.tsx`**

Adicionar `errors?: Partial<Record<keyof SupplierFormValues, string>>` à `Props` (default `{}`). Para cada campo (`name`, `contactEmail`, `phone`, `website`, `cnpj`, `notes`): `aria-invalid={errors.<campo> ? true : undefined}` no input/textarea + `{errors.<campo> && <p className="text-destructive text-xs">{errors.<campo>}</p>}` abaixo.

- [ ] **Step 2: `supplier-form.tsx`**

Mesmas trocas do branch (Task 6 Step 2): remover painel/issues, adicionar `errors` state, `zodIssuesToFieldErrors<SupplierFormValues>` + `errorToastMessage` + `focusFirstError` no submit, passar `errors` ao field component.

- [ ] **Step 3: `supplier-edit-sheet.tsx`**

Mesmas trocas do branch-edit-sheet (Task 6 Step 3): remover `issues` do `<EntityEditSheet>`, adicionar `errors` state + passar a `<SupplierFormFields>`.

- [ ] **Step 4: Verify + smoke + commit**

Run: `bun --cwd apps/web check-types`
Smoke: criar fornecedor sem nome / editar pelo drawer → toast + foco, sem caixa.

```bash
git add apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx \
  apps/web/src/app/dashboard/suppliers/_components/supplier-form.tsx \
  apps/web/src/app/dashboard/suppliers/[id]/_components/supplier-edit-sheet.tsx
git commit -m "feat: suppliers com erro por campo + toast, sem painel"
```

---

### Task 8: shipping-settings-form + customer-profile-form

**Files:**
- Modify: `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx`
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-profile-form.tsx`

- [ ] **Step 1: `shipping-settings-form.tsx` (inline, com schema)**

1. Remover `FormErrorPanel`/`FormIssue`/`zodIssuesToFormIssues` imports.
2. Adicionar `import { errorToastMessage, focusFirstError, zodIssuesToFieldErrors } from "@/lib/form-errors";`.
3. Trocar `issues` state por `const [errors, setErrors] = useState<Record<string, string>>({})`.
4. Remover `<FormErrorPanel issues={issues} />`.
5. No submit, ramo de falha: `setErrors(zodIssuesToFieldErrors(parsed.error)); notify.error(errorToastMessage(parsed.error.issues.length)); focusFirstError(); return;`.
6. Nos campos `originBranchId`, `insurancePolicy`, `insuranceCapAmount`: `aria-invalid={errors.<campo> ? true : undefined}` + `{errors.<campo> && <p className="text-destructive text-xs">{errors.<campo>}</p>}`.

- [ ] **Step 2: `customer-profile-form.tsx` (sem schema Zod — migração trivial)**

Este form não valida com Zod; o painel só mostrava o `result.error` da server action, que **já** é exibido via `notify.error(result.error)`. Então:
1. Remover `import { FormErrorPanel, type FormIssue } ...`.
2. Remover `const [issues, setIssues] = useState<FormIssue[]>([])` e os `setIssues([...])`.
3. Remover o bloco `{issues.length > 0 && <FormErrorPanel issues={issues} />}`.
4. O `notify.error(result.error)` no ramo de falha permanece (já existe). Nada mais a fazer — o toast já cobre.

- [ ] **Step 3: Verify + smoke + commit**

Run: `bun --cwd apps/web check-types`
Smoke: `/dashboard/site/settings` (shipping) inválido → toast + foco. Editar perfil de cliente com erro de server → toast (sem caixa).

```bash
git add apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx \
  apps/web/src/app/dashboard/customers/_components/customer-profile-form.tsx
git commit -m "refactor: shipping settings e customer profile sem FormErrorPanel"
```

---

### Task 9: user-edit-sheet + remover prop `issues` do entity-edit-sheet

**Files:**
- Modify: `apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx`
- Modify: `apps/web/src/components/entity/entity-edit-sheet.tsx`

- [ ] **Step 1: `user-edit-sheet.tsx` (campos inline)**

1. Remover `useState<FormIssue[]>` / `zodIssuesToFormIssues` / `FormIssue` imports.
2. Adicionar `import { errorToastMessage, focusFirstError, zodIssuesToFieldErrors } from "@/lib/form-errors";`.
3. Trocar issues por `const [errors, setErrors] = useState<Record<string, string>>({})`.
4. No `handleSubmit`, ramo de falha: `setErrors(zodIssuesToFieldErrors(parsed.error)); notify.error(errorToastMessage(parsed.error.issues.length)); focusFirstError(); return;`.
5. Remover a prop `issues={issues}` do `<EntityEditSheet>`.
6. No campo `name`: `aria-invalid={errors.name ? true : undefined}` no `<Input>` + `{errors.name && <p className="text-destructive text-xs">{errors.name}</p>}`. Para `role`/`emailVerified`: `{errors.role && <p ...>}` / `{errors.emailVerified && <p ...>}` abaixo do wrapper.

- [ ] **Step 2: `entity-edit-sheet.tsx` — remover o painel e a prop**

1. Remover `import { FormErrorPanel, type FormIssue } from "@/components/form-error-panel";`.
2. Remover `issues?: FormIssue[];` da interface `Props` e da desestruturação.
3. Remover o bloco:

```tsx
{issues && issues.length > 0 ? (
	<div className="mb-4">
		<FormErrorPanel issues={issues} />
	</div>
) : null}
```

- [ ] **Step 3: Verify (este passo fecha o contrato de tipos)**

Run: `bun --cwd apps/web check-types`
Expected: sem erros. Se algum caller ainda passar `issues={...}` ao `EntityEditSheet`, o TS aponta aqui — corrigir o caller (deve ter sido feito nas Tasks 6/7). O `dev-preview/entity-preview/page.tsx` nunca passou `issues`, então não quebra.

- [ ] **Step 4: Smoke + commit**

Smoke: editar usuário pelo drawer com nome vazio → toast + foco; abrir `/dashboard/dev-preview/entity-preview` para confirmar que o sheet genérico ainda renderiza.

```bash
git add apps/web/src/app/dashboard/users/_components/user-edit-sheet.tsx \
  apps/web/src/components/entity/entity-edit-sheet.tsx
git commit -m "refactor: user edit sheet + entity-edit-sheet sem FormErrorPanel"
```

---

### Task 10: Limpeza — deletar form-error-panel.tsx + atualizar CLAUDE.md

**Files:**
- Delete: `apps/web/src/components/form-error-panel.tsx`
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Confirmar que não há mais imports**

Run: `cd apps/web && ugrep -rl "form-error-panel" src; echo "---"; ugrep -rl "FormErrorPanel" src`
Expected: nenhuma saída (zero arquivos). Se houver, migrar o arquivo restante antes de prosseguir.

- [ ] **Step 2: Deletar o componente**

```bash
git rm apps/web/src/components/form-error-panel.tsx
```

- [ ] **Step 3: Atualizar `apps/web/CLAUDE.md`**

Na seção "Convenções de UX em forms", substituir o bullet **"Painel de erros no topo"** por:

```md
- **Feedback de erro de validação:** sem caixa de erros no topo. Cada campo inválido recebe `aria-invalid` + `<p className="text-destructive text-xs">{erro}</p>` abaixo (padrão de `identity-fields.tsx`). No submit com falha, disparar `notify.error(errorToastMessage(count))` e `focusFirstError()` (ambos de `src/lib/form-errors.ts`), que rola/foca o primeiro `[aria-invalid="true"]`. NUNCA `toast.error("Revise os campos")` genérico sem marcar os campos.
```

- [ ] **Step 4: Verify final completo**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test && bun check`
Expected: tipos OK, suíte verde, lint (ultracite) limpo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/form-error-panel.tsx apps/web/CLAUDE.md
git commit -m "chore: remove FormErrorPanel e atualiza convenção de erros no CLAUDE.md"
```

---

## Self-Review

**Spec coverage (Fase A do spec):**
- A1 módulo `form-errors.ts` → Task 1. ✓
- A2 hook/funções de erro → Task 1 (funções puras; optou-se por funções + state local por form em vez de hook, por encaixar melhor nos forms existentes). ✓
- A3 forms com erro por campo (tools, attribute, category) → Tasks 3, 4. ✓ (promotion/social na Task 5.)
- A4 forms sem erro por campo (branches, suppliers, customers, shipping) → Tasks 6, 7, 8. ✓
- A5 entity-edit-sheet + edit-sheets → Tasks 6, 7, 9. ✓
- A6 wizard navega ao passo com erro → Tasks 2, 3. ✓
- A7 deletar form-error-panel + CLAUDE.md → Task 10. ✓
- A8 testes + smoke → Tasks 1, 2 (unit), smoke em cada task. ✓

**Placeholder scan:** sem TBD/TODO. Steps de código têm o código. Onde o form é repetitivo (campos), o padrão concreto está dado + a lista exata de campos por form (do mapeamento).

**Type consistency:** `zodIssuesToFieldErrors<T>(error): Partial<Record<keyof T & string, string>>`, `errorToastMessage(count): string`, `focusFirstError(container?)` — usados consistentemente. `getStepFieldErrors`/`firstStepWithError` em `tool-form-steps.ts`. O state de `errors` por form é `Partial<Record<keyof Schema, string>>` (ou `Record<string,string>` nos forms sem schema tipado forte).

**Ordem/dependências:** Task 1 e 2 (base) antes de tudo. Tasks 6/7 adicionam `errors` aos field-fields e removem `issues` dos respectivos callers ANTES da Task 9 remover a prop `issues` do `EntityEditSheet` — assim o `check-types` da Task 9 fecha o contrato sem quebrar. Task 10 (deletar) por último.

**Decisão registrada:** campos aninhados de branch (`businessHours`, `cepRanges`) mostram erro no nível do bloco, não por sub-campo — simplificação consciente; o toast + foco no primeiro campo simples cobre o caso comum.

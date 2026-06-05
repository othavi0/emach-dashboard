# #122 Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o #122 — retrofit do `HelpTooltip` em 3 forms, dedup wizard↔edit-view, e 4 refinamentos (parse-once, stale closure, exhaustiveness assert, WCAG Esc).

**Architecture:** Extrair a fonte única `TOOL_SECTION_COMPONENTS` + hook `useToolSubmit(mode)` consumidos por `ToolWizard` e `ToolEditView`; tornar `patch` capaz de updater funcional; trocar `getStepIssues` por parse-único + filtro puro; `satisfies` em `STEP_FIELDS` com assert de cobertura; espalhar `ⓘ` nos `<Label>` dos forms de filial/fornecedor/categoria.

**Tech Stack:** Next 16 / React 19 (React Compiler on), `@base-ui/react` v1.4 (`PreviewCard`/`Tooltip`), Zod, Biome/ultracite.

**Verificação (todas as tasks):** este projeto não tem harness de teste para os client components/hooks de form. O gate automatizado é `bun check-types` + `bun check`; o gate manual é smoke visual nas rotas afetadas. Para o assert type-level (Task 5) o próprio `check-types` é o teste.

---

## File Structure

- **Create:** `apps/web/src/app/dashboard/tools/_components/tool-sections.ts` — mapa único `ToolStepId → Component`.
- **Create:** `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts` — hook de submit compartilhado.
- **Modify:** `tool-wizard.tsx`, `tool-edit-view.tsx` — consumir os dois acima.
- **Modify:** `tool-form-steps.ts` — parse-once (`filterStepIssues`/`stepHasErrors`) + `satisfies` + assert.
- **Modify:** `tool-form-state.ts` + `fields/types.ts` — `patch`/`onPatch` aceitam updater funcional.
- **Modify:** `fields/identity-fields.tsx` — `toggleCategory` funcional.
- **Modify:** `branches/_components/branch-form-fields.tsx`, `suppliers/_components/supplier-form-fields.tsx`, `categories/_components/attribute-form.tsx` — `HelpTooltip`.
- **Modify:** `CLAUDE.md` (raiz) + `apps/web/CLAUDE.md` — documentar decisões.

---

## Task 1: Dedup — `TOOL_SECTION_COMPONENTS` + `useToolSubmit`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-sections.ts`
- Create: `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx`

- [ ] **Step 1: Criar o mapa único de seções**

`tool-sections.ts`:

```ts
import type { ComponentType } from "react";

import { FiscalFields } from "./fields/fiscal-fields";
import { IdentityFields } from "./fields/identity-fields";
import { LogisticsFields } from "./fields/logistics-fields";
import { PublishFields } from "./fields/publish-fields";
import { SpecFields } from "./fields/spec-fields";
import type { ToolFieldGroupProps } from "./fields/types";
import { VariantFields } from "./fields/variant-fields";
import type { ToolStepId } from "./tool-form-steps";

export const TOOL_SECTION_COMPONENTS: Record<
	ToolStepId,
	ComponentType<ToolFieldGroupProps>
> = {
	identity: IdentityFields,
	variants: VariantFields,
	specs: SpecFields,
	logistics: LogisticsFields,
	fiscal: FiscalFields,
	publish: PublishFields,
};
```

- [ ] **Step 2: Criar o hook de submit**

`use-tool-submit.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import type { FormIssue } from "@/components/form-error-panel";
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
	setErrors: Dispatch<
		SetStateAction<Partial<Record<keyof ToolFormValues, string>>>
	>;
	values: ToolFormState;
}

export function useToolSubmit({ mode, values, setErrors }: UseToolSubmitArgs) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [isPending, startTransition] = useTransition();
	const errorRef = useRef<HTMLDivElement | null>(null);

	function submit() {
		const parsed = parseToolForm(values);
		setErrors(parsed.fieldErrors);
		setIssues(parsed.issues);
		if (!(parsed.ok && parsed.data)) {
			toast.error(
				`${parsed.issues.length} erro${parsed.issues.length === 1 ? "" : "s"} — veja detalhes acima`
			);
			requestAnimationFrame(() =>
				errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
			);
			return;
		}
		const data = parsed.data;
		startTransition(async () => {
			const res = await persistTool(mode, data, toolId);
			if (res.ok) {
				toast.success(SUCCESS_MESSAGE[mode]);
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				toast.error(res.error || "Falha ao salvar");
			}
		});
	}

	return { submit, isPending, issues, setIssues, errorRef };
}
```

- [ ] **Step 3: Reescrever `tool-wizard.tsx` pra consumir ambos**

Substituir o topo do componente (imports + estado + `submit`) e o uso de `STEP_COMPONENT`. Remover: `STEP_COMPONENT` local, `useRouter`, `useTransition`, `useRef`, `toast`, `parseToolForm`/`persistTool` imports, e o `submit()` local. Resultado dos imports relevantes e do corpo até `submit`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Check } from "lucide-react";
import { useState } from "react";

import { FormErrorPanel } from "@/components/form-error-panel";
import { type ToolFormState, useToolFormState } from "./tool-form-state";
import { getStepIssues, TOOL_STEPS, type ToolStepId } from "./tool-form-steps";
import { TOOL_SECTION_COMPONENTS } from "./tool-sections";
import { useToolSubmit } from "./use-tool-submit";

export function ToolWizard({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const { submit, isPending, issues, setIssues, errorRef } = useToolSubmit({
		mode: "create",
		values,
		setErrors,
	});
	const [active, setActive] = useState(0);

	// active é controlado por setActive com clamp — nunca sai dos bounds
	// biome-ignore lint/style/noNonNullAssertion: array constante não-vazio, índice clamped
	const step = TOOL_STEPS[Math.min(active, TOOL_STEPS.length - 1)]!;
	const Fields = TOOL_SECTION_COMPONENTS[step.id];

	function stepDone(stepId: ToolStepId): boolean {
		return getStepIssues(values, stepId).length === 0;
	}

	function next() {
		const stepIssues = getStepIssues(values, step.id);
		setIssues(stepIssues);
		if (stepIssues.length > 0 && !step.optional) {
			return;
		}
		setActive((i) => Math.min(i + 1, TOOL_STEPS.length - 1));
	}
```

O JSX abaixo de `next()` (o `return (...)`) permanece **idêntico** ao atual — usa `issues`, `errorRef`, `isPending`, `submit`, `Fields`, `stepDone`, `next`, `setActive`, `active`, `patch`, `errors`, `values`, todos ainda em escopo. (`stepDone` será otimizado na Task 3 — não mexer aqui.)

- [ ] **Step 4: Reescrever `tool-edit-view.tsx` pra consumir ambos**

Remover `SECTION` local, `useTransition`, `useRef`, `toast`, `parseToolForm`/`persistTool` imports e o `submit()` local. **Manter** `useRouter` (o botão Cancelar usa `router.push`). Topo resultante:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";

import { FormErrorPanel } from "@/components/form-error-panel";
import { type ToolFormState, useToolFormState } from "./tool-form-state";
import { TOOL_STEPS } from "./tool-form-steps";
import { TOOL_SECTION_COMPONENTS } from "./tool-sections";
import { useToolSubmit } from "./use-tool-submit";

export function ToolEditView({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const router = useRouter();
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const { submit, isPending, issues, errorRef } = useToolSubmit({
		mode: "edit",
		values,
		setErrors,
	});
```

No JSX, trocar `const Fields = SECTION[s.id];` por `const Fields = TOOL_SECTION_COMPONENTS[s.id];`. Resto do `return (...)` permanece idêntico (usa `router` no Cancelar, `issues`, `errorRef`, `isPending`, `submit`).

- [ ] **Step 5: Verificar tipos e lint**

Run: `bun check-types && bun check`
Expected: PASS, sem erros. Em especial, nenhum "unused import" em wizard/edit-view.

- [ ] **Step 6: Smoke visual do submit**

Run: `bun dev:web` e visitar `/dashboard/tools/new` (criar) e `/dashboard/tools/<id>/edit` (editar). Confirmar: submit com erro mostra painel + scroll + toast de contagem; submit válido cria/edita, toasta sucesso e redireciona pra `/dashboard/tools`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-sections.ts apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx
git commit -m "refactor(tools): fonte única de seções + useToolSubmit (dedup wizard/edit)"
```

---

## Task 2: `patch` funcional + `toggleCategory` (3c)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/types.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx`

- [ ] **Step 1: Exportar tipo `ToolPatch` e aceitar updater em `patch`**

Em `tool-form-state.ts`, adicionar o tipo exportado e trocar `patch`:

```ts
export type ToolPatch = (
	next:
		| Partial<ToolFormState>
		| ((prev: ToolFormState) => Partial<ToolFormState>)
) => void;
```

E dentro de `useToolFormState`:

```ts
	const patch = useCallback<ToolPatch>((next) => {
		setValues((prev) => ({
			...prev,
			...(typeof next === "function" ? next(prev) : next),
		}));
	}, []);
```

- [ ] **Step 2: Apontar `onPatch` pro tipo compartilhado**

Em `fields/types.ts`:

```ts
import type { ToolFormState, ToolPatch } from "../tool-form-state";
import type { ToolFormValues } from "../tool-schema";

export interface ToolFieldGroupProps {
	disabled?: boolean;
	errors: Partial<Record<keyof ToolFormValues, string>>;
	onPatch: ToolPatch;
	values: ToolFormState;
}
```

- [ ] **Step 3: `toggleCategory` deriva da forma funcional**

Em `fields/identity-fields.tsx`, substituir a função `toggleCategory` por:

```tsx
	function toggleCategory(catId: string, checked: boolean) {
		onPatch((prev) => {
			if (checked) {
				const next = [...prev.categoryIds, catId];
				return {
					categoryIds: next,
					primaryCategoryId:
						next.length === 1 ? catId : prev.primaryCategoryId,
				};
			}
			const next = prev.categoryIds.filter((c) => c !== catId);
			return {
				categoryIds: next,
				primaryCategoryId:
					prev.primaryCategoryId === catId
						? (next[0] ?? "")
						: prev.primaryCategoryId,
			};
		});
	}
```

- [ ] **Step 4: Verificar tipos/lint**

Run: `bun check-types && bun check`
Expected: PASS. Os demais `onPatch({...})` (objeto) continuam válidos porque `ToolPatch` aceita os dois.

- [ ] **Step 5: Smoke**

No wizard `/new`, passo 1: marcar/desmarcar categorias, alternar a principal (★). Comportamento idêntico ao anterior; primeira seleção não é mais dropada em cliques rápidos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-form-state.ts apps/web/src/app/dashboard/tools/_components/fields/types.ts apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx
git commit -m "fix(tools): patch funcional em toggleCategory (evita drop de seleção em cliques no mesmo frame)"
```

---

## Task 3: Parse-único no stepper (3a)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`

- [ ] **Step 1: Separar parse de filtragem em `tool-form-steps.ts`**

Substituir a função `getStepIssues` (linhas finais do arquivo) por estas três:

```ts
export function filterStepIssues(
	result: ReturnType<typeof toolFormSchema.safeParse>,
	stepId: ToolStepId
): FormIssue[] {
	if (result.success) {
		return [];
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const scoped = result.error.issues.filter(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
	if (scoped.length === 0) {
		return [];
	}
	return zodIssuesToFormIssues(
		{ issues: scoped } as Parameters<typeof zodIssuesToFormIssues>[0],
		FIELD_LABELS
	);
}

export function stepHasErrors(
	result: ReturnType<typeof toolFormSchema.safeParse>,
	stepId: ToolStepId
): boolean {
	if (result.success) {
		return false;
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	return result.error.issues.some(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
}

export function getStepIssues(
	values: unknown,
	stepId: ToolStepId
): FormIssue[] {
	return filterStepIssues(toolFormSchema.safeParse(values), stepId);
}
```

- [ ] **Step 2: Wizard usa parse único pro `stepDone`**

Em `tool-wizard.tsx`, importar `stepHasErrors` e `toolFormSchema`, e computar o parse uma vez. Atualizar imports e `stepDone`:

```tsx
import { getStepIssues, stepHasErrors, TOOL_STEPS, type ToolStepId } from "./tool-form-steps";
import { toolFormSchema } from "./tool-schema";
```

E no corpo, logo após obter `step`/`Fields`:

```tsx
	// parse único por render — React Compiler memoiza sobre `values`;
	// evita 6× safeParse no loop do stepper (um por stepDone)
	const parsed = toolFormSchema.safeParse(values);

	function stepDone(stepId: ToolStepId): boolean {
		return !stepHasErrors(parsed, stepId);
	}
```

`next()` segue usando `getStepIssues(values, step.id)` (uma vez por clique, não por render — ok).

- [ ] **Step 3: Verificar**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 4: Smoke**

No wizard `/new`: preencher passo a passo; os checks verdes (`Check`) nos steps concluídos acendem corretamente conforme cada passo fica válido.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx
git commit -m "perf(tools): parse único do schema no stepper (stepHasErrors sobre safeParse memoizado)"
```

---

## Task 4: Assert de exaustividade de `STEP_FIELDS` (3d)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`

- [ ] **Step 1: `satisfies` + assert type-level**

Trocar a declaração `export const STEP_FIELDS: Record<ToolStepId, (keyof ToolFormValues)[]> = {` por `export const STEP_FIELDS = {` e, no fechamento, trocar `};` por `} satisfies Record<ToolStepId, (keyof ToolFormValues)[]>;`. Logo abaixo do bloco, adicionar:

```ts
// Garante em tempo de compilação que todo campo do schema está coberto por algum
// passo. Um campo `required` novo que não entre em STEP_FIELDS deixaria de
// bloquear qualquer passo (só pegaria no submit final) — aqui quebra o build.
type _UncoveredField = Exclude<
	keyof ToolFormValues,
	(typeof STEP_FIELDS)[ToolStepId][number]
>;
const _stepFieldsAreExhaustive: _UncoveredField extends never
	? true
	: ["faltam campos em STEP_FIELDS:", _UncoveredField] = true;
void _stepFieldsAreExhaustive;
```

- [ ] **Step 2: Provar que o assert pega regressão**

Comentar temporariamente uma linha de `STEP_FIELDS` (ex: remover `"supplierId"` de `identity`) e rodar:

Run: `bun check-types`
Expected: FAIL — erro de atribuição em `_stepFieldsAreExhaustive` citando o campo descoberto.

Reverter a linha comentada.

- [ ] **Step 3: Verificar verde**

Run: `bun check-types && bun check`
Expected: PASS. Se `bun check` reclamar de `void`/unused, manter `void _stepFieldsAreExhaustive;` (consumo explícito) — é o padrão aceito.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts
git commit -m "test(tools): assert type-level de exaustividade de STEP_FIELDS"
```

---

## Task 5: Retrofit `HelpTooltip` — Branches

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`

- [ ] **Step 1: Importar `HelpTooltip`**

No topo, junto aos imports de `@/`:

```tsx
import { HelpTooltip } from "@/components/help-tooltip";
```

- [ ] **Step 2: Tooltip no header de Horário (substitui o `<p>`)**

Trocar o `<SectionHeader>Horário de funcionamento</SectionHeader>` por um header com `ⓘ`, e **remover** o `<p>` "Domingos são tratados como fechado." do fim de `hoursSection`:

```tsx
		<SectionHeader>
			<span className="inline-flex items-center gap-1.5">
				Horário de funcionamento
				<HelpTooltip text="Exibido na página da filial no site. Domingo é sempre fechado." />
			</span>
		</SectionHeader>
```

(O `<p className="text-muted-foreground text-xs">Domingos são tratados como fechado.</p>` ao final de `hoursSection` é deletado.)

- [ ] **Step 3: Tooltip no Label de Responsável**

No `teamSection`, trocar o `<Label htmlFor="branch-responsible">Responsável</Label>` por:

```tsx
					<Label
						className="flex items-center gap-1.5"
						htmlFor="branch-responsible"
					>
						Responsável
						<HelpTooltip text="Usuário responsável por esta filial." />
					</Label>
```

(Faixas de CEP **não muda** — o `<p>` "não restringe pedidos" fica visível por ser caveat.)

- [ ] **Step 4: Verificar/Smoke**

Run: `bun check-types && bun check` → PASS.
Smoke: `/dashboard/branches/<id>?edit=1` (drawer) e `/dashboard/branches/new` (2 colunas) — `ⓘ` aparece em Horário e Responsável; tooltip abre no hover/focus e fecha no Esc.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx
git commit -m "feat(branches): ajuda contextual (HelpTooltip) em horário e responsável"
```

---

## Task 6: Retrofit `HelpTooltip` — Suppliers

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx`

- [ ] **Step 1: Importar `HelpTooltip`**

```tsx
import { HelpTooltip } from "@/components/help-tooltip";
```

- [ ] **Step 2: CNPJ — tooltip rico (substitui o `<p>`)**

Trocar o `<Label htmlFor="supplier-cnpj">CNPJ (opcional)</Label>` por um Label com `ⓘ` rico, e **remover** o `<p>` "Só dígitos são salvos.":

```tsx
					<Label
						className="flex items-center gap-1.5"
						htmlFor="supplier-cnpj"
					>
						CNPJ (opcional)
						<HelpTooltip
							body="Só os dígitos são salvos; a máscara é apenas visual."
							example="12.345.678/0001-90 → 12345678000190"
							title="CNPJ"
						/>
					</Label>
```

(O `<p className="text-muted-foreground text-xs">Só dígitos são salvos.</p>` é deletado.)

- [ ] **Step 3: Website — tooltip curto**

Trocar `<Label htmlFor="supplier-website">Website (opcional)</Label>` por:

```tsx
					<Label
						className="flex items-center gap-1.5"
						htmlFor="supplier-website"
					>
						Website (opcional)
						<HelpTooltip text="URL completa, começando com https://." />
					</Label>
```

- [ ] **Step 4: Verificar/Smoke**

Run: `bun check-types && bun check` → PASS.
Smoke: `/dashboard/suppliers/<id>?edit=1` — `ⓘ` em CNPJ (rico, com exemplo) e Website; rico fecha no Esc.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/_components/supplier-form-fields.tsx
git commit -m "feat(suppliers): ajuda contextual (HelpTooltip) em CNPJ e website"
```

---

## Task 7: Retrofit `HelpTooltip` — Categorias / atributos

**Files:**
- Modify: `apps/web/src/app/dashboard/categories/_components/attribute-form.tsx`

- [ ] **Step 1: Importar `HelpTooltip`**

```tsx
import { HelpTooltip } from "@/components/help-tooltip";
```

- [ ] **Step 2: Tipo de campo — tooltip rico**

Trocar `<Label htmlFor="inputType">Tipo de campo<span className="text-destructive"> *</span></Label>` por:

```tsx
						<Label
							className="flex items-center gap-1.5"
							htmlFor="inputType"
						>
							<span>
								Tipo de campo
								<span className="text-destructive"> *</span>
							</span>
							<HelpTooltip
								body="Texto e número são livres. Lista (select) exige opções; cor exige swatches; faixa numérica pede unidade."
								title="Tipo de campo"
							/>
						</Label>
```

- [ ] **Step 3: Slug — tooltip curto (create), warning fica visível (edit)**

No campo Slug, trocar `<Label htmlFor="slug">Slug<span className="text-destructive"> *</span></Label>` por um Label com `ⓘ`:

```tsx
					<Label className="flex items-center gap-1.5" htmlFor="slug">
						<span>
							Slug
							<span className="text-destructive"> *</span>
						</span>
						<HelpTooltip text="Gerado do rótulo; vira a chave técnica do atributo." />
					</Label>
```

(O `<p>` que alterna entre "Gerado automaticamente…" e o warning de edit **permanece** — o warning de edit é caveat visível.)

- [ ] **Step 4: Opções — tooltip curto no header**

Em `showOptions`, trocar `<h3 className="font-semibold text-xs uppercase tracking-wide">Opções da lista</h3>` por:

```tsx
						<h3 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide">
							Opções da lista
							<HelpTooltip text="Cada opção tem rótulo visível e um slug técnico (gerado do rótulo)." />
						</h3>
```

- [ ] **Step 5: Verificar/Smoke**

Run: `bun check-types && bun check` → PASS.
Smoke: abrir o form de atributo de uma categoria (criar e editar) — `ⓘ` em Tipo de campo (rico), Slug, e Opções da lista (quando `inputType = select`); rico fecha no Esc.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/categories/_components/attribute-form.tsx
git commit -m "feat(categories): ajuda contextual (HelpTooltip) em tipo de campo, slug e opções"
```

---

## Task 8: WCAG Esc (3b) — verificação

**Files:** nenhum (verificação).

- [ ] **Step 1: Confirmar Esc no tooltip rico**

Já confirmado nas docs do `@base-ui/react` v1.4: `PreviewCard` tem `escape-key` como razão nativa de fechamento, e o trigger do `HelpTooltip` é `<button>` (focável). WCAG 1.4.13 (dismissable/hoverable/persistent) atendido sem código.

No smoke das Tasks 5-7, ao abrir um tooltip **rico** (CNPJ, Tipo de campo, Descrição da ferramenta) por hover/focus, pressionar **Esc** e confirmar que fecha. Se algum não fechar, abrir follow-up — mas o esperado é fechar.

---

## Task 9: Documentar decisões no CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (raiz)
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Decisão 2a no `apps/web/CLAUDE.md`**

Na seção "Convenções de UX em forms", adicionar bullet:

```md
- **Atributos órfãos ao trocar categoria principal (tools, create):** `toggleCategory` **não** reseta `attributeAssignments` ao mudar a principal. Decisão consciente (#121/#122): não destruir trabalho do usuário. Atributos que deixaram de ser sugeridos aparecem como badge `extra · não herdado` (`attribute-assignments-editor.tsx`) e continuam marcados/submetidos — removíveis pelo `X`. Não re-adicionar `useEffect` de reset em create; o caminho destrutivo explícito existe só no edit (`updateTool` → `warning: "orphan_attributes"`).
```

- [ ] **Step 2: Padrão `HelpTooltip` no `apps/web/CLAUDE.md`**

Na mesma seção:

```md
- **Ajuda contextual em forms (`HelpTooltip`):** `apps/web/src/components/help-tooltip.tsx` — `ⓘ` dentro do `<Label>` (via `className="flex items-center gap-1.5"`). Union: `text` (curto, desambiguação) ou `title+body+example` (rico, com exemplo). O rico usa `HoverCard`/`PreviewCard` (fecha no Esc nativo). Converter `<p>` verboso em tooltip; **manter visível** caveat comportamental (ex: faixas de CEP "não restringem pedidos").
```

- [ ] **Step 3: Fonte única wizard/edit no `apps/web/CLAUDE.md`**

```md
- **Wizard ↔ edit de tool — fonte única:** `tool-sections.ts` (`TOOL_SECTION_COMPONENTS: ToolStepId → Component`) e `use-tool-submit.ts` (`useToolSubmit({ mode })`) são compartilhados por `ToolWizard` e `ToolEditView`. Adicionar campo/passo: mexer só no map e no schema, nunca duplicar. Stepper-only state (`active`/`next`/`stepDone`) fica no wizard.
```

- [ ] **Step 4: Verificar lint dos .md (se aplicável) e commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md
git commit -m "docs: decisões do #122 (auto-reset, HelpTooltip, fonte única wizard/edit)"
```

- [ ] **Step 5: Fechar a issue**

```bash
gh issue close 122 --comment "Fechado via branch issue-122: retrofit HelpTooltip (branches/suppliers/categories), dedup wizard↔edit (TOOL_SECTION_COMPONENTS + useToolSubmit), patch funcional, parse-único no stepper, assert de exaustividade de STEP_FIELDS, e WCAG 1.4.13 confirmado (Esc nativo do PreviewCard). Decisão 2a: auto-reset mantido (badge 'extra · não herdado')."
```

---

## Self-Review

**Spec coverage:**
- Seção 1 (retrofit) → Tasks 5, 6, 7 ✓
- 2a (auto-reset, manter) → Task 9 Step 1 (documentação; sem código, por decisão) ✓
- 2b (dedup) → Task 1 ✓
- 3a (parse 6×) → Task 3 ✓
- 3b (Esc/WCAG) → Task 8 ✓ (sem código — confirmado nas docs)
- 3c (stale closure) → Task 2 ✓
- 3d (exaustividade) → Task 4 ✓

**Placeholders:** nenhum TBD/TODO; todo passo tem código/comando exato.

**Type consistency:** `ToolPatch` definido na Task 2 Step 1 e usado em `types.ts` (Step 2); `TOOL_SECTION_COMPONENTS`, `useToolSubmit`, `filterStepIssues`/`stepHasErrors`/`getStepIssues` nomeados consistentemente entre as tasks que os criam (1, 3) e consomem (1, 3).

**Ordem:** Task 1 (refactor estrutural) antes das demais que tocam os mesmos arquivos; Tasks 2-4 mexem no wizard/state após a fonte única existir; retrofit (5-7) é independente; docs (9) por último.

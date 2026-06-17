# Wizard de criação de ferramenta — rascunho + validação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o wizard de criação de ferramenta (a) preservar o rascunho em `localStorage` (sair e voltar não perde nada) e (b) dar feedback de validação que segue a navegação por abas, sem bloquear.

**Architecture:** Estender o `ToolWizard` existente (estado `useState`, sem react-hook-form). Lógica pura (contagem de erros por passo, conteúdo por passo, serialização/expiração do rascunho) em módulos testáveis com vitest; o hook de persistência e os componentes de UI são verificados por smoke visual no browser (jsdom não está no setup — `vitest.config.ts` usa `environment: node`).

**Tech Stack:** Next 16, React 19, TypeScript, Zod, vitest (`environment: node`), Tailwind, `@emach/ui`.

## Global Constraints

- Sem `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`; sem `console.*` (usar `logger`); sem `useMemo`/`useCallback` manuais desnecessários (React Compiler ativo) — `useCallback` é aceito em hook quando a identidade estável importa para deps de `useEffect`.
- IDs estáveis em `.map()` (sem `key={index}`).
- Erros de validação inline via `<FieldError>` (nunca `<p>` cru) — já é o padrão do wizard.
- Mexeu em UI → **smoke visual real** na rota (`localhost:3006`); `bun check-types` não pega hook client em Server Component nem regra de lint.
- Antes de cada commit que toca UI/lógica: `bun --cwd apps/web test` (vitest) nas tasks com teste; `bun check-types` e `bun check` (ultracite) na verificação final.
- Escopo: **só** o modo `create` (`ToolWizard`). Não tocar `ToolEditView`.
- Todos os paths são relativos à raiz `/home/othavio/Projects/emach/emach-dashboard`. Comandos `test`/`check-types` rodam com `--cwd apps/web` ou via turbo a partir da raiz.

---

### Task 1: Funções puras de passo — `getStepErrorCount` e `stepsWithContent`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts` (criar)

**Interfaces:**
- Consumes: `TOOL_STEPS`, `STEP_FIELDS`, `stepHasErrors`, `ToolStepId` (mesmo arquivo); `toolFormSchema`, `ToolFormValues` (`./tool-schema`); `EMPTY_TOOL_VALUES`, `ToolFormState` (`./tool-form-state`).
- Produces:
  - `getStepErrorCount(result: ReturnType<typeof toolFormSchema.safeParse>, stepId: ToolStepId): number` — nº de **campos distintos** do passo com erro.
  - `stepsWithContent(values: ToolFormState): Set<ToolStepId>` — passos cujos campos diferem de `EMPTY_TOOL_VALUES`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";
import {
	getStepErrorCount,
	stepHasErrors,
	stepsWithContent,
	TOOL_STEPS,
} from "../tool-form-steps";
import { toolFormSchema } from "../tool-schema";

describe("getStepErrorCount", () => {
	it("retorna 0 para passo opcional vazio (fiscal)", () => {
		const parsed = toolFormSchema.safeParse({});
		expect(getStepErrorCount(parsed, "fiscal")).toBe(0);
	});

	it("conta >= 2 campos com erro no passo identity de um form vazio", () => {
		const parsed = toolFormSchema.safeParse({});
		expect(getStepErrorCount(parsed, "identity")).toBeGreaterThanOrEqual(2);
	});

	it("é coerente com stepHasErrors em todos os passos", () => {
		const parsed = toolFormSchema.safeParse({});
		for (const step of TOOL_STEPS) {
			expect(getStepErrorCount(parsed, step.id) > 0).toBe(
				stepHasErrors(parsed, step.id)
			);
		}
	});
});

describe("stepsWithContent", () => {
	it("form vazio → nenhum passo com conteúdo", () => {
		expect(stepsWithContent(EMPTY_TOOL_VALUES).size).toBe(0);
	});

	it("nome preenchido → identity tem conteúdo, variants não", () => {
		const v = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };
		const set = stepsWithContent(v);
		expect(set.has("identity")).toBe(true);
		expect(set.has("variants")).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun --cwd apps/web test tool-form-steps`
Expected: FAIL — `getStepErrorCount`/`stepsWithContent` não existem (import error).

- [ ] **Step 3: Implementar as funções**

Em `tool-form-steps.ts`, adicionar o import no topo (após o import existente de `./tool-schema`):

```ts
import { EMPTY_TOOL_VALUES, type ToolFormState } from "./tool-form-state";
```

E ao final do arquivo:

```ts
export function getStepErrorCount(
	result: ReturnType<typeof toolFormSchema.safeParse>,
	stepId: ToolStepId
): number {
	if (result.success) {
		return 0;
	}
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const seen = new Set<string>();
	for (const issue of result.error.issues) {
		const key = issue.path[0];
		if (issue.path.length > 0 && fields.has(String(key))) {
			seen.add(String(key));
		}
	}
	return seen.size;
}

export function stepsWithContent(values: ToolFormState): Set<ToolStepId> {
	const result = new Set<ToolStepId>();
	for (const step of TOOL_STEPS) {
		const fields = STEP_FIELDS[step.id] as (keyof ToolFormState)[];
		const differs = fields.some(
			(f) => JSON.stringify(values[f]) !== JSON.stringify(EMPTY_TOOL_VALUES[f])
		);
		if (differs) {
			result.add(step.id);
		}
	}
	return result;
}
```

> Nota: `tool-form-state.ts` tem `"use client"`, mas importar o **valor** constante `EMPTY_TOOL_VALUES` e o **tipo** `ToolFormState` num módulo de lógica é seguro (a diretiva só marca boundary; não torna `tool-form-steps` client, e em vitest node a diretiva é ignorada). Sem ciclo: `tool-form-state` não importa `tool-form-steps`.

- [ ] **Step 4: Rodar para ver passar**

Run: `bun --cwd apps/web test tool-form-steps`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-form-steps.test.ts
git commit -m "feat(tools): contagem de erro e conteúdo por passo do wizard"
```

---

### Task 2: Storage puro do rascunho — `tool-draft-storage.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-draft-storage.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-draft-storage.test.ts`

**Interfaces:**
- Consumes: `ToolFormState`, `EMPTY_TOOL_VALUES` (`./tool-form-state`); `stepsWithContent` (`./tool-form-steps`, da Task 1).
- Produces:
  - `DRAFT_KEY: string` = `"emach:tool-draft:new:v1"`
  - `DRAFT_TTL_MS: number` = `86_400_000` (24h)
  - `serializeDraft(data: ToolFormState, now: number): string`
  - `parseDraft(raw: string | null, now: number): ToolFormState | null` (null se ausente, corrompido ou expirado)
  - `shouldPersist(values: ToolFormState): boolean`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `apps/web/src/app/dashboard/tools/_components/__tests__/tool-draft-storage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	DRAFT_TTL_MS,
	parseDraft,
	serializeDraft,
	shouldPersist,
} from "../tool-draft-storage";
import { EMPTY_TOOL_VALUES } from "../tool-form-state";

const base = { ...EMPTY_TOOL_VALUES, name: "Furadeira" };

describe("serializeDraft / parseDraft", () => {
	it("round-trip preserva os dados", () => {
		const raw = serializeDraft(base, 1000);
		expect(parseDraft(raw, 1000)?.name).toBe("Furadeira");
	});

	it("expira após 24h", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS + 1)).toBeNull();
	});

	it("dentro de 24h retorna os dados", () => {
		const raw = serializeDraft(base, 0);
		expect(parseDraft(raw, DRAFT_TTL_MS - 1)).not.toBeNull();
	});

	it("raw null → null", () => {
		expect(parseDraft(null, 0)).toBeNull();
	});

	it("json inválido → null", () => {
		expect(parseDraft("{bad", 0)).toBeNull();
	});
});

describe("shouldPersist", () => {
	it("false para form vazio", () => {
		expect(shouldPersist(EMPTY_TOOL_VALUES)).toBe(false);
	});

	it("true quando há conteúdo", () => {
		expect(shouldPersist(base)).toBe(true);
	});
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `bun --cwd apps/web test tool-draft-storage`
Expected: FAIL — módulo `../tool-draft-storage` não existe.

- [ ] **Step 3: Implementar o módulo**

Criar `apps/web/src/app/dashboard/tools/_components/tool-draft-storage.ts`:

```ts
import { stepsWithContent } from "./tool-form-steps";
import type { ToolFormState } from "./tool-form-state";

export const DRAFT_KEY = "emach:tool-draft:new:v1";
export const DRAFT_TTL_MS = 86_400_000; // 24h

interface StoredDraft {
	data: ToolFormState;
	savedAt: number;
}

export function serializeDraft(data: ToolFormState, now: number): string {
	return JSON.stringify({ data, savedAt: now } satisfies StoredDraft);
}

export function parseDraft(
	raw: string | null,
	now: number
): ToolFormState | null {
	if (!raw) {
		return null;
	}
	try {
		const parsed = JSON.parse(raw) as Partial<StoredDraft>;
		if (typeof parsed?.savedAt !== "number" || !parsed.data) {
			return null;
		}
		if (now - parsed.savedAt > DRAFT_TTL_MS) {
			return null;
		}
		return parsed.data;
	} catch {
		// rascunho corrompido → ignora (decisão consciente: parse defensivo)
		return null;
	}
}

export function shouldPersist(values: ToolFormState): boolean {
	return stepsWithContent(values).size > 0;
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `bun --cwd apps/web test tool-draft-storage`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-draft-storage.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-draft-storage.test.ts
git commit -m "feat(tools): storage puro do rascunho de ferramenta (24h TTL)"
```

---

### Task 3: Hook `useToolDraft` + faixa `DraftRecoveredBanner`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/use-tool-draft.ts`
- Create: `apps/web/src/app/dashboard/tools/_components/draft-recovered-banner.tsx`

**Interfaces:**
- Consumes: `DRAFT_KEY`, `parseDraft`, `serializeDraft`, `shouldPersist` (Task 2); `EMPTY_TOOL_VALUES`, `ToolFormState` (`./tool-form-state`).
- Produces:
  - `useToolDraft(args: { values: ToolFormState; setValues: (v: ToolFormState) => void; onRestore?: (restored: ToolFormState) => void }): { recovered: boolean; discard: () => void; clear: () => void }`
  - `DraftRecoveredBanner(props: { onDiscard: () => void }): JSX.Element`

Sem teste unitário (precisa de jsdom, ausente no setup) — verificado no smoke da Task 6.

- [ ] **Step 1: Implementar o hook**

Criar `apps/web/src/app/dashboard/tools/_components/use-tool-draft.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
	DRAFT_KEY,
	parseDraft,
	serializeDraft,
	shouldPersist,
} from "./tool-draft-storage";
import { EMPTY_TOOL_VALUES, type ToolFormState } from "./tool-form-state";

interface UseToolDraftArgs {
	onRestore?: (restored: ToolFormState) => void;
	setValues: (v: ToolFormState) => void;
	values: ToolFormState;
}

export function useToolDraft({ values, setValues, onRestore }: UseToolDraftArgs) {
	const [recovered, setRecovered] = useState(false);
	const hydrated = useRef(false);

	// Restore pós-mount: ler localStorage só depois da hidratação evita mismatch.
	useEffect(() => {
		if (hydrated.current) {
			return;
		}
		hydrated.current = true;
		const draft = parseDraft(localStorage.getItem(DRAFT_KEY), Date.now());
		if (draft) {
			setValues(draft);
			setRecovered(true);
			onRestore?.(draft);
		} else {
			localStorage.removeItem(DRAFT_KEY);
		}
	}, [setValues, onRestore]);

	// Autosave debounced (~500ms). Só após hidratar e só se houver conteúdo.
	useEffect(() => {
		if (!(hydrated.current && shouldPersist(values))) {
			return;
		}
		const t = setTimeout(() => {
			localStorage.setItem(DRAFT_KEY, serializeDraft(values, Date.now()));
		}, 500);
		return () => clearTimeout(t);
	}, [values]);

	const discard = useCallback(() => {
		localStorage.removeItem(DRAFT_KEY);
		setValues(EMPTY_TOOL_VALUES);
		setRecovered(false);
	}, [setValues]);

	const clear = useCallback(() => {
		localStorage.removeItem(DRAFT_KEY);
	}, []);

	return { recovered, discard, clear };
}
```

- [ ] **Step 2: Implementar a faixa**

Criar `apps/web/src/app/dashboard/tools/_components/draft-recovered-banner.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { History } from "lucide-react";

export function DraftRecoveredBanner({ onDiscard }: { onDiscard: () => void }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
			<span className="flex items-center gap-2 text-muted-foreground text-xs">
				<History aria-hidden className="size-3.5" />
				Rascunho recuperado — continuamos de onde você parou.
			</span>
			<Button onClick={onDiscard} size="sm" type="button" variant="ghost">
				Descartar
			</Button>
		</div>
	);
}
```

> Se `size="sm"` não existir na variante do `Button` do `@emach/ui`, remover a prop (verificar a API do componente ao integrar).

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem erros nos dois arquivos novos).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/use-tool-draft.ts apps/web/src/app/dashboard/tools/_components/draft-recovered-banner.tsx
git commit -m "feat(tools): hook de rascunho e faixa de recuperação"
```

---

### Task 4: Feature B — validação que segue a navegação no `ToolWizard`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`

**Interfaces:**
- Consumes: `getStepErrorCount` (Task 1); `getStepFieldErrors`, `stepHasErrors`, `TOOL_STEPS`, `STEP_FIELDS`, `ToolStepId` (existentes).
- Produces: nada para tasks seguintes (mudança interna de UI).

- [ ] **Step 1: Estado `visited` e navegação centralizada**

Em `tool-wizard.tsx`, trocar o import de `tool-form-steps` para incluir `getStepErrorCount` e adicionar `useState` já presente. Substituir o bloco do estado/`next()` (linhas ~27-72) por:

```tsx
const { values, patch, errors, setErrors } = useToolFormState(
	defaultValues ?? {}
);
const [active, setActive] = useState(0);
const [visited, setVisited] = useState<Set<ToolStepId>>(() => new Set());

// active é controlado por setActive com clamp — nunca sai dos bounds
// biome-ignore lint/style/noNonNullAssertion: array constante não-vazio, índice clamped
const step = TOOL_STEPS[Math.min(active, TOOL_STEPS.length - 1)]!;

// Recalcula os erros inline considerando todos os passos já visitados.
function errorsForVisited(visitedSet: Set<ToolStepId>) {
	const merged: Partial<Record<keyof typeof errors, string>> = {};
	for (const id of visitedSet) {
		Object.assign(merged, getStepFieldErrors(values, id));
	}
	return merged;
}

// Troca de passo por QUALQUER meio (aba, Voltar, Próximo): marca o passo que
// sai como visitado, recalcula erros dos visitados e navega. Nunca bloqueia.
function goTo(index: number) {
	const leaving = step.id;
	const nextVisited = new Set(visited).add(leaving);
	setVisited(nextVisited);
	setErrors(errorsForVisited(nextVisited));
	setActive(Math.min(Math.max(index, 0), TOOL_STEPS.length - 1));
}

const handleValidationFail = (errorKeys: string[]) => {
	const idx = TOOL_STEPS.findIndex((s) =>
		(STEP_FIELDS[s.id] as readonly string[]).some((f) =>
			errorKeys.includes(f)
		)
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

const Fields = TOOL_SECTION_COMPONENTS[step.id];
const parsed = toolFormSchema.safeParse(values);
```

> `stepDone`/`stepHasErrors`/`next()` antigos saem (substituídos por `goTo` + cálculo de badge inline). Manter os imports de `errorToastMessage`/`notify` só se ainda usados; se `next()` era o único consumidor de `notify`/`errorToastMessage`, remover esses imports para o lint não acusar import não usado.

- [ ] **Step 2: Stepper com badges ✓ / ⚠️+contagem / neutro**

Substituir o `<ol>` do stepper (linhas ~76-108) por:

```tsx
<ol
	aria-label="Etapas do cadastro"
	className="flex flex-wrap gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60"
>
	{TOOL_STEPS.map((s, i) => {
		const isActive = i === active;
		const isVisited = visited.has(s.id);
		const errCount = getStepErrorCount(parsed, s.id);
		const showError = isVisited && !isActive && errCount > 0;
		const showDone = isVisited && !isActive && errCount === 0;
		return (
			<li key={s.id}>
				<button
					aria-current={isActive ? "step" : undefined}
					aria-label={
						showError ? `${s.label}: ${errCount} pendência(s)` : s.label
					}
					className={
						isActive
							? "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
							: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
					}
					onClick={() => goTo(i)}
					type="button"
				>
					{showError ? (
						<span className="flex items-center gap-1 text-destructive">
							<CircleAlert aria-hidden className="size-3.5" />
							{errCount}
						</span>
					) : showDone ? (
						<Check aria-hidden className="size-3.5 text-success" />
					) : (
						<span>{i + 1}</span>
					)}
					{s.label}
					{s.optional && (
						<span className="text-[10px] opacity-70">(opcional)</span>
					)}
				</button>
			</li>
		);
	})}
</ol>
```

Atualizar os imports do `lucide-react` no topo: `import { Check, CircleAlert } from "lucide-react";`

> Nota sobre ternário aninhado: o `showError ? … : showDone ? … : …` pode disparar `noNestedTernary` do ultracite. Se disparar, extrair para uma pequena função `renderStepMarker()` que retorna o nó, ou um `if/else if` antes do `return`. Verificar com `bun check` na Task 6 e ajustar se necessário (o header contextual de `branches` já convive com nested-ternary via consistência — seguir o que o `bun check` exigir aqui).

- [ ] **Step 3: Rodapé — botões como navegação pura**

Substituir o rodapé (linhas ~127-151) por:

```tsx
<div className="flex items-center justify-between">
	<Button
		disabled={active === 0}
		onClick={() => goTo(active - 1)}
		type="button"
		variant="ghost"
	>
		‹ Voltar
	</Button>
	{active < TOOL_STEPS.length - 1 ? (
		<Button onClick={() => goTo(active + 1)} type="button">
			Próximo ›
		</Button>
	) : (
		<Button disabled={isPending} onClick={submit} type="button">
			{isPending ? (
				<>
					<Spinner /> Salvando…
				</>
			) : (
				"Criar ferramenta"
			)}
		</Button>
	)}
</div>
```

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 5: Smoke rápido no browser (sem commit ainda se quebrar)**

Visitar `http://localhost:3006/dashboard/tools/new`, navegar pelas abas clicando (sem usar Próximo): ao deixar um passo incompleto, a aba ganha ⚠️ + número; passos não visitados ficam com o número neutro; passo válido visitado ganha ✓.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx
git commit -m "feat(tools): validação por passo segue a navegação (sem bloquear)"
```

---

### Task 5: Feature A — plugar rascunho no `ToolWizard` + limpeza no sucesso

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts`

**Interfaces:**
- Consumes: `useToolDraft`, `DraftRecoveredBanner` (Task 3); `stepsWithContent` (Task 1); `setValues` de `useToolFormState`.
- Produces: nada para tasks seguintes.

- [ ] **Step 1: `useToolSubmit` aceita `onSuccess`**

Em `use-tool-submit.ts`, adicionar à interface `UseToolSubmitArgs`:

```ts
/** Chamado uma vez quando a persistência retorna ok (ex: limpar rascunho). */
onSuccess?: () => void;
```

Desestruturar `onSuccess` na assinatura e chamá-lo dentro de `if (res.ok)` (após `notify.success`, antes do `router.push`):

```ts
if (res.ok) {
	notify.success(SUCCESS_MESSAGE[mode]);
	onSuccess?.();
	router.push("/dashboard/tools");
	router.refresh();
} else {
```

- [ ] **Step 2: Plugar o hook e a faixa no wizard**

Em `tool-wizard.tsx`:

1. Adicionar imports:

```tsx
import { DraftRecoveredBanner } from "./draft-recovered-banner";
import { useToolDraft } from "./use-tool-draft";
import { stepsWithContent } from "./tool-form-steps";
```

2. Pegar `setValues` do hook de estado:

```tsx
const { values, patch, errors, setErrors, setValues } = useToolFormState(
	defaultValues ?? {}
);
```

3. Após o estado `visited`, instanciar o draft (o `onRestore` marca como visitadas as abas com conteúdo):

```tsx
const { recovered, discard, clear } = useToolDraft({
	values,
	setValues,
	onRestore: (restored) => setVisited(stepsWithContent(restored)),
});
```

4. Passar `onSuccess: clear` ao `useToolSubmit`:

```tsx
const { submit, isPending } = useToolSubmit({
	mode: "create",
	values,
	setErrors,
	onValidationFail: handleValidationFail,
	onSuccess: clear,
});
```

5. Renderizar a faixa no topo do `return`, antes do `<ol>` do stepper:

```tsx
return (
	<div className="flex flex-col gap-6">
		{recovered && (
			<DraftRecoveredBanner
				onDiscard={() => {
					discard();
					setVisited(new Set());
					setErrors({});
					setActive(0);
				}}
			/>
		)}
		<ol
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts
git commit -m "feat(tools): rascunho persistente com restauração e descarte"
```

---

### Task 6: Verificação final — smoke visual + checks

**Files:** nenhum (verificação); ajustes pontuais se algo falhar.

- [ ] **Step 1: Suíte de testes**

Run: `bun --cwd apps/web test`
Expected: PASS (incluindo os novos `tool-form-steps` e `tool-draft-storage`).

- [ ] **Step 2: Tipos e lint**

Run: `bun check-types` e depois `bun check`
Expected: ambos PASS. Corrigir o que o ultracite apontar (ex: nested-ternary do marcador de passo, imports não usados do antigo `next()`).

- [ ] **Step 3: Smoke visual no `localhost:3006`** (tab já pinada)

Roteiro:
1. `/dashboard/tools/new` → preencher Nome + 1 categoria; ir à aba Variantes e preencher SKU/preço.
2. Navegar para `/dashboard/categories` (sair do wizard) e voltar para `/dashboard/tools/new` → **rascunho restaurado**, faixa "Rascunho recuperado · Descartar" visível, abas Identidade e Variantes já com badge (✓ ou ⚠️).
3. Clicar **Descartar** → form limpo, faixa some, badges zerados, `localStorage` sem a chave (`emach:tool-draft:new:v1`).
4. Navegar pelas abas sem usar Próximo → abas visitadas incompletas ficam ⚠️+contagem; não visitadas neutras.
5. Clicar **Criar ferramenta** com erro → leva ao 1º passo com erro e foca o 1º campo.
6. Completar e criar com sucesso → redireciona para `/dashboard/tools` e o rascunho some do `localStorage`.

Conferir o console do browser (`read_console_messages`, `onlyErrors`) e a aba de network se algo parecer quebrado.

- [ ] **Step 4: Commit de ajustes (se houver)**

```bash
git add -A
git commit -m "fix(tools): ajustes de lint/smoke do wizard"
```

- [ ] **Step 5: Code review**

Rodar a revisão de código sobre o diff da branch (o usuário pediu explicitamente). Endereçar achados de alta confiança.

---

## Self-Review

**Spec coverage:**
- Rascunho em `localStorage` (chave versionada, TTL 24h, autosave debounced, restore pós-mount) → Tasks 2 e 3.
- Faixa "Rascunho recuperado · Descartar" → Task 3 + integração Task 5.
- Limpeza no sucesso → Task 5 (`onSuccess`/`clear`).
- Badges ✓/⚠️+contagem, abas não visitadas neutras → Tasks 1 e 4.
- `next()` sem bloqueio, botões como navegação pura → Task 4.
- Erros inline por passo visitado → Task 4 (`errorsForVisited` em `goTo`).
- Badges já no restore (abas com conteúdo) → Task 5 (`onRestore` → `stepsWithContent`).
- Submit final inalterado (1º erro) → preservado em Task 4 (`handleValidationFail`).
- Fora de escopo (inline create, guard de navegação, edit, imagens órfãs) → respeitado (nenhuma task).

**Placeholder scan:** sem TBD/TODO; todo step com código real ou comando concreto.

**Type consistency:** `getStepErrorCount`/`stepsWithContent` (Task 1) usados com as mesmas assinaturas em Tasks 2/4/5; `useToolDraft` retorna `{ recovered, discard, clear }` (Task 3) consumidos em Task 5; `onSuccess` adicionado em Task 5 a `UseToolSubmitArgs` e chamado no mesmo lugar.

**Risco anotado:** o ternário aninhado do marcador de passo e a remoção de imports órfãos do `next()` podem exigir ajuste de lint — coberto na Task 4 Step 2 e Task 6 Step 2.

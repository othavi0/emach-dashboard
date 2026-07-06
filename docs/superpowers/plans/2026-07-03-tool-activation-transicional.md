# Ativação de tool transicional + correção do seed (#290) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o gate de requisitos de ativação (specs≥4, imagens≥3, ncm) valer só na transição `→ active`, corrigir os dados inconsistentes do seed e fechar a lacuna que os deixou passar.

**Architecture:** Extrair os requisitos de ativação do `toolFormSchema.superRefine` para uma função pura, aplicada por client e server **só quando o tool entra em `active`** (o server conhece o status anterior; o client conhece o inicial via `defaultValues`). Corrigir o `catalog.ts` para que todo tool `active` nasça dentro da régua, e adicionar checks ao `verify.ts` do seed.

**Tech Stack:** Next 16 / React 19 / Zod / Drizzle / Vitest (node env) / Bun.

## Global Constraints

- Sem `console.*` — usar `logger` (`apps/web/src/lib/logger.ts`). Sem `: any`/`as any`/`@ts-ignore`.
- Server actions: `ActionResult<T>` = `{ ok: true; data } | { ok: false; error }`; validação com `safeParse`.
- IDs no caller via `crypto.randomUUID()`.
- Antes de cada commit: `bun check-types` e `bun --cwd apps/web test` (Fase A) / `bun db:seed-demo` + verify (Fase B). Gate final: `bun verify`.
- Implementer: **Read cada arquivo antes de Edit** (`cat`/`sed` não contam p/ o harness); se Edit falhar com `string not found`, re-Read antes de re-tentar (o hook PostToolUse `bun fix` pode reordenar campos).
- Todos os valores de specs numéricas no seed são **strings** (coluna `numeric`), ex: `valueNumeric: "8.5"`.

---

## Fase A — Regra de ativação transicional

### Task 1: Extrair `activationRequirementIssues` e enxugar o superRefine

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts`

**Interfaces:**
- Produces:
  - `export interface ActivationIssue { path: (keyof ToolFormValues)[]; message: string; }`
  - `export function activationRequirementIssues(data: ToolFormValues): ActivationIssue[]`
  - `export interface ToolIssue { path: PropertyKey[]; message: string; }`
  - `export function collectToolIssues(values: unknown, opts: { enforceActivation: boolean }): ToolIssue[]`

- [ ] **Step 1: Reescrever os testes de specs/ncm para a nova superfície**

No arquivo de teste, **substituir** o bloco `describe("toolFormSchema — regra de specs ao ativar", ...)` (linhas ~106-157) e o bloco `describe("toolFormSchema — NCM-gate ao ativar (ADR-0027)", ...)` (linhas ~265-287) por testes de `activationRequirementIssues` e `collectToolIssues`. Adicionar aos imports `activationRequirementIssues, collectToolIssues`:

```ts
describe("activationRequirementIssues", () => {
	it("retorna vazio quando specs≥4, imagens≥3 e ncm presentes", () => {
		expect(activationRequirementIssues(toolFormSchema.parse(baseTool()))).toEqual(
			[]
		);
	});

	it("aponta specs quando há menos de 4 preenchidas", () => {
		const data = toolFormSchema.parse(
			baseTool({
				attributeAssignments: ["a", "b", "c"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
				},
			})
		);
		expect(
			activationRequirementIssues(data).some((i) => i.path[0] === "attributeValues")
		).toBe(true);
	});

	it("aponta ncm ausente", () => {
		const data = toolFormSchema.parse(baseTool({ ncm: undefined }));
		expect(activationRequirementIssues(data).some((i) => i.path[0] === "ncm")).toBe(
			true
		);
	});

	it("aponta imagens abaixo do mínimo", () => {
		const data = toolFormSchema.parse(
			baseTool({ images: [{ url: "https://x/1.jpg", sortOrder: 0 }] })
		);
		expect(
			activationRequirementIssues(data).some((i) => i.path[0] === "images")
		).toBe(true);
	});
});

describe("collectToolIssues", () => {
	it("sem enforceActivation, active com 2 specs não gera issues", () => {
		const values = baseTool({
			attributeAssignments: ["a", "b"],
			attributeValues: { a: { valueText: "x" }, b: { valueText: "y" } },
		});
		expect(collectToolIssues(values, { enforceActivation: false })).toEqual([]);
	});

	it("com enforceActivation, active com 2 specs gera issue de specs", () => {
		const values = baseTool({
			attributeAssignments: ["a", "b"],
			attributeValues: { a: { valueText: "x" }, b: { valueText: "y" } },
		});
		const issues = collectToolIssues(values, { enforceActivation: true });
		expect(issues.some((i) => i.path[0] === "attributeValues")).toBe(true);
	});

	it("erro estrutural (variante sem barcode) aparece independente de enforceActivation", () => {
		const values = baseTool({
			variants: [{ sku: "S1", priceAmount: 100, isDefault: true, sortOrder: 0 }],
		});
		expect(collectToolIssues(values, { enforceActivation: false }).length).toBeGreaterThan(
			0
		);
	});
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL — `activationRequirementIssues`/`collectToolIssues` não exportados.

- [ ] **Step 3: Enxugar o superRefine e adicionar as funções**

Em `tool-schema.ts`, no `.superRefine((data, ctx) => { ... })`, **remover** os três blocos condicionais a `data.status === "active"`: (a) `images.length < MIN_IMAGES_ACTIVE`; (b) `!data.ncm?.trim()`; (c) `countFilledSpecs(...) < MIN_SPECS_ACTIVE`. **Manter** todo o resto (par de vídeo, `primaryCategoryId ∈ categoryIds`, exatamente 1 default, `checkVariantDuplicates`, `attributeValues ⊆ assignments`).

Após a definição de `toolFormSchema` e `ToolFormValues` (as funções abaixo usam esse tipo), adicionar:

```ts
export interface ActivationIssue {
	path: (keyof ToolFormValues)[];
	message: string;
}

/**
 * Requisitos que um tool precisa cumprir para ESTAR em `active`. Não checa
 * `status` — o caller aplica só na transição para active (create já-active ou
 * draft→active). Espelha o que antes vivia no superRefine.
 */
export function activationRequirementIssues(
	data: ToolFormValues
): ActivationIssue[] {
	const issues: ActivationIssue[] = [];
	if (data.images.length < MIN_IMAGES_ACTIVE) {
		issues.push({
			path: ["images"],
			message: `Ativar exige mínimo de ${MIN_IMAGES_ACTIVE} imagens`,
		});
	}
	if (!data.ncm?.trim()) {
		issues.push({
			path: ["ncm"],
			message: "Ativar exige NCM preenchido (obrigatório para NF-e)",
		});
	}
	if (
		countFilledSpecs(data.attributeValues, data.attributeAssignments) <
		MIN_SPECS_ACTIVE
	) {
		issues.push({
			path: ["attributeValues"],
			message: `Ativar exige ao menos ${MIN_SPECS_ACTIVE} especificações preenchidas. Se a categoria tiver poucos atributos, anexe atributos extras do catálogo.`,
		});
	}
	return issues;
}

export interface ToolIssue {
	path: PropertyKey[];
	message: string;
}

/**
 * Superfície única de validação do form: invariantes estruturais (schema) +
 * requisitos de ativação quando `enforceActivation`. Consumido pelo submit e
 * pelos badges/erros por passo do wizard.
 */
export function collectToolIssues(
	values: unknown,
	opts: { enforceActivation: boolean }
): ToolIssue[] {
	const parsed = toolFormSchema.safeParse(values);
	if (!parsed.success) {
		return parsed.error.issues.map((i) => ({
			path: [...i.path],
			message: i.message,
		}));
	}
	if (opts.enforceActivation) {
		return activationRequirementIssues(parsed.data).map((i) => ({
			path: [...i.path],
			message: i.message,
		}));
	}
	return [];
}
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `bun --cwd apps/web test tool-schema`
Expected: PASS (incluindo `countFilledSpecs`, vídeo e barcode intocados).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
git commit -m "refactor(tools): extrai requisitos de ativação do schema para função dedicada"
```

---

### Task 2: Aplicar o gate transicional no client (submit + wizard)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-submit.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx`

**Interfaces:**
- Consumes: `activationRequirementIssues`, `collectToolIssues`, `ToolIssue` (Task 1).
- Produces:
  - `parseToolForm(values: ToolFormState, opts: { enforceActivation: boolean }): ParsedResult`
  - `getStepFieldErrors(values, stepId, enforceActivation): Partial<Record<...>>`
  - `getStepErrorCount(issues: ToolIssue[], stepId): number`
  - `stepHasErrors(issues: ToolIssue[], stepId): boolean`
  - `firstStepWithError(values, enforceActivation): ToolStepId | null`

- [ ] **Step 1: `parseToolForm` passa a receber `enforceActivation`**

Em `tool-submit.ts`, adicionar `activationRequirementIssues` ao import de `./tool-schema` e reescrever `parseToolForm`:

```ts
export function parseToolForm(
	values: ToolFormState,
	opts: { enforceActivation: boolean }
): ParsedResult {
	const result = toolFormSchema.safeParse(values);
	if (!result.success) {
		return {
			ok: false,
			fieldErrors: zodIssuesToFieldErrors<ToolFormValues>(result.error),
		};
	}
	if (opts.enforceActivation) {
		const actIssues = activationRequirementIssues(result.data);
		if (actIssues.length > 0) {
			const fieldErrors: Partial<Record<keyof ToolFormValues, string>> = {};
			for (const issue of actIssues) {
				const key = issue.path[0];
				if (fieldErrors[key] === undefined) {
					fieldErrors[key] = issue.message;
				}
			}
			return { ok: false, fieldErrors };
		}
	}
	return { ok: true, data: result.data, fieldErrors: {} };
}
```

- [ ] **Step 2: `useToolSubmit` computa `enforceActivation` a partir do status inicial**

Em `use-tool-submit.ts`: adicionar `import type { ToolStatusValue } from "./tool-schema";`. Em `UseToolSubmitArgs`, adicionar `initialStatus: ToolStatusValue;`. Desestruturar `initialStatus` e trocar a linha `const parsed = parseToolForm(values);` por:

```ts
const enforceActivation =
	values.status === "active" && initialStatus !== "active";
const parsed = parseToolForm(values, { enforceActivation });
```

(No create, o caller passa `initialStatus: "draft"` → `enforceActivation = values.status === "active"`. No edit de um tool já-active, `initialStatus === "active"` → `enforceActivation = false`.)

- [ ] **Step 3: As funções de passo passam a considerar `enforceActivation`**

Em `tool-form-steps.ts`, adicionar `collectToolIssues, type ToolIssue` ao import de `./tool-schema` e reescrever as quatro funções para operar sobre `ToolIssue[]`:

```ts
export function stepHasErrors(issues: ToolIssue[], stepId: ToolStepId): boolean {
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	return issues.some(
		(issue) => issue.path.length > 0 && fields.has(String(issue.path[0]))
	);
}

export function getStepFieldErrors(
	values: unknown,
	stepId: ToolStepId,
	enforceActivation: boolean
): Partial<Record<keyof ToolFormValues, string>> {
	const issues = collectToolIssues(values, { enforceActivation });
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const out: Partial<Record<keyof ToolFormValues, string>> = {};
	for (const issue of issues) {
		const key = issue.path[0] as keyof ToolFormValues | undefined;
		if (key && fields.has(String(key)) && out[key] === undefined) {
			out[key] = issue.message;
		}
	}
	return out;
}

export function firstStepWithError(
	values: unknown,
	enforceActivation: boolean
): ToolStepId | null {
	const issues = collectToolIssues(values, { enforceActivation });
	if (issues.length === 0) {
		return null;
	}
	for (const step of TOOL_STEPS) {
		if (stepHasErrors(issues, step.id)) {
			return step.id;
		}
	}
	return null;
}

export function getStepErrorCount(
	issues: ToolIssue[],
	stepId: ToolStepId
): number {
	const fields = new Set<string>(STEP_FIELDS[stepId] as string[]);
	const seen = new Set<string>();
	for (const issue of issues) {
		if (issue.path.length > 0 && fields.has(String(issue.path[0]))) {
			seen.add(String(issue.path[0]));
		}
	}
	return seen.size;
}
```

Remover o import de `toolFormSchema` se ficar sem uso (manter só se `stepsWithContent`/outros ainda o usam — eles não usam; remover o import de `toolFormSchema` e manter `type ToolFormValues`).

- [ ] **Step 4: `ToolEditView` passa o status inicial**

Em `tool-edit-view.tsx`, na chamada `useToolSubmit`, adicionar:

```tsx
const { submit, isPending } = useToolSubmit({
	mode: "edit",
	values,
	setErrors,
	initialStatus: defaultValues?.status ?? "draft",
});
```

- [ ] **Step 5: `ToolWizard` passa `initialStatus` e propaga `enforceActivation` aos badges**

Em `tool-wizard.tsx`:
1. Na chamada `useToolSubmit({ mode: "create", ... })`, adicionar `initialStatus: "draft",` (tool novo — qualquer `active` é transição de entrada).
2. Trocar a linha `const parsed = toolFormSchema.safeParse(values);` (linha ~106) por:
   ```tsx
   const enforceActivation = values.status === "active";
   const issues = collectToolIssues(values, { enforceActivation });
   ```
   Ajustar o import: trocar `toolFormSchema` por `collectToolIssues` no import de `./tool-schema`.
3. Onde chama `getStepErrorCount(parsed, s.id)` (linha ~127), usar `getStepErrorCount(issues, s.id)`.
4. Em `errorsForVisited` (linha ~69), trocar `getStepFieldErrors(values, id)` por `getStepFieldErrors(values, id, enforceActivation)`. Como `enforceActivation` é derivado de `values.status`, computá-lo dentro de `errorsForVisited`: `const enforceActivation = values.status === "active";` no topo da função.

- [ ] **Step 6: check-types + testes**

Run: `bun check-types && bun --cwd apps/web test tools`
Expected: PASS. Se `check-types` acusar caller de `getStepFieldErrors`/`getStepErrorCount` fora dos arquivos acima, atualizar conforme a nova assinatura (rodar `rg "getStepFieldErrors|getStepErrorCount|firstStepWithError|parseToolForm" apps/web/src` para confirmar que só os arquivos desta task chamam).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-submit.ts apps/web/src/app/dashboard/tools/_components/use-tool-submit.ts apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts apps/web/src/app/dashboard/tools/_components/tool-edit-view.tsx apps/web/src/app/dashboard/tools/_components/tool-wizard.tsx
git commit -m "feat(tools): gate de ativação só na transição para active (client)"
```

---

### Task 3: Aplicar o gate transicional nas server actions

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`

**Interfaces:**
- Consumes: `activationRequirementIssues` (Task 1), `tool` schema, `db`, `eq` (já importados no arquivo).

- [ ] **Step 1: `createTool` valida requisitos quando nasce `active`**

Adicionar `activationRequirementIssues` ao import de `./_components/tool-schema`. Em `createTool`, logo após o bloco `if (!parsed.success) { ... }` e antes do `primaryCategoryIncompleteError`, inserir:

```ts
if (parsed.data.status === "active") {
	const [issue] = activationRequirementIssues(parsed.data);
	if (issue) {
		return { ok: false, error: issue.message };
	}
}
```

- [ ] **Step 2: `updateTool` valida requisitos só na transição draft→active**

Em `updateTool`, logo após `const parsed = ...` / `if (!parsed.success)`, ler o status anterior e validar condicionalmente (antes do bloco de `previousPrimary`):

```ts
const [prev] = await db
	.select({ status: tool.status })
	.from(tool)
	.where(eq(tool.id, id))
	.limit(1);
if (prev?.status !== "active" && parsed.data.status === "active") {
	const [issue] = activationRequirementIssues(parsed.data);
	if (issue) {
		return { ok: false, error: issue.message };
	}
}
```

(O gate `primaryCategoryIncompleteError`, que já só dispara na troca de categoria, permanece inalterado.)

- [ ] **Step 3: check-types + build (arquivo tem `"use server"`)**

Run: `bun check-types && bun --cwd apps/web run build`
Expected: build OK. (Regra: re-exportar não-async de `"use server"` quebra só o build — `check-types` não pega; por isso o build é gate.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/actions.ts
git commit -m "feat(tools): gate de ativação só na transição para active (server)"
```

---

## Fase B — Correção dos dados do seed + verificação

### Task 4: Corrigir `catalog.ts` — ncm, atributos de categoria, specs e imagens

**Files:**
- Modify: `packages/db/scripts/seed/catalog.ts`

- [ ] **Step 1: Adicionar `ncm` ao `ToolDef` e ao insert de tool**

Na interface `ToolDef` (linha ~366), adicionar `ncm?: string;`. No `tx.insert(tool).values({...})` (linha ~896), adicionar a linha `ncm: toolDef.ncm ?? null,`.

- [ ] **Step 2: Adicionar `ncm` a cada tool em `TOOLS`**

Adicionar a propriedade `ncm` em cada objeto de `TOOLS`:

| Tool (slug) | `ncm` |
|---|---|
| furadeira-de-impacto-650w | `"84672100"` |
| parafusadeira-a-bateria-18v | `"84672100"` |
| serra-circular-7-1-4-1400w | `"84672200"` |
| serra-tico-tico-500w | `"84672200"` |
| esmerilhadeira-angular-4-1-2-720w | `"84672900"` |
| lixadeira-orbital-300w | `"84672900"` |
| plaina-eletrica-82mm-600w | `"84672900"` |
| compressor-de-ar-100l-2hp | `"84148019"` |
| martelo-carpinteiro-27mm | `"82052000"` |
| alicate-universal-8 | `"82032090"` |
| disco-de-corte-inox-4-1-2 | `"68042290"` |

- [ ] **Step 3: Enriquecer o array `ATTRIBUTES` (6 categorias pobres + 2 folhas)**

Adicionar ao array `ATTRIBUTES` (após os existentes de cada categoria, mantendo `sortOrder` sequencial). Todos os selects usam `options: { kind: "select", options: [...] }`:

```ts
// compressores (+2 → efetivo 4)
{ slug: "vazao-pcm", label: "Vazão", inputType: "number", categorySlug: "compressores", unit: "pcm", sortOrder: 2 },
{ slug: "potencia-motor-hp", label: "Potência do Motor", inputType: "number", categorySlug: "compressores", unit: "HP", sortOrder: 3 },
// discos (+4 próprios → efetivo 6)
{ slug: "diametro-disco-corte", label: "Diâmetro", inputType: "number", categorySlug: "discos", unit: "mm", sortOrder: 0 },
{ slug: "espessura-disco", label: "Espessura", inputType: "number", categorySlug: "discos", unit: "mm", sortOrder: 1 },
{ slug: "furo-disco", label: "Furo", inputType: "number", categorySlug: "discos", unit: "mm", sortOrder: 2 },
{ slug: "material-abrasivo", label: "Material Abrasivo", inputType: "select", categorySlug: "discos", options: { kind: "select", options: [ { label: "Óxido de alumínio", value: "oxido-aluminio" }, { label: "Óxido de zircônio", value: "oxido-zirconio" }, { label: "Diamantado", value: "diamantado" } ] }, sortOrder: 3 },
// alicates (+2 → efetivo 4)
{ slug: "abertura-mandibula", label: "Abertura da Mandíbula", inputType: "number", categorySlug: "alicates", unit: "mm", sortOrder: 0 },
{ slug: "tipo-corte", label: "Tipo de Corte", inputType: "select", categorySlug: "alicates", options: { kind: "select", options: [ { label: "Lateral", value: "lateral" }, { label: "Frontal", value: "frontal" }, { label: "Diagonal", value: "diagonal" } ] }, sortOrder: 1 },
// martelos (+2 → efetivo 4)
{ slug: "peso-cabeca", label: "Peso da Cabeça", inputType: "number", categorySlug: "martelos", unit: "g", sortOrder: 0 },
{ slug: "tipo-cabeca", label: "Tipo de Cabeça", inputType: "select", categorySlug: "martelos", options: { kind: "select", options: [ { label: "Carpinteiro", value: "carpinteiro" }, { label: "Bola", value: "bola" }, { label: "Marreta", value: "marreta" }, { label: "Borracha", value: "borracha" } ] }, sortOrder: 1 },
// lixadeiras (+2 → efetivo 5)
{ slug: "tamanho-base", label: "Tamanho da Base", inputType: "text", categorySlug: "lixadeiras", sortOrder: 0 },
{ slug: "tipo-lixa", label: "Tipo de Lixa", inputType: "select", categorySlug: "lixadeiras", options: { kind: "select", options: [ { label: "Folha", value: "folha" }, { label: "Disco", value: "disco" }, { label: "Cinta", value: "cinta" } ] }, sortOrder: 1 },
// plainas-eletricas (+1 → efetivo 4)
{ slug: "largura-corte", label: "Largura de Corte", inputType: "number", categorySlug: "plainas-eletricas", unit: "mm", sortOrder: 0 },
// parafusadeiras-a-bateria (+1 → efetivo 6)
{ slug: "torque-nm", label: "Torque Máximo", inputType: "number", categorySlug: "parafusadeiras-a-bateria", unit: "Nm", sortOrder: 0 },
// serras-tico-tico (+1 → efetivo 6)
{ slug: "curso-mm", label: "Curso", inputType: "number", categorySlug: "serras-tico-tico", unit: "mm", sortOrder: 0 },
```

- [ ] **Step 4: Ajustar `attributeValues` e `imageCount` dos tools em `TOOLS`**

Cada tool `active` deve ter **≥4 specs preenchidas** e **imageCount ≥ 3**. Aplicar:

| Tool | `attributeValues` (final) | `imageCount` |
|---|---|---|
| Furadeira Impacto | (inalterado — já 4) | 2 → **3** |
| Serra Circular | + `{ slug: "velocidade-rpm-range", valueNumeric: "0", valueNumericMax: "5500" }` | 3 (ok) |
| Serra Tico-Tico | + `{ slug: "curso-mm", valueNumeric: "26" }`, `{ slug: "velocidade-rpm-range", valueNumeric: "500", valueNumericMax: "3000" }`, `{ slug: "profundidade-corte", valueNumeric: "80" }` | 1 → **3** |
| Esmerilhadeira | + `{ slug: "voltagem-nominal", valueText: "Bivolt" }`, `{ slug: "velocidade-rpm-range", valueNumeric: "0", valueNumericMax: "11000" }` | 3 (ok) |
| Parafusadeira 18V | + `{ slug: "torque-nm", valueNumeric: "40" }`, `{ slug: "velocidade-rpm-range", valueNumeric: "0", valueNumericMax: "1500" }` | 2 → **3** |
| Lixadeira Orbital | + `{ slug: "tamanho-base", valueText: "93 × 185 mm" }`, `{ slug: "tipo-lixa", valueText: "folha" }` | 1 → **3** |
| Compressor 100L | + `{ slug: "vazao-pcm", valueNumeric: "8.5" }`, `{ slug: "potencia-motor-hp", valueNumeric: "2" }` | 2 → **3** |
| Martelo Carpinteiro | + `{ slug: "peso-cabeca", valueNumeric: "450" }`, `{ slug: "tipo-cabeca", valueText: "carpinteiro" }` | 3 (ok) |
| Alicate Universal | + `{ slug: "abertura-mandibula", valueNumeric: "30" }`, `{ slug: "tipo-corte", valueText: "lateral" }` | 3 (ok) |
| Disco de Corte | **substituir** `[{ slug: "cor-acabamento", valueText: "prata" }]` por `[{ slug: "diametro-disco-corte", valueNumeric: "115" }, { slug: "espessura-disco", valueNumeric: "1.0" }, { slug: "furo-disco", valueNumeric: "22.23" }, { slug: "material-abrasivo", valueText: "oxido-zirconio" }]` | 1 → **3** |

Plaina (discontinued) fica inalterada — não precisa cumprir a régua; a categoria enriquecida (Step 3) cobre o check de categoria.

> Elegibilidade: o seed só grava specs de atributos na cadeia da categoria primária (`catalog.ts:1007`). Todos os slugs acima pertencem à categoria do tool ou a um ancestral (verificado: `velocidade-rpm-range`/`voltagem-nominal`/`potencia-w` vêm de `ferramentas-eletricas`; `profundidade-corte` de `serras-eletricas`; os `+próprios` são da própria folha).

- [ ] **Step 5: check-types**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/scripts/seed/catalog.ts
git commit -m "fix(seed): tools active dentro da régua de ativação (ncm, specs, imagens, categorias)"
```

---

### Task 5: Novos checks de ativação no `verify.ts`

**Files:**
- Modify: `packages/db/scripts/seed/verify.ts`

- [ ] **Step 1: Adicionar dois checks ao array `CHECKS`**

Acrescentar ao array `CHECKS`:

```ts
{
	name: "tool active fora da régua de ativação (specs<4, imagens<3 ou sem ncm)",
	query: `
		SELECT count(*) AS n
		FROM tool t
		WHERE t.status = 'active'
		  AND (
			(t.ncm IS NULL OR btrim(t.ncm) = '')
			OR (SELECT count(*) FROM tool_image ti WHERE ti.tool_id = t.id) < 3
			OR (
				SELECT count(*) FROM tool_attribute_value tav
				JOIN tool_attribute_assignment taa
				  ON taa.tool_id = tav.tool_id AND taa.attribute_id = tav.attribute_id
				WHERE tav.tool_id = t.id
				  AND ((tav.value_text IS NOT NULL AND btrim(tav.value_text) <> '')
					OR tav.value_numeric IS NOT NULL
					OR tav.value_numeric_max IS NOT NULL
					OR tav.value_bool IS NOT NULL)
			) < 4
		  )
	`,
},
{
	name: "categoria primary de tool com menos de 4 atributos efetivos",
	query: `
		SELECT count(*) AS n
		FROM category c
		WHERE EXISTS (
			SELECT 1 FROM tool_category tc
			WHERE tc.category_id = c.id AND tc.is_primary = true
		)
		  AND (
			SELECT count(*) FROM attribute_definition ad
			JOIN category c2 ON c2.id = ad.category_id
			WHERE c2.path = c.path OR c.path LIKE c2.path || '/%'
		  ) < 4
	`,
},
```

- [ ] **Step 2: check-types**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/seed/verify.ts
git commit -m "test(seed): verify falha se tool active viola régua de ativação"
```

---

### Task 6: Re-seed e verificação no banco

**Files:** nenhum (execução).

- [ ] **Step 1: Reconstruir o banco de dev**

Run: `bun db:seed-demo`
Expected: termina sem lançar; a etapa de verify **não** reporta os dois checks novos com `n > 0`.

- [ ] **Step 2: Confirmar via SQL que todo active passa**

Rodar (via `mcp__supabase__execute_sql`, projeto `wrxohbzepoyscsacjzvd`, ou `bunx tsx` com o db client) a query de diagnóstico:

```sql
WITH active_tools AS (
  SELECT t.id, t.name, t.ncm, tc.category_id AS primary_cat_id
  FROM tool t JOIN tool_category tc ON tc.tool_id = t.id AND tc.is_primary = true
  WHERE t.status = 'active'
),
filled AS (
  SELECT tav.tool_id, COUNT(*) AS n FROM tool_attribute_value tav
  WHERE (tav.value_text IS NOT NULL AND btrim(tav.value_text) <> '')
     OR tav.value_numeric IS NOT NULL OR tav.value_numeric_max IS NOT NULL OR tav.value_bool IS NOT NULL
  GROUP BY tav.tool_id
),
imgs AS (SELECT tool_id, COUNT(*) AS n FROM tool_image GROUP BY tool_id)
SELECT count(*) AS reprovados
FROM active_tools at
LEFT JOIN filled f ON f.tool_id = at.id
LEFT JOIN imgs i ON i.tool_id = at.id
WHERE COALESCE(f.n,0) < 4 OR COALESCE(i.n,0) < 3 OR at.ncm IS NULL OR btrim(at.ncm) = '';
```
Expected: `reprovados = 0`.

- [ ] **Step 3: Smoke no browser**

`bun dev:web`, editar o "Compressor de Ar 100L 2HP" (mudar só o nome) → salva sem erro de specs/categoria. Ativar um tool draft com <4 specs → barra com a mensagem de ativação. (Sem commit — passo de verificação.)

---

## Fase C — Polish do aviso (bug secundário)

### Task 7: Avisos informativos não âncoram o foco de erro

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx`

- [ ] **Step 1: Remover `data-error` do aviso de categoria incompleta**

Em `identity-fields.tsx` (linha ~194), no `<p className="text-warning ..." data-error="true">` do aviso "A categoria principal está incompleta", **remover** o atributo `data-error="true"`. O aviso é informativo; `focusFirstError` (`[aria-invalid="true"], [data-error="true"]`) só deve ancorar em erros reais de submit (`<FieldError>`).

- [ ] **Step 2: check + testes**

Run: `bun check-types && bun --cwd apps/web test tools`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx
git commit -m "fix(tools): aviso de categoria incompleta não rouba o foco de erro"
```

---

## Gate final

- [ ] `bun verify` (check-types + check + test) verde.
- [ ] `bun --cwd apps/web run build` OK (arquivos `"use server"` tocados na Task 3).

## Self-review (coverage do spec)

- Frente A (regra transicional) → Tasks 1-3. ✓
- Frente B (dados + verify) → Tasks 4-6 (ncm/atributos/specs/imagens em 4; checks em 5; re-seed em 6). ✓
- Frente C (polish aviso) → Task 7. ✓
- Semântica "só na transição" → `enforceActivation = status==='active' && initialStatus!=='active'` (client, Task 2) e `previousStatus!=='active' && data.status==='active'` (server, Task 3). ✓
- Categorias enriquecidas com atributos reais → Task 4 Step 3 (≥4 efetivos por categoria de tool). ✓
- Fora de escopo (anti-regressão, enforcement DB, baixar limiares) — não implementado, coerente com o spec. ✓

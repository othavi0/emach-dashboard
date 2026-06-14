# Fase B — Mínimo de 4 especificações ao ativar (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exigir no mínimo 4 especificações técnicas preenchidas para ativar uma ferramenta (`status === "active"`), com um contador "X de 4" guiando o usuário no editor de specs.

**Architecture:** Espelha a regra existente das 3 imagens (`MIN_IMAGES_ACTIVE`): um helper puro conta specs preenchidas, o `toolFormSchema.superRefine` emite o erro só quando o status é `active`, e o erro cai no passo "Especificações" (já mapeado em `STEP_FIELDS.specs`). Não toca a infra de notificação (isso é a Fase A) — usa o `FormErrorPanel`/toast atuais.

**Tech Stack:** Zod 4, TypeScript, Vitest (environment node), React 19 / Next 16.

Spec de referência: `docs/superpowers/specs/2026-06-13-toast-notifications-and-min-specs-design.md`.

---

### Task 1: Helper `countFilledSpecs` + constante `MIN_SPECS_ACTIVE`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AttributeValueInput } from "../tool-schema";
import { countFilledSpecs, MIN_SPECS_ACTIVE } from "../tool-schema";

const txt = (s: string): AttributeValueInput => ({ valueText: s });
const num = (n: number): AttributeValueInput => ({ valueNumeric: n });
const bool = (b: boolean): AttributeValueInput => ({ valueBool: b });

describe("MIN_SPECS_ACTIVE", () => {
	it("é 4", () => {
		expect(MIN_SPECS_ACTIVE).toBe(4);
	});
});

describe("countFilledSpecs", () => {
	it("conta apenas atributos vinculados E com valor real", () => {
		const values: Record<string, AttributeValueInput> = {
			a: txt("700W"),
			b: num(12),
			c: bool(false),
			d: txt(""), // vazio → não conta
		};
		const assignments = ["a", "b", "c", "d"];
		expect(countFilledSpecs(values, assignments)).toBe(3);
	});

	it("ignora valores sem vínculo (preenchido mas não em assignments)", () => {
		const values: Record<string, AttributeValueInput> = {
			a: txt("x"),
			orphan: txt("y"),
		};
		expect(countFilledSpecs(values, ["a"])).toBe(1);
	});

	it("ignora vinculados sem valor algum", () => {
		const values: Record<string, AttributeValueInput> = { a: txt("x") };
		expect(countFilledSpecs(values, ["a", "b", "c"])).toBe(1);
	});

	it("trata texto só de espaços como vazio", () => {
		expect(countFilledSpecs({ a: txt("   ") }, ["a"])).toBe(0);
	});

	it("NaN em valueNumeric não conta", () => {
		expect(countFilledSpecs({ a: { valueNumeric: Number.NaN } }, ["a"])).toBe(0);
	});

	it("valueBool false conta como preenchido", () => {
		expect(countFilledSpecs({ a: bool(false) }, ["a"])).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL — `countFilledSpecs` / `MIN_SPECS_ACTIVE` not exported.

- [ ] **Step 3: Implement helper and constant**

In `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`, add next to `MIN_IMAGES_ACTIVE` (após a linha `export const MAX_IMAGES = 8;`):

```ts
export const MIN_SPECS_ACTIVE = 4;
```

Add at the end of the file (após `buildOneAttributeSchema`), usando o tipo `AttributeValueInput` já exportado no arquivo:

```ts
function isSpecFilled(v: AttributeValueInput): boolean {
	if (typeof v.valueText === "string" && v.valueText.trim() !== "") {
		return true;
	}
	if (typeof v.valueNumeric === "number" && !Number.isNaN(v.valueNumeric)) {
		return true;
	}
	if (typeof v.valueBool === "boolean") {
		return true;
	}
	return false;
}

/**
 * Conta atributos que estão vinculados (slug em `assignments`) E com valor real
 * preenchido. Usado pela regra de ativação (mínimo MIN_SPECS_ACTIVE) e pelo
 * contador no editor de specs. `valueBool` false conta — é decisão consciente.
 */
export function countFilledSpecs(
	attributeValues: Record<string, AttributeValueInput>,
	assignments: string[]
): number {
	let count = 0;
	for (const slug of assignments) {
		const v = attributeValues[slug];
		if (v && isSpecFilled(v)) {
			count++;
		}
	}
	return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test tool-schema`
Expected: PASS (todos os casos de `countFilledSpecs` e `MIN_SPECS_ACTIVE`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts \
  apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
git commit -m "feat: countFilledSpecs e MIN_SPECS_ACTIVE para regra de specs"
```

---

### Task 2: Validação no `superRefine` — ativar exige 4 specs

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` (dentro do `superRefine` de `toolFormSchema`)
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append ao `tool-schema.test.ts` (importar `toolFormSchema` na linha de import existente: `import { countFilledSpecs, MIN_SPECS_ACTIVE, toolFormSchema } from "../tool-schema";`):

```ts
function baseTool(overrides: Record<string, unknown> = {}) {
	return {
		name: "Furadeira de impacto",
		status: "active" as const,
		weightKg: 2,
		lengthCm: 30,
		widthCm: 10,
		heightCm: 10,
		categoryIds: ["cat-1"],
		primaryCategoryId: "cat-1",
		images: [
			{ url: "https://x/1.jpg", sortOrder: 0 },
			{ url: "https://x/2.jpg", sortOrder: 1 },
			{ url: "https://x/3.jpg", sortOrder: 2 },
		],
		variants: [
			{ sku: "SKU-1", priceAmount: 100, isDefault: true, sortOrder: 0 },
		],
		attributeAssignments: ["a", "b", "c", "d"],
		attributeValues: {
			a: { valueText: "700W" },
			b: { valueText: "Bivolt" },
			c: { valueNumeric: 2 },
			d: { valueBool: true },
		},
		...overrides,
	};
}

describe("toolFormSchema — regra de specs ao ativar", () => {
	it("aceita active com 4 specs preenchidas", () => {
		const r = toolFormSchema.safeParse(baseTool());
		expect(r.success).toBe(true);
	});

	it("rejeita active com 3 specs preenchidas", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				attributeAssignments: ["a", "b", "c"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
				},
			})
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(
				r.error.issues.some((i) => String(i.path[0]) === "attributeValues")
			).toBe(true);
		}
	});

	it("aceita draft com 0 specs (regra só vale ao ativar)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				status: "draft",
				attributeAssignments: [],
				attributeValues: {},
				images: [],
			})
		);
		expect(r.success).toBe(true);
	});

	it("rejeita active quando há 4 vinculados mas só 3 preenchidos", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				attributeAssignments: ["a", "b", "c", "d"],
				attributeValues: {
					a: { valueText: "700W" },
					b: { valueText: "Bivolt" },
					c: { valueNumeric: 2 },
					d: { valueText: "" },
				},
			})
		);
		expect(r.success).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL — "rejeita active com 3 specs" passa por engano (schema ainda aceita), assert de `success === false` falha.

- [ ] **Step 3: Add the validation in `superRefine`**

No `toolFormSchema.superRefine`, logo após o bloco da regra de imagens (`if (data.status === "active" && data.images.length < MIN_IMAGES_ACTIVE) { ... }`), adicionar:

```ts
if (
	data.status === "active" &&
	countFilledSpecs(data.attributeValues, data.attributeAssignments) <
		MIN_SPECS_ACTIVE
) {
	ctx.addIssue({
		code: "custom",
		path: ["attributeValues"],
		message: `Ativar exige ao menos ${MIN_SPECS_ACTIVE} especificações preenchidas. Se a categoria tiver poucos atributos, anexe atributos extras do catálogo.`,
	});
}
```

(`countFilledSpecs` é declarada com `function` → hoisting cobre o uso acima da definição no mesmo módulo.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test tool-schema`
Expected: PASS (todos os casos).

- [ ] **Step 5: Verify the whole suite + types**

Run: `bun --cwd apps/web test && bun --cwd apps/web check-types`
Expected: suíte verde, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts \
  apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
git commit -m "feat: ativar ferramenta exige mínimo de 4 especificações preenchidas"
```

---

### Task 3: Contador "X de 4 preenchidas" no editor de specs

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx`

- [ ] **Step 1: Importar helper e constante**

No topo de `spec-fields.tsx`, ajustar o import de `../tool-schema` (hoje só `AttributeValueInput`) para incluir os novos símbolos:

```ts
import type { AttributeValueInput } from "../tool-schema";
import { countFilledSpecs, MIN_SPECS_ACTIVE } from "../tool-schema";
```

- [ ] **Step 2: Calcular a contagem**

Dentro de `SpecFields`, após o bloco `const assignedDefinitions = useMemo(...)`, adicionar:

```ts
const filledSpecs = countFilledSpecs(
	values.attributeValues,
	values.attributeAssignments
);
```

- [ ] **Step 3: Renderizar o contador no header**

Trocar a linha `<h3 className="font-medium text-sm">Atributos desta ferramenta</h3>` (logo após `<div className="flex flex-col gap-4">`) por:

```tsx
<div className="flex items-center justify-between gap-2">
	<h3 className="font-medium text-sm">Atributos desta ferramenta</h3>
	<span
		className={
			filledSpecs >= MIN_SPECS_ACTIVE
				? "text-success text-xs"
				: "text-muted-foreground text-xs"
		}
	>
		{filledSpecs} de {MIN_SPECS_ACTIVE} preenchidas
	</span>
</div>
```

- [ ] **Step 4: Verify types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 5: Smoke no browser (porta 3008)**

1. Navegar até `http://localhost:3008/dashboard/tools/new` na tab `226480268`.
2. Ir ao passo "Especificações", marcar atributos e preencher valores; confirmar que o contador "X de 4 preenchidas" sobe e fica verde ao chegar a 4.
3. No último passo, marcar status `Ativo` com <4 specs preenchidas e tentar criar; confirmar que o erro "Ativar exige ao menos 4 especificações…" aparece (no `FormErrorPanel` atual + toast de contagem) e bloqueia o submit.
4. Conferir o console (`read_console_messages`, `onlyErrors`) sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/fields/spec-fields.tsx
git commit -m "feat: contador de especificações preenchidas no editor de specs"
```

---

## Self-Review

**Spec coverage (Fase B do spec):**
- B1 `MIN_SPECS_ACTIVE` → Task 1. ✓
- B2 `countFilledSpecs` (regra de "preenchido" por tipo) → Task 1. ✓
- B3 validação `superRefine` ao ativar → Task 2. ✓
- B4 contador "X de 4" → Task 3. ✓
- B5 testes → Tasks 1 e 2. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo de código tem o código completo. ✓

**Type consistency:** `countFilledSpecs(attributeValues, assignments)` e `MIN_SPECS_ACTIVE` usados de forma idêntica em Tasks 1, 2 e 3; `AttributeValueInput` é o tipo já exportado de `tool-schema.ts`. ✓

**Fora de escopo (Fase A):** migração de toast/erro por campo e remoção do `FormErrorPanel` não entram aqui — a Task 3 usa a infra de erro atual de propósito.

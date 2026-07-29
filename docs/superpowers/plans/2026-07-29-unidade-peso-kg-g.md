# Unidade de peso kg/g no cadastro de ferramentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seletor de unidade kg/g acoplado aos campos de peso do passo "Logística & frete", com conversão na borda da UI e exibição adaptativa — sem tocar schema, contrato ou ecommerce.

**Architecture:** Componente client `WeightInput` (InputGroup + MaskedInput + DropdownMenu) que expõe kg no contrato externo e mantém a unidade como estado interno; helpers puros de conversão em `src/lib/weight-unit.ts`; `formatWeight()` para exibição. Spec: `docs/superpowers/specs/2026-07-29-unidade-peso-design.md`.

**Tech Stack:** Next 16 / React 19 (React Compiler ativo), TypeScript, vitest (`environment: node`), Biome/ultracite, base-ui via `@emach/ui`.

## Global Constraints

- CWD é a **raiz** do monorepo (turbo/bun) — nunca `cd apps/web`; usar `bun --cwd apps/web test`.
- Anti-patterns P0: sem `any`/`@ts-ignore`, sem `console.*` (usar `logger`), sem `React.forwardRef`, sem `useMemo`/`useCallback` manuais, sem `key={index}`.
- Valor canônico de peso é **sempre kg** (`numeric(10,3)`, resolução 1 g). Zod, form state, coluna e contrato admin↔ecommerce **não mudam**.
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reordenar campos; se um Edit subsequente falhar com `string not found`, re-Read antes de re-tentar.
- Gate final: `bun verify` (check-types && check && test) da raiz, com turbo sem cache velho (`--force` se disponível no script).
- Banco único dev=prod compartilhado com o ecommerce: NUNCA seed/truncate/drop/reset/db:push destrutivo. Write pontual de linha em dado de teste (`EM-TEST-*`) é permitido e deve ser revertido ao terminar. (Este plano não exige write de banco; o smoke usa a tool de teste existente.)
- Commits: Conventional Commits em PT, subject ≤50 chars, sem qualquer atribuição de AI.

---

### Task 1: Helpers puros de conversão (`weight-unit.ts`)

**Files:**
- Create: `apps/web/src/lib/weight-unit.ts`
- Test: `apps/web/src/lib/__tests__/weight-unit.test.ts`

**Interfaces:**
- Consumes: `formatMeasure` de `@/lib/format/number` (já existe).
- Produces: `type WeightUnit = "kg" | "g"`, `kgToDisplay(kg: number | undefined, unit: WeightUnit): number | undefined`, `displayToKg(n: number | undefined, unit: WeightUnit): number | undefined`, `initialUnit(kg: number | undefined, fallback: WeightUnit): WeightUnit`, `conversionHint(kg: number | undefined, unit: WeightUnit): string | null`. Tasks 3 e 4 dependem desses nomes exatos.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/weight-unit.test.ts
import { describe, expect, it } from "vitest";

import {
	conversionHint,
	displayToKg,
	initialUnit,
	kgToDisplay,
} from "../weight-unit";

describe("kgToDisplay", () => {
	it("kg passa direto; g multiplica por 1000 e arredonda", () => {
		expect(kgToDisplay(2.5, "kg")).toBe(2.5);
		expect(kgToDisplay(0.35, "g")).toBe(350);
		expect(kgToDisplay(0.0004, "g")).toBe(0);
	});

	it("undefined atravessa", () => {
		expect(kgToDisplay(undefined, "kg")).toBeUndefined();
		expect(kgToDisplay(undefined, "g")).toBeUndefined();
	});
});

describe("displayToKg", () => {
	it("g inteiro vira kg com 3 casas", () => {
		expect(displayToKg(350, "g")).toBe(0.35);
		expect(displayToKg(1500, "g")).toBe(1.5);
	});

	it("g fracionário arredonda pra grama inteira (resolução do banco)", () => {
		expect(displayToKg(350.7, "g")).toBe(0.351);
	});

	it("kg arredonda a 3 casas", () => {
		expect(displayToKg(2.5, "kg")).toBe(2.5);
		expect(displayToKg(2.5006, "kg")).toBe(2.501);
	});

	it("ida-e-volta g→kg→g não deriva", () => {
		for (const g of [1, 80, 350, 999, 1234]) {
			expect(kgToDisplay(displayToKg(g, "g"), "g")).toBe(g);
		}
	});

	it("undefined atravessa", () => {
		expect(displayToKg(undefined, "g")).toBeUndefined();
	});
});

describe("initialUnit", () => {
	it("valor sub-kg abre em gramas", () => {
		expect(initialUnit(0.35, "kg")).toBe("g");
		expect(initialUnit(0.999, "kg")).toBe("g");
	});

	it("≥ 1 kg, zero ou vazio usam o fallback do campo", () => {
		expect(initialUnit(1, "g")).toBe("g");
		expect(initialUnit(2.5, "kg")).toBe("kg");
		expect(initialUnit(0, "g")).toBe("g");
		expect(initialUnit(undefined, "kg")).toBe("kg");
	});
});

describe("conversionHint", () => {
	it("modo g mostra o equivalente em kg", () => {
		expect(conversionHint(0.35, "g")).toBe("= 0,35 kg");
	});

	it("modo kg sub-kg mostra o equivalente em g", () => {
		expect(conversionHint(0.35, "kg")).toBe("= 350 g");
	});

	it("modo kg ≥ 1 kg não mostra hint", () => {
		expect(conversionHint(2.5, "kg")).toBeNull();
	});

	it("vazio ou zero não mostra hint", () => {
		expect(conversionHint(undefined, "g")).toBeNull();
		expect(conversionHint(0, "g")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test src/lib/__tests__/weight-unit.test.ts`
Expected: FAIL — `Cannot find module '../weight-unit'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/weight-unit.ts
import { formatMeasure } from "@/lib/format/number";

export type WeightUnit = "kg" | "g";

/** Converte o valor canônico (kg) pro número exibido na unidade escolhida. */
export function kgToDisplay(
	kg: number | undefined,
	unit: WeightUnit
): number | undefined {
	if (kg === undefined) {
		return undefined;
	}
	return unit === "g" ? Math.round(kg * 1000) : kg;
}

/** Converte o número digitado de volta pra kg, a 3 casas (resolução do banco: 1 g). */
export function displayToKg(
	n: number | undefined,
	unit: WeightUnit
): number | undefined {
	if (n === undefined) {
		return undefined;
	}
	return unit === "g" ? Math.round(n) / 1000 : Math.round(n * 1000) / 1000;
}

/** Peso existente sub-kg abre em gramas; senão a unidade default do campo. */
export function initialUnit(
	kg: number | undefined,
	fallback: WeightUnit
): WeightUnit {
	return kg !== undefined && kg > 0 && kg < 1 ? "g" : fallback;
}

/** Equivalente na outra unidade, quando ajuda a conferir a grandeza. */
export function conversionHint(
	kg: number | undefined,
	unit: WeightUnit
): string | null {
	if (kg === undefined || kg <= 0) {
		return null;
	}
	if (unit === "g") {
		return `= ${formatMeasure(kg)} kg`;
	}
	return kg < 1 ? `= ${formatMeasure(Math.round(kg * 1000))} g` : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test src/lib/__tests__/weight-unit.test.ts`
Expected: PASS (todos os describes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/weight-unit.ts apps/web/src/lib/__tests__/weight-unit.test.ts
git commit -m "feat: helpers de conversão de peso kg/g"
```

---

### Task 2: `formatWeight()` — exibição adaptativa

**Files:**
- Modify: `apps/web/src/lib/format/number.ts` (append após `formatMeasure`)
- Test: `apps/web/src/lib/format/__tests__/number.test.ts` (append)

**Interfaces:**
- Consumes: `formatMeasure` do mesmo módulo.
- Produces: `formatWeight(value: string | number | null | undefined): string | null`. Task 5 depende desse nome exato.

- [ ] **Step 1: Write the failing test** (append no arquivo existente, fora do `describe("formatMeasure")`)

```ts
import { formatMeasure, formatWeight } from "../number";
// (ajustar o import existente no topo do arquivo para incluir formatWeight)

describe("formatWeight", () => {
	it("≥ 1 kg exibe em kg pt-BR", () => {
		expect(formatWeight(2.5)).toBe("2,5 kg");
		expect(formatWeight("3.000")).toBe("3 kg");
		expect(formatWeight("1.400")).toBe("1,4 kg");
	});

	it("sub-kg exibe em gramas inteiras", () => {
		expect(formatWeight(0.35)).toBe("350 g");
		expect(formatWeight("0.350")).toBe("350 g");
		expect(formatWeight("0.080")).toBe("80 g");
	});

	it("zero exibe em kg (comportamento atual)", () => {
		expect(formatWeight(0)).toBe("0 kg");
	});

	it("nulo/vazio/NaN retornam null", () => {
		expect(formatWeight(null)).toBeNull();
		expect(formatWeight(undefined)).toBeNull();
		expect(formatWeight("")).toBeNull();
		expect(formatWeight("abc")).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test src/lib/format/__tests__/number.test.ts`
Expected: FAIL — `formatWeight is not a function` / export ausente.

- [ ] **Step 3: Write minimal implementation** (append em `number.ts`)

```ts
/**
 * Formata peso escolhendo a unidade legível: ≥ 1 kg em kg, sub-kg em gramas
 * inteiras. Aceita a string crua de coluna `numeric` (mesma razão do
 * formatMeasure acima). Quem cadastrou 350 g lê "350 g", não "0,35 kg".
 */
export function formatWeight(
	value: string | number | null | undefined
): string | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const n = typeof value === "number" ? value : Number(value);
	if (Number.isNaN(n)) {
		return null;
	}
	if (n > 0 && n < 1) {
		return `${formatMeasure(Math.round(n * 1000), 0)} g`;
	}
	return `${formatMeasure(n)} kg`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test src/lib/format/__tests__/number.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format/number.ts apps/web/src/lib/format/__tests__/number.test.ts
git commit -m "feat: formatWeight com unidade adaptativa"
```

---

### Task 3: Componente `WeightInput`

**Files:**
- Create: `apps/web/src/components/weight-input.tsx`

**Interfaces:**
- Consumes: helpers da Task 1 (nomes exatos acima); `MaskedInput` (`@/components/masked-input`); `decimalMask`/`integerMask` (`@/lib/masks`); `InputGroup`/`InputGroupAddon`/`InputGroupButton` (`@emach/ui/components/input-group`); `DropdownMenu*` (`@emach/ui/components/dropdown-menu`, trigger via prop `render` — padrão base-ui, ver `sidebar-footer-user.tsx:103`).
- Produces: `WeightInput` com props `{ id: string; value: number | undefined; onChange: (kg: number | undefined) => void; defaultUnit: WeightUnit; disabled?: boolean; required?: boolean; hint?: string; "aria-invalid"?: true }`. Task 4 depende dessa assinatura — o spread `{...field}` do `LabeledField` entrega `id` + `aria-invalid`.

Sem teste unit (vitest roda `environment: node`; componente é verificado no smoke da Task 6).

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/weight-input.tsx
"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
} from "@emach/ui/components/input-group";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { decimalMask, integerMask } from "@/lib/masks";
import {
	conversionHint,
	displayToKg,
	initialUnit,
	kgToDisplay,
	type WeightUnit,
} from "@/lib/weight-unit";

const UNIT_LABEL: Record<WeightUnit, string> = {
	kg: "Quilograma (kg)",
	g: "Grama (g)",
};

interface WeightInputProps {
	"aria-invalid"?: true;
	/** Unidade de abertura quando o campo está vazio, zerado ou ≥ 1 kg. */
	defaultUnit: WeightUnit;
	disabled?: boolean;
	/** Hint estático do campo, concatenado após o hint de conversão. */
	hint?: string;
	id: string;
	onChange: (kg: number | undefined) => void;
	required?: boolean;
	/** Valor canônico em kg — o que o form state e o banco enxergam. */
	value: number | undefined;
}

/**
 * Campo de peso com seletor de unidade kg/g. A unidade é estado interno de
 * exibição; o contrato externo é sempre kg (3 casas — resolução do banco).
 * O `key={unit}` remonta o MaskedInput na troca de unidade: o display interno
 * dele é inicializado uma única vez no mount, então sem remount o número
 * exibido não seria convertido.
 */
export function WeightInput({
	id,
	value,
	onChange,
	defaultUnit,
	disabled,
	required,
	hint,
	"aria-invalid": ariaInvalid,
}: WeightInputProps) {
	const [unit, setUnit] = useState<WeightUnit>(() =>
		initialUnit(value, defaultUnit)
	);
	const conversion = conversionHint(value, unit);
	const hintText = [conversion, hint].filter(Boolean).join(" · ");
	return (
		<div className="flex flex-col gap-1">
			<InputGroup>
				<MaskedInput
					aria-invalid={ariaInvalid}
					aria-required={required ? "true" : undefined}
					className="border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
					data-slot="input-group-control"
					disabled={disabled}
					id={id}
					key={unit}
					mask={unit === "kg" ? decimalMask : integerMask}
					onChange={(n) => onChange(displayToKg(n, unit))}
					placeholder={unit === "kg" ? "Ex: 2,5" : "Ex: 350"}
					value={kgToDisplay(value, unit)}
				/>
				<InputGroupAddon align="inline-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<InputGroupButton
									aria-label="Unidade de peso"
									disabled={disabled}
								>
									{unit}
									<ChevronDown />
								</InputGroupButton>
							}
						/>
						<DropdownMenuContent align="end">
							{(["kg", "g"] as const).map((u) => (
								<DropdownMenuItem key={u} onClick={() => setUnit(u)}>
									{UNIT_LABEL[u]}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</InputGroupAddon>
			</InputGroup>
			{hintText && <p className="text-muted-foreground text-xs">{hintText}</p>}
		</div>
	);
}
```

Nota: o hint de conversão vive DENTRO do componente (depende da unidade, que é
estado interno) — a spec citava a prop `hint` do `LabeledField`, mas o
`LabeledField` não conhece a unidade; o hint estático do campo entra pela prop
`hint` daqui e os dois são concatenados com "·".

- [ ] **Step 2: Verify types**

Run: `bun check-types` (da raiz)
Expected: PASS. Se falhar em `data-slot`/`aria-required`: são props válidas de `<input>` repassadas via rest spread do `MaskedInput` → `Input`; conferir que foram passadas ao `MaskedInput` (não ao `InputGroup`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/weight-input.tsx
git commit -m "feat: componente WeightInput kg/g"
```

---

### Task 4: Integração no passo "Logística & frete"

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx`

**Interfaces:**
- Consumes: `WeightInput` (Task 3), `LabeledField` (`@/components/labeled-field`).
- Produces: nada novo — wizard e edição herdam juntos via `tool-sections.ts`. `STEP_FIELDS`, `tool-schema.ts` e `tool-form-state.ts` NÃO mudam.

- [ ] **Step 1: Trocar o campo "Peso (kg)"**

No grid `md:grid-cols-5`, substituir o primeiro `<FieldNum ... id="weightKg" ...>` por:

```tsx
<LabeledField error={errors.weightKg} id="weightKg" label="Peso" required>
	{(field) => (
		<WeightInput
			{...field}
			defaultUnit="kg"
			disabled={disabled}
			onChange={(v) => onPatch({ weightKg: v })}
			required
			value={values.weightKg}
		/>
	)}
</LabeledField>
```

Import: `import { WeightInput } from "@/components/weight-input";` (o import de `LabeledField` já existe no arquivo).

- [ ] **Step 2: Trocar o campo "Peso da embalagem (kg)"**

Substituir o bloco `<LabeledField ... id="packagingWeightKg">` atual (que envolve um `MaskedInput` e tem `hint="Somado ao peso do produto no despacho."`) por:

```tsx
<LabeledField
	error={errors.packagingWeightKg}
	id="packagingWeightKg"
	label="Peso da embalagem"
>
	{(field) => (
		<WeightInput
			{...field}
			defaultUnit="g"
			disabled={disabled}
			hint="Somado ao peso do produto no despacho."
			onChange={(v) => onPatch({ packagingWeightKg: v })}
			value={values.packagingWeightKg}
		/>
	)}
</LabeledField>
```

O `hint` sai do `LabeledField` e entra no `WeightInput` (concatena com a conversão). O tooltip/HelpTooltip da seção "Embalagem & envio" fica como está.

- [ ] **Step 3: Limpeza**

Se `FieldNum`, `MaskedInput` ou `decimalMask` ficarem sem uso no arquivo (os outros 4 FieldNum de dimensões/potência continuam usando), NÃO remover — só remover import que o Biome apontar como morto (o hook `bun fix` já limpa).

- [ ] **Step 4: Verify**

Run: `bun check-types && bun check`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx
git commit -m "feat: seletor kg/g nos pesos do wizard"
```

---

### Task 5: Exibição adaptativa nas superfícies de leitura

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/spec-rows.ts` (linha ~65-70, row `weightKg`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx` (linha ~133, MetaRow "Embalagem")
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/tabs/payment-fiscal-tab.tsx` (linha ~113, célula de peso)
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-rows.test.ts`

Fora de escopo: `shipping/_components/boxes-tab.tsx` e `box-card.tsx` exibem peso de **caixa de envio** (sempre escala kg) — manter `formatMeasure` + "kg".

**Interfaces:**
- Consumes: `formatWeight` (Task 2).
- Produces: nada novo.

- [ ] **Step 1: Write the failing test** (append em `spec-rows.test.ts`, dentro do describe existente que monta `byKey`)

Adicionar um caso com peso sub-kg — seguir o padrão do teste existente da linha ~61 (`expect(byKey.get("weightKg")?.value).toBe("1,4 kg")`), criando/reusando um tool de fixture com `weightKg: "0.350"`:

```ts
it("peso sub-kg exibe em gramas", () => {
	const rows = buildSpecRows({ ...baseTool, weightKg: "0.350" });
	const byKey = new Map(rows.map((r) => [r.key, r]));
	expect(byKey.get("weightKg")?.value).toBe("350 g");
});
```

(Ajustar `buildSpecRows`/`baseTool` aos nomes reais do arquivo de teste — ler o arquivo antes; o teste existente da linha 61 mostra o helper e a fixture usados.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test src/app/dashboard/tools/[id]/_lib/__tests__/spec-rows.test.ts`
Expected: FAIL — recebe `"0,35 kg"`.

- [ ] **Step 3: Migrar as 3 superfícies**

`spec-rows.ts` — trocar:

```ts
value:
	tool.weightKg === null
		? null
		: `${formatMeasure(tool.weightKg) ?? "—"} kg`,
```

por:

```ts
value: formatWeight(tool.weightKg),
```

(import: `formatWeight` junto do `formatMeasure` já importado de `@/lib/format/number`; `formatWeight` devolve `null` para nulo — mesmo contrato da row.)

`overview-tab.tsx` — trocar:

```tsx
{Number(tool.packagingWeightKg) > 0
	? `+${formatMeasure(tool.packagingWeightKg)} kg`
	: "—"}
```

por:

```tsx
{Number(tool.packagingWeightKg) > 0
	? `+${formatWeight(tool.packagingWeightKg)}`
	: "—"}
```

`payment-fiscal-tab.tsx` — trocar:

```tsx
{item.weightKg === null
	? "—"
	: `${formatMeasure(item.weightKg) ?? "—"} kg`}
```

por:

```tsx
{formatWeight(item.weightKg) ?? "—"}
```

Em cada arquivo, atualizar o import de `@/lib/format/number` (adicionar `formatWeight`; remover `formatMeasure` do import SÓ se ficar sem outro uso no arquivo).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --cwd apps/web test src/app/dashboard/tools/[id]/_lib/__tests__/`
Expected: PASS — incluindo o teste antigo `"1,4 kg"` (1,4 ≥ 1 kg continua em kg).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/[id]/_lib/spec-rows.ts apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-rows.test.ts apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx "apps/web/src/app/dashboard/orders/[id]/_components/tabs/payment-fiscal-tab.tsx"
git commit -m "feat: exibição de peso adaptativa kg/g"
```

---

### Task 6: Gate integrado + smoke (3 provas)

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Suíte completa**

Run: `bun verify` (da raiz)
Expected: check-types PASS, ultracite PASS, testes PASS. Qualquer warning novo de lint que o código canônico de referência não tenha → corrigir, não suprimir.

- [ ] **Step 2: Smoke funcional + perceptual (browser)**

Com `bun dev:web` rodando: abrir `/dashboard/tools/new`, ir ao passo "Logística & frete" e verificar:
1. Campo "Peso" abre em kg; "Peso da embalagem" abre em g.
2. Digitar 350 no campo embalagem (modo g) → hint "= 0,35 kg · Somado ao peso do produto no despacho.".
3. Trocar a unidade pra kg no dropdown → o número exibido vira 0,35 (converte, não mantém 350).
4. Screenshot do passo 4 lado a lado com o mockup A aprovado (`.superpowers/brainstorm/269211-1785331252/content/unidade-peso.html`).
5. Erro de validação: submeter sem peso → borda destructive + `FieldError` + foco no input (focusFirstError).

- [ ] **Step 3: Prova de dados**

Editar a tool de teste existente (`/dashboard/tools`, a única cadastrada), setar embalagem 350 g, salvar e conferir:
1. No detalhe da tool: specs mostram o peso adaptativo e MetaRow "Embalagem" mostra "+350 g".
2. No banco: `SELECT packaging_weight_kg FROM tool` → `0.350`.
3. Reverter o valor original (0.500) ao terminar.

- [ ] **Step 4: Reportar**

Só declarar "concluído" com as 3 provas colhidas; senão reportar "implementado, não verificado" com o que faltou.

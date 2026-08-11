# Entrada de valores ponto-e-vírgula — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer todo campo de valor do dashboard aceitar tanto `12,50` quanto `12.50`, e parar de gravar valor ~1000× menor quando a entrada tem separador de milhar.

**Architecture:** Um parser puro novo (`parseLocaleNumber`) concentra a regra "o último separador é o decimal". As máscaras existentes (`decimalMask`, `percentageMask`) e a duplicata em `discount-format.ts` passam a delegar a ele; uma máscara nova (`amountMask`) cobre dinheiro em texto livre. Os três campos que hoje usam `<Input>` cru migram para `MaskedInput`. `brlMask` e `integerMask` não mudam de algoritmo.

**Tech Stack:** TypeScript, React 19, Next 16, Zod 4, Drizzle, vitest (`environment: node`), bun.

**Spec:** `docs/superpowers/specs/2026-08-11-entrada-valores-ponto-virgula-design.md`

## Global Constraints

- **Commits exigem autorização explícita do usuário nesta sessão.** O `CLAUDE.md` global proíbe commit/push espontâneo. Se não houver autorização, pare no step de commit e peça.
- Conventional Commits em **português**, subject ≤ 50 caracteres.
- CWD é a **raiz do monorepo** (`/home/othavio/Projects/emach/emach-dashboard`). Nunca `cd apps/web`; use caminhos absolutos ou `--cwd`.
- Proibido: `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `console.log/warn/error` (usar `logger`), `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Testes rodam com `bun --cwd apps/web test`. Verificação completa: `bun verify` (`check-types && check && test`).
- O banco Supabase é **único e compartilhado (dev = prod = ecommerce)**. Nenhum step deste plano toca o banco por script. O smoke da Task 8 escreve **poucas linhas via UI** numa ferramenta `EM-TEST-*` e reverte ao valor original ao fim. Nunca `seed`/`truncate`/`drop`/`db:push`.
- `precision`/`scale` das colunas envolvidas: `tool_variant.price_amount numeric(10,2)`, `tool.weight_kg numeric(10,3)`, dimensões `numeric(10,2)`.

---

### Task 1: Parser tolerante (`parseLocaleNumber`)

O núcleo puro. Nenhuma UI depende dele ainda ao fim desta task.

**Files:**
- Create: `apps/web/src/lib/masks/parse-decimal.ts`
- Test: `apps/web/src/lib/masks/__tests__/parse-decimal.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `parseLocaleNumber(display: string, maxFractionDigits: number): number | undefined` — usado pelas Tasks 2, 3 e 4.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/src/lib/masks/__tests__/parse-decimal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLocaleNumber } from "../parse-decimal";

describe("parseLocaleNumber", () => {
	it("aceita vírgula e ponto como separador decimal", () => {
		expect(parseLocaleNumber("12,50", 2)).toBe(12.5);
		expect(parseLocaleNumber("12.50", 2)).toBe(12.5);
		expect(parseLocaleNumber("0,5", 2)).toBe(0.5);
		expect(parseLocaleNumber(",5", 2)).toBe(0.5);
	});

	it("descarta separador de milhar: o último separador é o decimal", () => {
		expect(parseLocaleNumber("1.234,56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("1,234.56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("1.2.3,4", 2)).toBe(123.4);
	});

	it("sem separador, lê o número inteiro", () => {
		expect(parseLocaleNumber("1500", 2)).toBe(1500);
		expect(parseLocaleNumber("0", 2)).toBe(0);
	});

	it("desempata separador único com 3 dígitos pela precisão do campo", () => {
		// dinheiro (2 casas): 3 dígitos não são centavos → milhar
		expect(parseLocaleNumber("1.500", 2)).toBe(1500);
		expect(parseLocaleNumber("1,500", 2)).toBe(1500);
		// peso (3 casas): 3 dígitos são válidos → decimal
		expect(parseLocaleNumber("1.500", 3)).toBe(1.5);
		expect(parseLocaleNumber("1,500", 3)).toBe(1.5);
	});

	it("arredonda casas em excesso à precisão do campo", () => {
		expect(parseLocaleNumber("1,2345", 2)).toBe(1.23);
		expect(parseLocaleNumber("1,2345", 3)).toBe(1.234);
	});

	it("devolve undefined para entrada sem número", () => {
		expect(parseLocaleNumber("", 2)).toBeUndefined();
		expect(parseLocaleNumber("abc", 2)).toBeUndefined();
		expect(parseLocaleNumber(",", 2)).toBeUndefined();
		expect(parseLocaleNumber(".", 2)).toBeUndefined();
	});

	it("ignora símbolos e espaços ao redor do número", () => {
		expect(parseLocaleNumber("R$ 1.234,56", 2)).toBe(1234.56);
		expect(parseLocaleNumber("10%", 2)).toBe(10);
		expect(parseLocaleNumber(" 12,5 ", 2)).toBe(12.5);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test parse-decimal`
Expected: FAIL — `Failed to resolve import "../parse-decimal"`.

- [ ] **Step 3: Write minimal implementation**

Crie `apps/web/src/lib/masks/parse-decimal.ts`:

```ts
const NON_NUMERIC = /[^\d.,]/g;
const SEPARATORS = /[.,]/g;
const THOUSANDS_GROUP_SIZE = 3;

/**
 * Lê um número digitado em pt-BR ou en-US sem exigir um separador específico.
 *
 * Regra: o ÚLTIMO separador (`.` ou `,`) delimita a parte decimal; os
 * anteriores são separador de milhar e são descartados. Um separador único
 * seguido de exatamente 3 dígitos é milhar quando o campo não aceita 3 casas
 * decimais — é o único caso ambíguo ("1.500" é 1500 em dinheiro, 1,5 em peso).
 */
export function parseLocaleNumber(
	display: string,
	maxFractionDigits: number
): number | undefined {
	const cleaned = display.replace(NON_NUMERIC, "");
	if (!cleaned) {
		return;
	}

	const lastSeparator = Math.max(
		cleaned.lastIndexOf("."),
		cleaned.lastIndexOf(",")
	);
	if (lastSeparator < 0) {
		return toNumber(cleaned, maxFractionDigits);
	}

	const intDigits = cleaned.slice(0, lastSeparator).replace(SEPARATORS, "");
	const fracDigits = cleaned.slice(lastSeparator + 1).replace(SEPARATORS, "");
	if (!(intDigits || fracDigits)) {
		return;
	}

	const separatorCount = (cleaned.match(SEPARATORS) ?? []).length;
	const isThousandsSeparator =
		separatorCount === 1 &&
		intDigits.length > 0 &&
		fracDigits.length === THOUSANDS_GROUP_SIZE &&
		maxFractionDigits < THOUSANDS_GROUP_SIZE;
	if (isThousandsSeparator) {
		return toNumber(intDigits + fracDigits, maxFractionDigits);
	}

	return toNumber(`${intDigits || "0"}.${fracDigits || "0"}`, maxFractionDigits);
}

function toNumber(raw: string, maxFractionDigits: number): number | undefined {
	const n = Number(raw);
	if (Number.isNaN(n)) {
		return;
	}
	return Number(n.toFixed(maxFractionDigits));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test parse-decimal`
Expected: PASS — 7 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/masks/parse-decimal.ts apps/web/src/lib/masks/__tests__/parse-decimal.test.ts
git commit -m "feat: parser tolerante de valores pt-BR"
```

---

### Task 2: `decimalMask` e `percentageMask` passam a usar o parser

Corrige o bug silencioso do milhar nos campos que já aceitam vírgula (peso, dimensões, specs, filtros de desconto).

**Files:**
- Modify: `apps/web/src/lib/masks/decimal.ts` (arquivo inteiro)
- Modify: `apps/web/src/lib/masks/percentage.ts` (arquivo inteiro)
- Test: `apps/web/src/lib/masks/__tests__/numeric-masks.test.ts`

**Interfaces:**
- Consumes: `parseLocaleNumber` da Task 1.
- Produces: `decimalMask` (3 casas) e `percentageMask` (2 casas, clamp 0–100) com o mesmo shape `Mask<number>` de antes — nenhum call-site muda de assinatura.

Call-sites que herdam a correção sem serem tocados: `box-form-fields.tsx` (5 campos), `logistics-fields.tsx` (3), `dynamic-specs-editor.tsx` (3), `weight-input.tsx`, `promotions-filters.tsx` (2).

- [ ] **Step 1: Write the failing test**

Crie `apps/web/src/lib/masks/__tests__/numeric-masks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decimalMask } from "../decimal";
import { percentageMask } from "../percentage";

describe("decimalMask", () => {
	it("aceita os dois separadores", () => {
		expect(decimalMask.parse("2,5")).toBe(2.5);
		expect(decimalMask.parse("2.5")).toBe(2.5);
	});

	it("não colapsa separador de milhar", () => {
		expect(decimalMask.parse("1.234,56")).toBe(1234.56);
		expect(decimalMask.parse("1,234.56")).toBe(1234.56);
	});

	it("trata 3 casas como decimal (campo aceita milésimos)", () => {
		expect(decimalMask.parse("1,500")).toBe(1.5);
	});

	it("preserva o que foi digitado durante a digitação", () => {
		expect(decimalMask.sanitize("1.234,5")).toBe("1.234,5");
		expect(decimalMask.sanitize("12a,5kg")).toBe("12,5");
	});

	it("formata com vírgula e faz round-trip", () => {
		expect(decimalMask.format(2.5)).toBe("2,5");
		expect(decimalMask.format(undefined)).toBe("");
		expect(decimalMask.parse(decimalMask.format(1234.56))).toBe(1234.56);
	});
});

describe("percentageMask", () => {
	it("aceita os dois separadores e não colapsa milhar", () => {
		expect(percentageMask.parse("10,5")).toBe(10.5);
		expect(percentageMask.parse("10.5")).toBe(10.5);
	});

	it("mantém o clamp de 0 a 100", () => {
		expect(percentageMask.parse("250")).toBe(100);
		expect(percentageMask.parse("1.234,56")).toBe(100);
	});

	it("formata com sufixo e faz round-trip", () => {
		expect(percentageMask.format(10.5)).toBe("10,5%");
		expect(percentageMask.parse(percentageMask.format(10.5))).toBe(10.5);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test numeric-masks`
Expected: FAIL — `decimalMask.parse("1.234,56")` devolve `1.23456`, e `sanitize("1.234,5")` devolve `"1,2345"`.

- [ ] **Step 3: Write minimal implementation**

Substitua **todo** o conteúdo de `apps/web/src/lib/masks/decimal.ts`:

```ts
import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

/** Colunas de medida são numeric(10,3) — milésimos são válidos. */
const DECIMAL_MAX_FRACTION = 3;
const NON_NUMERIC = /[^\d.,]/g;

function sanitizeDecimal(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parseDecimalDisplay(display: string): number | undefined {
	return parseLocaleNumber(display, DECIMAL_MAX_FRACTION);
}

function formatDecimal(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return String(raw).replace(".", ",");
}

export const decimalMask: Mask<number> = {
	format: formatDecimal,
	parse: parseDecimalDisplay,
	sanitize: sanitizeDecimal,
	inputMode: "decimal",
	placeholder: "Ex: 2,5",
};
```

Substitua **todo** o conteúdo de `apps/web/src/lib/masks/percentage.ts`:

```ts
import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

const PCT_MAX = 100;
const PCT_MAX_FRACTION = 2;
const NON_NUMERIC = /[^\d.,]/g;

function sanitizePct(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parsePct(display: string): number | undefined {
	const n = parseLocaleNumber(display, PCT_MAX_FRACTION);
	if (n === undefined) {
		return;
	}
	return Math.min(PCT_MAX, Math.max(0, n));
}

function formatPct(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return `${String(raw).replace(".", ",")}%`;
}

export const percentageMask: Mask<number> = {
	format: formatPct,
	parse: parsePct,
	sanitize: sanitizePct,
	inputMode: "decimal",
	placeholder: "Ex: 10",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test numeric-masks`
Expected: PASS.

Depois rode a suíte inteira para garantir que nenhum consumidor regrediu:
Run: `bun --cwd apps/web test`
Expected: PASS — todos os arquivos verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/masks/decimal.ts apps/web/src/lib/masks/percentage.ts apps/web/src/lib/masks/__tests__/numeric-masks.test.ts
git commit -m "fix: milhar em decimalMask e percentageMask"
```

---

### Task 3: Mesma correção na duplicata `discount-format.ts`

`sanitizePercent`/`parsePercent` são uma cópia do mesmo algoritmo, usada pelo `DiscountInput`. Sem esta task, o desconto percentual de promoção continua com o bug.

**Files:**
- Modify: `apps/web/src/lib/discount-format.ts:9-30`
- Test: `apps/web/src/lib/__tests__/discount-format.test.ts` (arquivo existente — acrescentar casos, manter os atuais)

**Interfaces:**
- Consumes: `parseLocaleNumber` da Task 1.
- Produces: `sanitizePercent(display: string): string` e `parsePercent(display: string): number` — assinaturas inalteradas (`parsePercent` continua devolvendo `0`, não `undefined`, em entrada vazia).

- [ ] **Step 1: Write the failing test**

Em `apps/web/src/lib/__tests__/discount-format.test.ts`, adicione este bloco **dentro** do `describe("discount-format", ...)` existente, sem alterar os dois `it` que já estão lá:

```ts
	it("percent: não colapsa separador de milhar", () => {
		expect(parsePercent("1.234,56")).toBe(100); // clamp, não 1.23456
		expect(parsePercent("10.5")).toBe(10.5);
		expect(parsePercent("10,5")).toBe(10.5);
		expect(sanitizePercent("1.234,5")).toBe("1.234,5");
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test discount-format`
Expected: FAIL — `sanitizePercent("1.234,5")` devolve `"1,2345"`.

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/lib/discount-format.ts`, adicione o import no topo:

```ts
import { parseLocaleNumber } from "./masks/parse-decimal";
```

E substitua as funções `sanitizePercent` e `parsePercent` (linhas 9-30) por:

```ts
const NON_NUMERIC = /[^\d.,]/g;
const PCT_MAX_FRACTION = 2;

/** Mantém só dígitos e separadores, preservando o que o usuário digitou. */
export function sanitizePercent(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

export function parsePercent(display: string): number {
	const n = parseLocaleNumber(display, PCT_MAX_FRACTION);
	if (n === undefined) {
		return 0;
	}
	return Math.min(PCT_MAX, Math.max(0, n));
}
```

`PCT_MAX`, `MONEY_FMT`, `formatPercent`, `parseMoney` e `formatMoney` ficam como estão.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test discount-format`
Expected: PASS — inclusive os dois testes pré-existentes (`sanitizePercent("0%10")` continua `"010"`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/discount-format.ts apps/web/src/lib/__tests__/discount-format.test.ts
git commit -m "fix: milhar no parser de desconto"
```

---

### Task 4: `amountMask` — dinheiro em texto livre

Máscara nova para os campos de dinheiro que não usam o digit-shift do `brlMask`. Formata com separador de milhar (`1.234,56`) e sem símbolo, porque os labels já dizem "(R$)".

**Files:**
- Create: `apps/web/src/lib/masks/amount.ts`
- Modify: `apps/web/src/lib/masks/index.ts` (acrescentar um export)
- Test: `apps/web/src/lib/masks/__tests__/amount.test.ts`

**Interfaces:**
- Consumes: `parseLocaleNumber` da Task 1; o tipo `Mask<T>` de `masks/index.ts`.
- Produces: `amountMask: Mask<number>` — consumido pelas Tasks 5 e 6 via `import { amountMask } from "@/lib/masks"`.

- [ ] **Step 1: Write the failing test**

Crie `apps/web/src/lib/masks/__tests__/amount.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { amountMask } from "../amount";

describe("amountMask", () => {
	it("aceita os dois separadores", () => {
		expect(amountMask.parse("12,50")).toBe(12.5);
		expect(amountMask.parse("12.50")).toBe(12.5);
		expect(amountMask.parse("100")).toBe(100);
	});

	it("entende separador de milhar", () => {
		expect(amountMask.parse("1.234,56")).toBe(1234.56);
		expect(amountMask.parse("1,234.56")).toBe(1234.56);
		expect(amountMask.parse("1.500")).toBe(1500);
	});

	it("arredonda a centavos", () => {
		expect(amountMask.parse("1,2345")).toBe(1.23);
	});

	it("formata com milhar e duas casas", () => {
		expect(amountMask.format(1234.56)).toBe("1.234,56");
		expect(amountMask.format(100)).toBe("100,00");
		expect(amountMask.format(undefined)).toBe("");
	});

	it("faz round-trip sem drift", () => {
		expect(amountMask.parse(amountMask.format(1234.56))).toBe(1234.56);
		expect(amountMask.parse(amountMask.format(0.05))).toBe(0.05);
	});

	it("preserva a digitação em andamento", () => {
		expect(amountMask.sanitize("1.234,5")).toBe("1.234,5");
		expect(amountMask.sanitize("R$ 12,50")).toBe("12,50");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test amount`
Expected: FAIL — `Failed to resolve import "../amount"`.

- [ ] **Step 3: Write minimal implementation**

Crie `apps/web/src/lib/masks/amount.ts`:

```ts
import type { Mask } from "./index";
import { parseLocaleNumber } from "./parse-decimal";

/** Valores monetários são numeric(10,2) — centavos, nunca milésimos. */
const AMOUNT_MAX_FRACTION = 2;
const NON_NUMERIC = /[^\d.,]/g;

const AMOUNT_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: AMOUNT_MAX_FRACTION,
	maximumFractionDigits: AMOUNT_MAX_FRACTION,
});

function sanitizeAmount(display: string): string {
	return display.replace(NON_NUMERIC, "");
}

function parseAmount(display: string): number | undefined {
	return parseLocaleNumber(display, AMOUNT_MAX_FRACTION);
}

function formatAmount(raw: number | undefined): string {
	if (raw === undefined || Number.isNaN(raw)) {
		return "";
	}
	return AMOUNT_FMT.format(raw);
}

export const amountMask: Mask<number> = {
	format: formatAmount,
	parse: parseAmount,
	sanitize: sanitizeAmount,
	inputMode: "decimal",
	placeholder: "Ex: 1.234,56",
};
```

Em `apps/web/src/lib/masks/index.ts`, acrescente o export mantendo a ordem alfabética existente — logo **depois** da linha `export { cnpjMask } from "./cnpj";` e **antes** de `export { brlMask } from "./currency-brl";`:

```ts
export { amountMask } from "./amount";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test amount`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/masks/amount.ts apps/web/src/lib/masks/index.ts apps/web/src/lib/masks/__tests__/amount.test.ts
git commit -m "feat: amountMask para dinheiro em texto livre"
```

---

### Task 5: Preço inline de variante — o bug reportado

Três arquivos mudam juntos porque o tipo atravessa os três: o campo passa a emitir `number`, o schema passa a validar `number`, e a action passa a gravar string formatada.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx:54-77, 350-357`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts:55-58`
- Modify: `apps/web/src/app/dashboard/tools/actions.ts:576-578`

**Interfaces:**
- Consumes: `amountMask` da Task 4; `MaskedInput` de `@/components/masked-input`.
- Produces: `updateVariantSchema.priceAmount` passa de `string` para `number | undefined`. `UpdateVariantInput` é o tipo derivado — qualquer outro chamador de `updateToolVariant` precisa mandar número (não há outro hoje; confirme com `grep -rn "updateToolVariant" apps/web/src`).

- [ ] **Step 1: Write the failing test**

Crie `apps/web/src/app/dashboard/tools/_components/__tests__/update-variant-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { updateVariantSchema } from "../tool-schema";

describe("updateVariantSchema.priceAmount", () => {
	it("aceita número", () => {
		const r = updateVariantSchema.safeParse({ variantId: "v1", priceAmount: 12.5 });
		expect(r.success).toBe(true);
	});

	it("rejeita negativo", () => {
		const r = updateVariantSchema.safeParse({ variantId: "v1", priceAmount: -1 });
		expect(r.success).toBe(false);
	});

	it("rejeita string — o client normaliza antes de enviar", () => {
		const r = updateVariantSchema.safeParse({ variantId: "v1", priceAmount: "12,50" });
		expect(r.success).toBe(false);
	});

	it("permite omitir o preço (edição de outro campo)", () => {
		const r = updateVariantSchema.safeParse({ variantId: "v1", sku: "ABC" });
		expect(r.success).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test update-variant-schema`
Expected: FAIL no primeiro `it` — o schema atual é `z.string()`, então o número `12.5` é rejeitado por não ser string (`success: false`, esperado `true`). Os outros três `it` já passam com o schema antigo, e devem continuar passando depois da mudança.

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`, substitua as linhas 55-58:

```ts
	priceAmount: z
		.string()
		.regex(/^\d+(\.\d{1,2})?$/, "Preço inválido")
		.optional(),
```

por:

```ts
	priceAmount: z
		.number()
		.nonnegative("Preço não pode ser negativo")
		.optional(),
```

Em `apps/web/src/app/dashboard/tools/actions.ts`, substitua as linhas 576-578:

```ts
		if (fields.priceAmount !== undefined) {
			updateFields.priceAmount = fields.priceAmount;
		}
```

por (o mesmo `toFixed(2)` que `tool-query-helpers.ts:53` já usa para gravar em `numeric(10,2)`):

```ts
		if (fields.priceAmount !== undefined) {
			updateFields.priceAmount = fields.priceAmount.toFixed(2);
		}
```

Em `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx`, troque o tipo do estado (linhas 54-68):

```ts
interface RowState {
	barcode: string;
	priceAmount: number | undefined;
	sku: string;
	voltage: string | null;
}

function makeRowState(v: ToolDetailVariant): RowState {
	return {
		barcode: v.barcode ?? "",
		sku: v.sku,
		voltage: v.voltage,
		priceAmount: Number(v.priceAmount),
	};
}
```

`isDirty` (linhas 70-77) não muda — a comparação `!==` funciona igual para número.

Troque o input (linhas 350-357) de:

```tsx
				<Input
					className="h-8 text-right tabular-nums"
					inputMode="decimal"
					onChange={(e) => setState({ ...state, priceAmount: e.target.value })}
					placeholder="0.00"
					value={state.priceAmount}
				/>
```

para:

```tsx
				<MaskedInput
					className="h-8 text-right tabular-nums"
					mask={amountMask}
					onChange={(next) => setState({ ...state, priceAmount: next })}
					value={state.priceAmount}
				/>
```

Acrescente os imports (o de `Input` só sai se nenhum outro campo da tabela o usar — confira com `grep -n "<Input" apps/web/src/app/dashboard/tools/\[id\]/_components/variants-tab.tsx`):

```ts
import { MaskedInput } from "@/components/masked-input";
import { amountMask } from "@/lib/masks";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test update-variant-schema`
Expected: PASS.

Run: `bun check-types`
Expected: sem erros — em especial nenhum erro de tipo em `variants-tab.tsx` ou `actions.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/actions.ts "apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx" apps/web/src/app/dashboard/tools/_components/__tests__/update-variant-schema.test.ts
git commit -m "fix: aceita vírgula no preço de variante"
```

---

### Task 6: Teto do seguro de frete

O `Number(capAmount)` do submit é o que hoje produz `NaN` e faz o zod disparar "Informe o teto do seguro" num campo preenchido.

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx:52-54, 63, 170-178`

**Interfaces:**
- Consumes: `amountMask` da Task 4; `MaskedInput`.
- Produces: nada para tasks posteriores.

- [ ] **Step 1: Write the failing test**

Não há teste unitário viável aqui — o defeito vive na ligação entre estado do componente e submit, sem helper puro para isolar. A verificação é o smoke da Task 8 (registrada lá como caso explícito). Pule direto ao Step 3; não invente um teste de componente, o projeto não tem infra de render (`environment: node`, sem testing-library).

- [ ] **Step 2: Reproduzir o bug antes de corrigir**

Com o dev server no ar (`bun dev:web`, ou o servidor já rodando na porta que a sessão usa), abra `/dashboard/shipping` → aba Configurações, digite `3.000,00` no "Teto do seguro (R$)" e salve.
Expected: erro "Informe o teto do seguro" sob o campo — o bug. Anote o valor original do campo antes de mexer.

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx`, troque a inicialização do estado (linhas 52-54):

```ts
	const [capAmount, setCapAmount] = useState(
		String(settings.insuranceCapAmount)
	);
```

por:

```ts
	const [capAmount, setCapAmount] = useState<number | undefined>(
		settings.insuranceCapAmount
	);
```

No `handleSubmit` (linha 63), troque:

```ts
			insuranceCapAmount: Number(capAmount),
```

por:

```ts
			insuranceCapAmount: capAmount ?? Number.NaN,
```

O `NaN` explícito preserva o comportamento correto de campo vazio: `shippingSettingsSchema.insuranceCapAmount` é `z.number()` e rejeita `NaN` com "Informe o teto do seguro" — que agora só aparece quando o campo está de fato vazio.

Troque o input (linhas 170-178):

```tsx
						{(field) => (
							<Input
								{...field}
								inputMode="decimal"
								onChange={(e) => setCapAmount(e.target.value)}
								placeholder="3000.00"
								value={capAmount}
							/>
						)}
```

por:

```tsx
						{(field) => (
							<MaskedInput
								{...field}
								mask={amountMask}
								onChange={setCapAmount}
								value={capAmount}
							/>
						)}
```

Acrescente os imports:

```ts
import { MaskedInput } from "@/components/masked-input";
import { amountMask } from "@/lib/masks";
```

Remova o import de `Input` se nenhum outro campo do arquivo o usar (`grep -n "<Input" apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx`).

- [ ] **Step 4: Verificar a correção**

Run: `bun check-types`
Expected: sem erros.

No browser, repita o Step 2: digite `3.000,00` e salve.
Expected: salva com sucesso; ao recarregar, o campo mostra `3.000,00`. Teste também `3000,50` e `3000.50` — ambos salvam. Restaure o valor original ao terminar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx
git commit -m "fix: aceita vírgula no teto do seguro"
```

---

### Task 7: Quantidade manual de picking

Campo inteiro onde `type="number"` faz o browser recusar a tecla. É o item de menor valor do plano — corte-o se o PR precisar encolher.

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx:336-344`

**Interfaces:**
- Consumes: `integerMask` de `@/lib/masks` (inalterado pela Task 2); `MaskedInput`.
- Produces: nada. O contrato `onQtyChange: (qty: number) => void` (linha 292) é mantido — o `undefined` do `MaskedInput` é convertido para `NaN`, que `qtyInvalid` (linha 309) já trata via `!Number.isInteger(qty)`.

- [ ] **Step 1: Write the failing test**

Sem teste unitário — mesmo motivo da Task 6 (sem infra de render). Verificação no smoke da Task 8.

- [ ] **Step 2: Write minimal implementation**

Em `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`, troque as linhas 336-344:

```tsx
							<Input
								className="w-24"
								id="manual-qty"
								max={remaining}
								min={1}
								onChange={(e) => onQtyChange(e.target.valueAsNumber)}
								type="number"
								value={Number.isNaN(qty) ? "" : qty}
							/>
```

por:

```tsx
							<MaskedInput
								className="w-24"
								id="manual-qty"
								mask={integerMask}
								onChange={(next) => onQtyChange(next ?? Number.NaN)}
								value={Number.isNaN(qty) ? undefined : qty}
							/>
```

Os limites `min`/`max` saem do DOM sem perda: `qtyInvalid` (linha 309) já valida `qty < 1 || qty > remaining` e bloqueia a confirmação — o atributo HTML nunca foi o que impedia o envio.

Acrescente os imports:

```ts
import { MaskedInput } from "@/components/masked-input";
import { integerMask } from "@/lib/masks";
```

Remova o import de `Input` se nenhum outro campo do arquivo o usar.

- [ ] **Step 3: Verificar**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "fix: troca input numérico da qtd de picking"
```

---

### Task 8: Verificação de pronto

As três provas exigidas pelo `CLAUDE.md`: funcional, perceptual e dados.

**Files:** nenhum arquivo modificado — esta task só verifica.

**Interfaces:**
- Consumes: tudo das Tasks 1-7.
- Produces: o relatório de verificação que acompanha o PR.

- [ ] **Step 1: Prova funcional**

Run: `bun verify`
Expected: `check-types`, `check` (ultracite) e a suíte vitest inteira verdes. Warnings de lint que o código canônico irmão também tem (ex.: `role="button"` em card clicável) são aceitáveis; erros novos, não.

- [ ] **Step 2: Prova de dados — o bug reportado**

Com o dev server no ar, abra `/dashboard/tools/b9bbf9b0-7771-4e4a-a745-f82de4b94fbc?tab=variantes` (ferramenta de teste). **Anote o preço atual de OPCAO-1 antes de mexer** — no levantamento de 2026-08-11 era `100.00`.

Digite e salve, um de cada vez, conferindo o toast e o valor exibido após recarregar:

| Entrada | Esperado |
| --- | --- |
| `12,50` | salva → `12,50` |
| `12.50` | salva → `12,50` |
| `1.234,56` | salva → `1.234,56` |
| `1.500` | salva → `1.500,00` |
| `1500` | salva → `1.500,00` |

Nenhum deve produzir "Preço inválido". **Restaure o valor original ao terminar** (regra do `CLAUDE.md`: reverter o que criou).

- [ ] **Step 3: Prova de dados — o bug silencioso**

Na mesma ferramenta, abra a edição (passo "Logística & frete") e digite `1.234,56` no peso.
Expected: o campo guarda `1234,56`, **não** `1,23456`. Confira o valor renderizado no detalhe da ferramenta depois de salvar. Restaure o peso original.

- [ ] **Step 4: Prova perceptual**

Screenshot da aba Variantes e do form de frete, comparados ao padrão irmão (qualquer outro form que já use `MaskedInput`, ex.: `box-form-fields.tsx` em `/dashboard/shipping` → Caixas). O campo com máscara deve ter a mesma altura, alinhamento e tratamento de foco dos vizinhos — `variants-tab` usa `className="h-8 text-right tabular-nums"`, que precisa continuar valendo.

- [ ] **Step 5: Relatar**

Reporte as três provas com o resultado real de cada uma. Se alguma falhar, diga qual e pare — não declare "concluído" com prova pendente.

---

## Self-Review

**Spec coverage:** parser (§Parser → Task 1), máscaras que passam a usar o parser (§tabela → Tasks 2, 3, 4), os três campos (§Os três campos → Tasks 5, 6, 7), servidor (§Servidor → Task 5), testes (§Testes → Tasks 1-4), verificação de pronto (§Verificação → Task 8). Sem lacunas.

**Placeholder scan:** nenhum "TBD"/"similar à Task N"/"trate os edge cases". As Tasks 6 e 7 declaram explicitamente por que não têm teste unitário (sem infra de render, `environment: node`) em vez de deixar um step vago.

**Type consistency:** `parseLocaleNumber(display, maxFractionDigits)` é chamado com a mesma assinatura nas Tasks 2, 3 e 4. `amountMask` é criado na Task 4 e consumido nas 5 e 6 com o mesmo import path (`@/lib/masks`). `RowState.priceAmount: number | undefined` (Task 5) casa com `MaskedInput<number>`, cujo `onChange` emite `number | undefined`. `updateVariantSchema.priceAmount: number` casa com `toFixed(2)` na action.

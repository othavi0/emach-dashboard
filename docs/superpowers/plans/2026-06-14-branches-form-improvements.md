# Melhorias no form de filiais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar intervalo de almoço aos horários, tornar contato+endereço obrigatórios, e fazer "Brasil todo" virar modo exclusivo no editor de faixas de CEP da filial.

**Architecture:** Mudanças concentradas em 4 arquivos. O tipo `BranchBusinessHoursPeriod` (jsonb, sem migração destrutiva) ganha `breakStart`/`breakEnd` opcionais; o Zod `branch-schema.ts` valida o intervalo e torna os campos de contato/endereço incondicionalmente obrigatórios; a UI (`branch-form-fields.tsx`, `cep-ranges-editor.tsx`) ganha o controle de intervalo e a exclusividade do "Brasil todo". DB mantém colunas `nullable` (banco compartilhado com ecommerce) — obrigatoriedade só no app.

**Tech Stack:** Next 16 / React 19, Zod, Drizzle (push-only), Vitest (`environment: node`), Tailwind, base-ui components.

**Spec:** `docs/superpowers/specs/2026-06-14-branches-form-improvements-design.md`

---

## File Structure

- `packages/db/src/schema/inventory.ts` — adicionar `breakStart`/`breakEnd` à interface `BranchBusinessHoursPeriod`.
- `apps/web/src/app/dashboard/branches/_components/branch-schema.ts` — `defaultBusinessHours`, `businessHoursPeriodSchema` (intervalo), campos obrigatórios, remover refine condicional, helper `isBrasilTodoOnly`.
- `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts` — atualizar `base` (campos obrigatórios) + novos testes de intervalo e de obrigatoriedade.
- `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx` — UI do intervalo de almoço (weekdays/saturday).
- `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx` — modo exclusivo "Brasil todo".

Após mexer no schema DB: `bun db:sync` (push). Antes de cada commit: `bun --cwd apps/web check-types` e `bun --cwd apps/web check` (ultracite).

> **Nota p/ o implementador:** Leia cada arquivo antes de editar (não herda state do parent). Rode `bun --cwd apps/web check-types` antes de cada commit. UI: smoke visual real no `/dev-here 3007` — `check-types` não pega layout quebrado.

---

## Task 1: Adicionar `breakStart`/`breakEnd` ao tipo de horários

**Files:**
- Modify: `packages/db/src/schema/inventory.ts:17-21`

- [ ] **Step 1: Adicionar os campos à interface**

Em `packages/db/src/schema/inventory.ts`, substituir a interface `BranchBusinessHoursPeriod`:

```ts
export interface BranchBusinessHoursPeriod {
	closesAt: string | null;
	isOpen: boolean;
	opensAt: string | null;
	breakStart: string | null;
	breakEnd: string | null;
}
```

- [ ] **Step 2: Aplicar no banco (jsonb, não-destrutivo)**

Run: `bun db:sync`
Expected: push sem prompt destrutivo (jsonb não muda de coluna; só a tipagem TS muda). Confirmar "Changes applied" ou "No changes".

- [ ] **Step 3: check-types**

Run: `bun --cwd apps/web check-types`
Expected: PASS. (Vai falhar em `branch-schema.ts`/`branch-form-fields.tsx` se eles já referenciassem os campos — ainda não referenciam, então deve passar.)

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat: campos breakStart/breakEnd no horário de filial"
```

---

## Task 2: Default do intervalo + validação Zod do intervalo de almoço

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts:10-96`
- Test: `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`

- [ ] **Step 1: Escrever os testes do intervalo (falhando)**

Adicionar ao fim de `branch-schema.test.ts`:

```ts
import { businessHoursSchema } from "../branch-schema";

describe("businessHoursSchema — intervalo de almoço", () => {
	const open = { isOpen: true, opensAt: "08:00", closesAt: "18:00" };

	it("aceita período sem intervalo", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(true);
	});

	it("aceita intervalo válido dentro do expediente", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "12:00", breakEnd: "13:00" },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(true);
	});

	it("rejeita intervalo pela metade", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "12:00", breakEnd: null },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(false);
	});

	it("rejeita intervalo fora da ordem opens < breakStart < breakEnd < closes", () => {
		const r = businessHoursSchema.safeParse({
			weekdays: { ...open, breakStart: "13:00", breakEnd: "12:00" },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.success).toBe(false);
	});

	it("zera intervalo quando o dia está fechado", () => {
		const r = businessHoursSchema.parse({
			weekdays: { isOpen: false, opensAt: null, closesAt: null, breakStart: "12:00", breakEnd: "13:00" },
			saturday: { isOpen: false, opensAt: null, closesAt: null },
			holidays: { isOpen: false, opensAt: null, closesAt: null },
		});
		expect(r.weekdays.breakStart).toBeNull();
		expect(r.weekdays.breakEnd).toBeNull();
	});
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `bun --cwd apps/web test branch-schema`
Expected: FAIL (campos `breakStart`/`breakEnd` ainda não existem no schema).

- [ ] **Step 3: Atualizar `defaultBusinessHours`**

Em `branch-schema.ts`, substituir `defaultBusinessHours`:

```ts
export const defaultBusinessHours: BranchBusinessHours = {
	weekdays: { isOpen: true, opensAt: "08:00", closesAt: "18:00", breakStart: null, breakEnd: null },
	saturday: { isOpen: true, opensAt: "08:00", closesAt: "12:00", breakStart: null, breakEnd: null },
	holidays: { isOpen: false, opensAt: null, closesAt: null, breakStart: null, breakEnd: null },
};
```

- [ ] **Step 4: Adicionar `breakStart`/`breakEnd` ao `businessHoursPeriodSchema`**

Em `branch-schema.ts`, substituir o `businessHoursPeriodSchema` inteiro (linhas ~57-96):

```ts
const businessHoursPeriodSchema = z
	.object({
		isOpen: z.boolean(),
		opensAt: timeValueSchema,
		closesAt: timeValueSchema,
		breakStart: timeValueSchema.optional().transform((v) => v ?? null),
		breakEnd: timeValueSchema.optional().transform((v) => v ?? null),
	})
	.superRefine((value, ctx) => {
		if (!value.isOpen) {
			return;
		}

		if (!value.opensAt) {
			ctx.addIssue({ code: "custom", message: "Horário de abertura obrigatório", path: ["opensAt"] });
		}

		if (!value.closesAt) {
			ctx.addIssue({ code: "custom", message: "Horário de fechamento obrigatório", path: ["closesAt"] });
		}

		if (value.opensAt && value.closesAt && value.closesAt <= value.opensAt) {
			ctx.addIssue({ code: "custom", message: "Fechamento deve ser depois da abertura", path: ["closesAt"] });
		}

		const hasStart = Boolean(value.breakStart);
		const hasEnd = Boolean(value.breakEnd);

		if (hasStart !== hasEnd) {
			ctx.addIssue({
				code: "custom",
				message: "Preencha início e fim do intervalo",
				path: [hasStart ? "breakEnd" : "breakStart"],
			});
		}

		if (
			value.breakStart &&
			value.breakEnd &&
			value.opensAt &&
			value.closesAt &&
			!(value.opensAt < value.breakStart && value.breakStart < value.breakEnd && value.breakEnd < value.closesAt)
		) {
			ctx.addIssue({
				code: "custom",
				message: "Intervalo deve ficar dentro do expediente",
				path: ["breakStart"],
			});
		}
	})
	.transform((value) => ({
		isOpen: value.isOpen,
		opensAt: value.isOpen ? value.opensAt : null,
		closesAt: value.isOpen ? value.closesAt : null,
		breakStart: value.isOpen ? value.breakStart : null,
		breakEnd: value.isOpen ? value.breakEnd : null,
	}));
```

- [ ] **Step 5: Rodar testes**

Run: `bun --cwd apps/web test branch-schema`
Expected: PASS (todos os testes de intervalo verdes; testes de cepRanges seguem verdes).

- [ ] **Step 6: check-types + commit**

```bash
bun --cwd apps/web check-types
git add apps/web/src/app/dashboard/branches/_components/branch-schema.ts apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts
git commit -m "feat: validação de intervalo de almoço no horário de filial"
```

---

## Task 3: Tornar contato + endereço obrigatórios

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts:106-175`
- Test: `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`

- [ ] **Step 1: Atualizar testes existentes + adicionar testes de obrigatoriedade**

O `base = { name, status }` atual deixa de ser válido (faltam campos). Em `branch-schema.test.ts`, no `describe("branchSchema cepRanges")`, substituir a const `base` por um endereço completo válido:

```ts
const base = {
	name: "Filial SP",
	status: "active" as const,
	phone: "(11) 98765-4321",
	cep: "01000-000",
	street: "Av. Paulista",
	streetNumber: "1578",
	neighborhood: "Bela Vista",
	city: "São Paulo",
	state: "SP",
};
```

Adicionar um novo describe:

```ts
describe("branchSchema — campos obrigatórios", () => {
	const full = {
		name: "Filial SP",
		status: "active" as const,
		phone: "(11) 98765-4321",
		cep: "01000-000",
		street: "Av. Paulista",
		streetNumber: "1578",
		neighborhood: "Bela Vista",
		city: "São Paulo",
		state: "SP",
	};

	it("aceita filial com contato e endereço completos", () => {
		expect(branchSchema.safeParse(full).success).toBe(true);
	});

	it("aceita complemento ausente (opcional)", () => {
		const { ...semComplemento } = full;
		expect(branchSchema.safeParse(semComplemento).success).toBe(true);
	});

	it.each(["phone", "cep", "street", "streetNumber", "neighborhood", "city", "state"] as const)(
		"rejeita quando %s está vazio",
		(field) => {
			const r = branchSchema.safeParse({ ...full, [field]: "" });
			expect(r.success).toBe(false);
		}
	);
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `bun --cwd apps/web test branch-schema`
Expected: FAIL nos novos testes de "rejeita quando X vazio" (hoje os campos são opcionais → aceita vazio).

- [ ] **Step 3: Tornar os campos obrigatórios no `branchSchema`**

Em `branch-schema.ts`, substituir os campos `phone`, `cep`, `street`, `streetNumber`, `neighborhood`, `city`, `state` dentro do `z.object({...})` do `branchSchema`:

```ts
		phone: z
			.string()
			.trim()
			.min(1, "Telefone obrigatório")
			.max(40, "Telefone muito longo")
			.regex(phoneRegex, "Telefone inválido"),
		businessHours: businessHoursSchema,
		cep: z
			.string()
			.trim()
			.transform((v) => v.replace(/\D/g, ""))
			.pipe(z.string().regex(cepDigitsRegex, "CEP inválido (8 dígitos)")),
		street: z.string().trim().min(1, "Rua obrigatória").max(200, "Rua muito longa"),
		streetNumber: z.string().trim().min(1, "Número obrigatório").max(20, "Número muito longo"),
		complement: optionalTrimmed.pipe(z.string().max(100, "Complemento muito longo").optional()),
		neighborhood: z.string().trim().min(1, "Bairro obrigatório").max(120, "Bairro muito longo"),
		city: z.string().trim().min(1, "Cidade obrigatória").max(120, "Cidade muito longa"),
		state: z
			.string()
			.trim()
			.toUpperCase()
			.min(1, "UF obrigatória")
			.regex(ufRegex, "UF inválido (use 2 letras)"),
```

- [ ] **Step 4: Remover o refine condicional de endereço**

Em `branch-schema.ts`, remover o bloco `.refine(...)` cujo `message` é `"Quando CEP é preenchido, rua, número, cidade e UF são obrigatórios"` (linhas ~157-171). Manter o `.refine` de sobreposição de `cepRanges`. O encadeamento final fica:

```ts
	})
	.refine((data) => !(data.cepRanges && cepRangesOverlap(data.cepRanges)), {
		message: "Faixas de CEP da filial não podem se sobrepor",
		path: ["cepRanges"],
	});
```

- [ ] **Step 5: Rodar testes**

Run: `bun --cwd apps/web test branch-schema`
Expected: PASS (todos verdes — obrigatoriedade + cepRanges + intervalo).

- [ ] **Step 6: check-types + commit**

```bash
bun --cwd apps/web check-types
git add apps/web/src/app/dashboard/branches/_components/branch-schema.ts apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts
git commit -m "feat: tornar contato e endereço obrigatórios na filial"
```

---

## Task 4: UI do intervalo de almoço (weekdays/saturday)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx:251-331`

Esta task é de UI — validação é smoke visual no browser, não teste unitário.

- [ ] **Step 1: Restringir o intervalo aos dias certos e renderizar o controle**

Em `branch-form-fields.tsx`, dentro do `hoursSection`, no `.map` de `BUSINESS_HOURS_ROWS`, após o bloco condicional `period.isOpen ? (...) : (...)` que renderiza os inputs de abertura/fechamento, adicionar — **apenas para `weekdays` e `saturday`** — uma segunda linha de intervalo quando o dia está aberto.

Definir no topo do componente (perto de `patchBusinessHours`) um set dos dias que aceitam intervalo:

```tsx
const BREAK_ROWS = new Set<BusinessHoursKey>(["weekdays", "saturday"]);
```

Trocar a `div` do row (atualmente `grid ... items-center ...`) por um container em coluna que comporta a linha principal + a linha de intervalo. Substituir o corpo do `.map` por:

```tsx
{BUSINESS_HOURS_ROWS.map((row) => {
	const period = values.businessHours[row.key];
	const canBreak = BREAK_ROWS.has(row.key);
	const hasBreak = Boolean(period.breakStart || period.breakEnd);
	return (
		<div
			className="flex flex-col gap-2 border-border border-b py-2.5 last:border-b-0"
			key={row.key}
		>
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_112px_112px] items-center gap-2 sm:gap-3">
				<Label className="text-foreground" htmlFor={`branch-hours-${row.key}-switch`}>
					{row.label}
				</Label>
				<Switch
					checked={period.isOpen}
					disabled={disabled}
					id={`branch-hours-${row.key}-switch`}
					onCheckedChange={(checked) =>
						patchBusinessHours(
							row.key,
							checked
								? { isOpen: true, opensAt: "08:00", closesAt: "18:00" }
								: { isOpen: false, opensAt: null, closesAt: null, breakStart: null, breakEnd: null }
						)
					}
				/>
				{period.isOpen ? (
					<>
						<Input
							aria-label={`Abertura de ${row.label}`}
							className="px-2 text-center tabular-nums"
							disabled={disabled}
							inputMode="numeric"
							maxLength={5}
							onChange={(event) =>
								patchBusinessHours(row.key, {
									opensAt: sanitizeTime24h(event.target.value) || null,
								})
							}
							placeholder="08:00"
							value={period.opensAt ?? ""}
						/>
						<Input
							aria-label={`Fechamento de ${row.label}`}
							className="px-2 text-center tabular-nums"
							disabled={disabled}
							inputMode="numeric"
							maxLength={5}
							onChange={(event) =>
								patchBusinessHours(row.key, {
									closesAt: sanitizeTime24h(event.target.value) || null,
								})
							}
							placeholder="18:00"
							value={period.closesAt ?? ""}
						/>
					</>
				) : (
					<span className="col-span-2 text-center text-muted-foreground text-xs italic">
						Fechado
					</span>
				)}
			</div>
			{canBreak && period.isOpen ? (
				hasBreak ? (
					<div className="grid grid-cols-[minmax(0,1fr)_auto_112px_112px] items-center gap-2 sm:gap-3">
						<span className="text-muted-foreground text-xs">Intervalo</span>
						<Button
							aria-label="Remover intervalo"
							disabled={disabled}
							onClick={() => patchBusinessHours(row.key, { breakStart: null, breakEnd: null })}
							size="icon"
							type="button"
							variant="ghost"
						>
							<Trash2 className="size-4" />
						</Button>
						<Input
							aria-label={`Início do intervalo de ${row.label}`}
							className="px-2 text-center tabular-nums"
							disabled={disabled}
							inputMode="numeric"
							maxLength={5}
							onChange={(event) =>
								patchBusinessHours(row.key, {
									breakStart: sanitizeTime24h(event.target.value) || null,
								})
							}
							placeholder="12:00"
							value={period.breakStart ?? ""}
						/>
						<Input
							aria-label={`Fim do intervalo de ${row.label}`}
							className="px-2 text-center tabular-nums"
							disabled={disabled}
							inputMode="numeric"
							maxLength={5}
							onChange={(event) =>
								patchBusinessHours(row.key, {
									breakEnd: sanitizeTime24h(event.target.value) || null,
								})
							}
							placeholder="13:00"
							value={period.breakEnd ?? ""}
						/>
					</div>
				) : (
					<Button
						className="w-fit text-muted-foreground"
						disabled={disabled}
						onClick={() => patchBusinessHours(row.key, { breakStart: "12:00", breakEnd: "13:00" })}
						size="sm"
						type="button"
						variant="ghost"
					>
						<Plus className="size-4" /> Adicionar intervalo
					</Button>
				)
			) : null}
		</div>
	);
})}
```

- [ ] **Step 2: Importar `Button`, `Plus`, `Trash2`**

No topo de `branch-form-fields.tsx`, adicionar os imports que faltam:

```tsx
import { Button } from "@emach/ui/components/button";
import { Plus, Trash2 } from "lucide-react";
```

(`Input`, `Label`, `Switch`, `sanitizeTime24h` já estão importados.)

- [ ] **Step 3: check-types + lint**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check`
Expected: PASS.

- [ ] **Step 4: Smoke visual**

Subir `/dev-here 3007`, abrir `/dashboard/branches/new`. Verificar:
- "Dias de semana" e "Sábado" abertos mostram "+ Adicionar intervalo"; "Feriados" não.
- Clicar "+ Adicionar intervalo" revela os inputs `12:00`/`13:00`; o lixeira remove.
- Layout não quebra no modo 2 colunas (página) nem 1 coluna (drawer).
- Digitar intervalo inválido (ex: `19:00`/`20:00`) e submeter → erro no bloco de horário.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx
git commit -m "feat: UI de intervalo de almoço no horário de filial"
```

---

## Task 5: "Brasil todo" como modo exclusivo

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx`
- Modify: `apps/web/src/app/dashboard/branches/_components/cep-presets.ts` (export do helper)
- Test: `apps/web/src/app/dashboard/branches/_components/__tests__/cep-presets.test.ts` (criar)

- [ ] **Step 1: Escrever o teste do helper `isBrasilTodoOnly` (falhando)**

Criar `apps/web/src/app/dashboard/branches/_components/__tests__/cep-presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isBrasilTodoOnly } from "../cep-presets";

describe("isBrasilTodoOnly", () => {
	it("true quando há só a faixa Brasil inteira", () => {
		expect(isBrasilTodoOnly([{ from: "00000000", to: "99999999" }])).toBe(true);
	});
	it("false para lista vazia", () => {
		expect(isBrasilTodoOnly([])).toBe(false);
	});
	it("false quando há faixa de estado", () => {
		expect(isBrasilTodoOnly([{ from: "01000000", to: "05999999" }])).toBe(false);
	});
	it("false quando há Brasil + outra faixa", () => {
		expect(
			isBrasilTodoOnly([
				{ from: "00000000", to: "99999999" },
				{ from: "01000000", to: "05999999" },
			])
		).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar pra ver falhar**

Run: `bun --cwd apps/web test cep-presets`
Expected: FAIL (`isBrasilTodoOnly` não existe).

- [ ] **Step 3: Exportar o helper em `cep-presets.ts`**

Ao fim de `cep-presets.ts`, adicionar:

```ts
export function isBrasilTodoOnly(
	ranges: Array<{ from: string; to: string }>
): boolean {
	return (
		ranges.length === 1 &&
		ranges[0]?.from === BRASIL_PRESET.from &&
		ranges[0]?.to === BRASIL_PRESET.to
	);
}
```

- [ ] **Step 4: Rodar teste**

Run: `bun --cwd apps/web test cep-presets`
Expected: PASS.

- [ ] **Step 5: Tornar "Brasil todo" exclusivo no editor**

Em `cep-ranges-editor.tsx`:

1. Importar o helper: trocar `import { BRASIL_PRESET, UF_CEP_PRESETS } from "./cep-presets";` por
```tsx
import { BRASIL_PRESET, UF_CEP_PRESETS, isBrasilTodoOnly } from "./cep-presets";
```

2. No corpo do componente, derivar o modo logo após a desestruturação dos props:
```tsx
const brasilTodo = isBrasilTodoOnly(value);
```

3. `addBrasil` passa a **substituir** tudo (não concatenar):
```tsx
function addBrasil() {
	onChange([
		{ from: BRASIL_PRESET.from, to: BRASIL_PRESET.to, label: BRASIL_PRESET.label },
	]);
}
```

4. No JSX, quando `brasilTodo` for `true`, esconder "Adicionar faixa" e o select "Adicionar estado…", deixando só o botão "Brasil todo" (que segue disponível como no-op visual) — ou, mais simples, esconder os três e renderizar a entrada Brasil com remover. Substituir o `<div className="flex flex-wrap items-center gap-2">...</div>` final por:

```tsx
<div className="flex flex-wrap items-center gap-2">
	{brasilTodo ? (
		<p className="text-muted-foreground text-sm">
			Atende todo o país. Remova a faixa "Brasil" para definir estados específicos.
		</p>
	) : (
		<>
			<Button
				disabled={disabled || value.length >= MAX_RANGES}
				onClick={addRow}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus className="size-4" /> Adicionar faixa
			</Button>
			<Button
				disabled={disabled}
				onClick={addBrasil}
				size="sm"
				type="button"
				variant="outline"
			>
				Brasil todo
			</Button>
			<Select
				disabled={disabled || value.length >= MAX_RANGES}
				onValueChange={addUf}
				value=""
			>
				<SelectTrigger className="h-8 w-[200px]" size="sm">
					<SelectValue placeholder="Adicionar estado…" />
				</SelectTrigger>
				<SelectContent>
					{UF_CEP_PRESETS.map((preset) => (
						<SelectItem key={preset.uf} value={preset.uf}>
							{preset.uf} — {preset.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</>
	)}
</div>
```

A entrada Brasil aparece como uma `<li>` normal do `renderRow` (com o botão remover já existente), então remover a faixa Brasil volta a `value=[]` e os botões reaparecem automaticamente.

- [ ] **Step 6: check-types + lint**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check`
Expected: PASS.

- [ ] **Step 7: Smoke visual**

No `/dev-here 3007`, em `/dashboard/branches/new`, seção "Faixas de CEP atendidas":
- Adicionar 1–2 estados; clicar "Brasil todo" → estados somem, sobra só "Brasil"; "Adicionar faixa" e "Adicionar estado…" desaparecem.
- Remover a faixa "Brasil" (lixeira no `renderRow`) → botões reaparecem, lista vazia.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx apps/web/src/app/dashboard/branches/_components/cep-presets.ts apps/web/src/app/dashboard/branches/_components/__tests__/cep-presets.test.ts
git commit -m "feat: Brasil todo como modo exclusivo nas faixas de CEP da filial"
```

---

## Task 6: Verificação final

- [ ] **Step 1: Suíte de testes do app**

Run: `bun --cwd apps/web test`
Expected: PASS (incluindo `branch-schema` e `cep-presets`).

- [ ] **Step 2: check-types + lint do monorepo**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web check`
Expected: PASS.

- [ ] **Step 3: Smoke end-to-end no `/dev-here 3007`**

- Criar uma filial nova preenchendo tudo, com intervalo na semana e "Brasil todo" → salva.
- Tentar criar com telefone/endereço faltando → bloqueia com erro por campo + foco no primeiro inválido.
- Abrir uma filial legada incompleta no drawer de edição → salvar acusa os campos faltantes até preencher.
- Conferir que a filial salva mostra o intervalo e o horário corretos no detalhe.

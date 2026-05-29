# Faixas de CEP por filial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar as faixas de CEP atendidas por filial no painel, com a lógica de match num helper compartilhado com o ecommerce.

**Architecture:** O contrato de dados (`{from,to,label?}`), a server action e o data layer já existem. Este plano adiciona o campo `label`, move a lógica de match pra superfície de sync (`packages/db/queries`), constrói a UI de edição (repeater no form da filial), exibe as faixas na overview-tab, e documenta o contrato. Faixas são sugestão não-autoritativa (sem roteamento automático).

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 (jsonb), Zod, vitest, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-05-29-cep-ranges-design.md`
**Branch:** `feat/branch-cep-ranges` (já criada; spec já commitada nela).

**Convenções do repo a respeitar:**
- Sem `console.*` (usar `logger`), sem `: any`/`as any`/`@ts-ignore`, sem `key={index}` (usar id estável), React 19 (sem `forwardRef`/`useMemo` manual — React Compiler ativo).
- Server actions: `"use server"` + `requireCapability` no topo, retorno `ActionResult<T>`, Zod `safeParse`, `revalidatePath` após mutação. (Já implementado em `branches/actions.ts` — não mexer na action.)
- Arquivos em `packages/db/src/{schema,queries,sql}` não podem importar de fora dessa superfície (ADR-0009, incidente #88).
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reordenar imports; re-ler arquivo se um Edit subsequente falhar por `old_string`.

---

### Task 1: Adicionar `label?` ao tipo de `cepRanges` no schema

**Files:**
- Modify: `packages/db/src/schema/inventory.ts:37`

- [ ] **Step 1: Editar o `$type` da coluna**

Trocar a linha 37:

```ts
		cepRanges: jsonb("cep_ranges").$type<Array<{ from: string; to: string }>>(),
```

por:

```ts
		cepRanges: jsonb("cep_ranges").$type<
			Array<{ from: string; to: string; label?: string }>
		>(),
```

- [ ] **Step 2: Verificar type-check**

Run: `bun check-types`
Expected: PASS (mudança é só de tipo TS; `data.ts` ainda compila porque o tipo mais largo é atribuível ao mais estreito declarado lá — será alinhado na Task 7). Se aparecer erro em `data.ts:81` sobre `cepRanges`, é esperado e resolvido na Task 7; nesse caso seguir e corrigir lá.

> Nota: a coluna é `jsonb`, então **não rodar `bun db:sync`** — não há mudança estrutural no banco. Só o tipo TS muda.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat(db): adiciona label opcional em cep_ranges"
```

---

### Task 2: Helper de lookup compartilhado em `packages/db/queries`

**Files:**
- Create: `packages/db/src/queries/branch-cep.ts`
- Create: `packages/db/src/queries/__tests__/branch-cep.test.ts`
- Modify: `packages/db/package.json` (adicionar script `test`)

- [ ] **Step 1: Adicionar script `test` ao package**

Em `packages/db/package.json`, dentro de `"scripts"`, adicionar a entrada `"test": "vitest run"` (manter as demais). Ex., se hoje há `"check-types": "tsc --noEmit"`:

```json
		"check-types": "tsc --noEmit",
		"test": "vitest run"
```

- [ ] **Step 2: Escrever o teste (falha primeiro)**

Criar `packages/db/src/queries/__tests__/branch-cep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	type BranchWithCepRanges,
	matchBranchByCep,
	normalizeCep,
} from "../branch-cep";

describe("normalizeCep", () => {
	it("remove máscara e valida 8 dígitos", () => {
		expect(normalizeCep("01000-000")).toBe("01000000");
		expect(normalizeCep("01000000")).toBe("01000000");
	});
	it("retorna null pra entrada inválida ou vazia", () => {
		expect(normalizeCep("123")).toBeNull();
		expect(normalizeCep("")).toBeNull();
		expect(normalizeCep(null)).toBeNull();
		expect(normalizeCep(undefined)).toBeNull();
	});
});

describe("matchBranchByCep", () => {
	const branches: BranchWithCepRanges[] = [
		{ id: "b1", cepRanges: [{ from: "01000000", to: "05999999" }] },
		{
			id: "b2",
			cepRanges: [{ from: "13000000", to: "13999999", label: "RMC" }],
		},
	];

	it("acha a filial cuja faixa cobre o CEP", () => {
		expect(matchBranchByCep("03000-000", branches)).toBe("b1");
		expect(matchBranchByCep("13500000", branches)).toBe("b2");
	});
	it("retorna null quando nenhum range cobre", () => {
		expect(matchBranchByCep("99999999", branches)).toBeNull();
	});
	it("retorna null pra CEP inválido", () => {
		expect(matchBranchByCep("abc", branches)).toBeNull();
	});
	it("ignora filiais sem faixas", () => {
		const list: BranchWithCepRanges[] = [
			{ id: "empty", cepRanges: null },
			{ id: "b1", cepRanges: [{ from: "01000000", to: "05999999" }] },
		];
		expect(matchBranchByCep("02000000", list)).toBe("b1");
	});
	it("em sobreposição, primeira filial da lista vence", () => {
		const overlap: BranchWithCepRanges[] = [
			{ id: "first", cepRanges: [{ from: "01000000", to: "09999999" }] },
			{ id: "second", cepRanges: [{ from: "05000000", to: "06000000" }] },
		];
		expect(matchBranchByCep("05500000", overlap)).toBe("first");
	});
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `cd packages/db && bun run test`
Expected: FAIL — `Cannot find module '../branch-cep'`.

- [ ] **Step 4: Implementar `branch-cep.ts`**

Criar `packages/db/src/queries/branch-cep.ts`:

```ts
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { and, eq, isNotNull } from "drizzle-orm";
import { branch } from "../schema/inventory";

export type CepRange = { from: string; to: string; label?: string };

export interface BranchWithCepRanges {
	cepRanges: CepRange[] | null | undefined;
	id: string;
}

const CEP_DIGITS = /^\d{8}$/;

export function normalizeCep(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}
	const digits = raw.replace(/\D/g, "");
	return CEP_DIGITS.test(digits) ? digits : null;
}

function cepInRange(cep: string, range: CepRange): boolean {
	const from = normalizeCep(range.from);
	const to = normalizeCep(range.to);
	if (!(from && to)) {
		return false;
	}
	return cep >= from && cep <= to;
}

/**
 * Em sobreposição de faixas entre filiais, retorna a PRIMEIRA filial cujo range
 * cobre o CEP (ordem do array). Sugestão não-autoritativa.
 */
export function matchBranchByCep(
	cep: string,
	branches: BranchWithCepRanges[]
): string | null {
	const normalized = normalizeCep(cep);
	if (!normalized) {
		return null;
	}
	for (const b of branches) {
		if (!b.cepRanges || b.cepRanges.length === 0) {
			continue;
		}
		if (b.cepRanges.some((range) => cepInRange(normalized, range))) {
			return b.id;
		}
	}
	return null;
}

/** Consulta filiais ativas com faixas e roda o match. Conveniência server-side. */
export async function getBranchByCep(
	db: NodePgDatabase<Record<string, unknown>>,
	cep: string
): Promise<{ id: string; name: string } | null> {
	const normalized = normalizeCep(cep);
	if (!normalized) {
		return null;
	}
	const rows = await db
		.select({ id: branch.id, name: branch.name, cepRanges: branch.cepRanges })
		.from(branch)
		.where(and(eq(branch.status, "active"), isNotNull(branch.cepRanges)));
	const matchedId = matchBranchByCep(normalized, rows);
	if (!matchedId) {
		return null;
	}
	const found = rows.find((r) => r.id === matchedId);
	return found ? { id: found.id, name: found.name } : null;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `cd packages/db && bun run test`
Expected: PASS (todos os testes de `branch-cep`).

- [ ] **Step 6: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/queries/branch-cep.ts packages/db/src/queries/__tests__/branch-cep.test.ts packages/db/package.json
git commit -m "feat(db): helper compartilhado getBranchByCep/matchBranchByCep"
```

---

### Task 3: Repontar o admin pro helper compartilhado e deletar o antigo

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx:25,297`
- Delete: `apps/web/src/app/dashboard/orders/_lib/branch-suggestion.ts`

- [ ] **Step 1: Trocar o import no order-actions-panel**

Em `order-actions-panel.tsx`, trocar a linha 25:

```ts
import { suggestBranchForCep } from "../_lib/branch-suggestion";
```

por:

```ts
import { matchBranchByCep } from "@emach/db/queries/branch-cep";
```

- [ ] **Step 2: Trocar a chamada da função**

Localizar a chamada (~linha 297) `suggestBranchForCep(` e renomear pra `matchBranchByCep(` (mesma assinatura `(cep, branches)`). Se houver import de tipos (`CepRange`/`BranchWithCepRanges`) do arquivo antigo, repontar pra `@emach/db/queries/branch-cep` também.

- [ ] **Step 3: Deletar o arquivo antigo**

```bash
git rm apps/web/src/app/dashboard/orders/_lib/branch-suggestion.ts
```

- [ ] **Step 4: Type-check (pega referências órfãs)**

Run: `bun check-types`
Expected: PASS. Se falhar com `Cannot find module '../_lib/branch-suggestion'` em outro arquivo, repontar esse import pra `@emach/db/queries/branch-cep` também.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx
git commit -m "refactor(orders): usar matchBranchByCep do pacote db"
```

---

### Task 4: Validação Zod — label, `from ≤ to`, auto-overlap

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`
- Create: `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { branchSchema, cepRangeSchema } from "../branch-schema";

describe("cepRangeSchema", () => {
	it("normaliza from/to pra 8 dígitos", () => {
		const r = cepRangeSchema.parse({ from: "01000-000", to: "05999-999" });
		expect(r.from).toBe("01000000");
		expect(r.to).toBe("05999999");
	});
	it("aceita label opcional e trata vazio como undefined", () => {
		expect(
			cepRangeSchema.parse({ from: "01000000", to: "05999999", label: "SP" })
				.label
		).toBe("SP");
		expect(
			cepRangeSchema.parse({ from: "01000000", to: "05999999", label: "" })
				.label
		).toBeUndefined();
	});
	it("rejeita from > to", () => {
		expect(
			cepRangeSchema.safeParse({ from: "05999999", to: "01000000" }).success
		).toBe(false);
	});
	it("rejeita CEP com dígitos insuficientes", () => {
		expect(cepRangeSchema.safeParse({ from: "0100", to: "05999999" }).success).toBe(
			false
		);
	});
});

describe("branchSchema cepRanges", () => {
	const base = { name: "Filial SP", status: "active" as const };

	it("aceita faixas que não se sobrepõem", () => {
		const r = branchSchema.safeParse({
			...base,
			cepRanges: [
				{ from: "01000000", to: "05999999" },
				{ from: "13000000", to: "13999999" },
			],
		});
		expect(r.success).toBe(true);
	});
	it("rejeita faixas sobrepostas da mesma filial", () => {
		const r = branchSchema.safeParse({
			...base,
			cepRanges: [
				{ from: "01000000", to: "06000000" },
				{ from: "05000000", to: "07000000" },
			],
		});
		expect(r.success).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && bunx vitest run src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`
Expected: FAIL — `cepRangeSchema` não está exportado / refines ainda não existem (o schema atual valida regex `^\d{5}-?\d{3}$` sem transform nem overlap).

- [ ] **Step 3: Reescrever o `cepRangeSchema` e o refine de overlap**

Em `branch-schema.ts`, substituir o bloco do `cepRangeSchema` (linhas ~6-11) por:

```ts
const CEP_8_DIGITS = /^\d{8}$/;

const cepDigits = z
	.string()
	.transform((v) => v.replace(/\D/g, ""))
	.pipe(z.string().regex(CEP_8_DIGITS, "CEP inválido (8 dígitos)"));

export const cepRangeSchema = z
	.object({
		from: cepDigits,
		to: cepDigits,
		label: z
			.string()
			.trim()
			.max(60, "Rótulo muito longo")
			.optional()
			.or(z.literal(""))
			.transform((v) => (v ? v : undefined)),
	})
	.refine((r) => r.from <= r.to, {
		message: "CEP inicial deve ser ≤ CEP final",
		path: ["to"],
	});

function cepRangesOverlap(
	ranges: { from: string; to: string }[]
): boolean {
	const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].from <= sorted[i - 1].to) {
			return true;
		}
	}
	return false;
}
```

> O `CEP_RANGE_REGEX` antigo (linha 6) sai — não é mais usado.

- [ ] **Step 4: Adicionar o refine de overlap ao `branchSchema`**

No final do `branchSchema` (logo após o `.refine` existente do CEP de endereço, antes do `export type`), encadear:

```ts
	.refine((data) => !data.cepRanges || !cepRangesOverlap(data.cepRanges), {
		message: "Faixas de CEP da filial não podem se sobrepor",
		path: ["cepRanges"],
	});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd apps/web && bunx vitest run src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-schema.ts apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts
git commit -m "feat(branches): valida label, from<=to e auto-overlap de cep_ranges"
```

---

### Task 5: Componente repeater `CepRangesEditor`

**Files:**
- Create: `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx`

- [ ] **Step 1: Criar o componente**

Cada faixa precisa de um id estável pra `key` (anti-pattern proíbe `key={index}`). Como `CepRange` não tem id, gerar um id local de UI por linha no estado do componente.

Criar `cep-ranges-editor.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { cepMask } from "@/lib/masks";

export type CepRangeValue = { from: string; to: string; label?: string };

interface Row extends CepRangeValue {
	uiId: string;
}

interface Props {
	disabled?: boolean;
	onChange: (next: CepRangeValue[]) => void;
	value: CepRangeValue[];
}

const MAX_RANGES = 20;

function toRows(value: CepRangeValue[]): Row[] {
	return value.map((r) => ({ ...r, uiId: crypto.randomUUID() }));
}

function stripUi(rows: Row[]): CepRangeValue[] {
	return rows.map(({ uiId: _uiId, ...rest }) => rest);
}

export function CepRangesEditor({ value, onChange, disabled }: Props) {
	// Estado local mantém uiId estável por linha; sincroniza pro pai sem uiId.
	const [rows, setRows] = useState<Row[]>(() => toRows(value));

	function commit(next: Row[]) {
		setRows(next);
		onChange(stripUi(next));
	}

	function patchRow(uiId: string, patch: Partial<CepRangeValue>) {
		commit(rows.map((r) => (r.uiId === uiId ? { ...r, ...patch } : r)));
	}

	function addRow() {
		if (rows.length >= MAX_RANGES) {
			return;
		}
		commit([...rows, { uiId: crypto.randomUUID(), from: "", to: "", label: "" }]);
	}

	function removeRow(uiId: string) {
		commit(rows.filter((r) => r.uiId !== uiId));
	}

	return (
		<div className="flex flex-col gap-3">
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma faixa configurada. A filial não será sugerida por CEP.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{rows.map((row) => (
						<li
							className="flex flex-col gap-2 rounded-md border border-border p-3"
							key={row.uiId}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`cep-label-${row.uiId}`}>Rótulo (opcional)</Label>
								<Input
									disabled={disabled}
									id={`cep-label-${row.uiId}`}
									onChange={(e) => patchRow(row.uiId, { label: e.target.value })}
									placeholder="Ex.: SP capital zona oeste"
									value={row.label ?? ""}
								/>
							</div>
							<div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`cep-from-${row.uiId}`}>De</Label>
									<MaskedInput
										disabled={disabled}
										id={`cep-from-${row.uiId}`}
										mask={cepMask}
										onChange={(v) => patchRow(row.uiId, { from: v ?? "" })}
										value={row.from}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`cep-to-${row.uiId}`}>Até</Label>
									<MaskedInput
										disabled={disabled}
										id={`cep-to-${row.uiId}`}
										mask={cepMask}
										onChange={(v) => patchRow(row.uiId, { to: v ?? "" })}
										value={row.to}
									/>
								</div>
								<Button
									aria-label="Remover faixa"
									disabled={disabled}
									onClick={() => removeRow(row.uiId)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			<Button
				className="self-start"
				disabled={disabled || rows.length >= MAX_RANGES}
				onClick={addRow}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus className="size-4" /> Adicionar faixa
			</Button>
		</div>
	);
}
```

- [ ] **Step 2: Type-check**

Run: `bun check-types`
Expected: PASS.

> Sem teste unitário aqui — o repo não tem setup de RTL/testing-library. Verificação é visual (Task 8) + os refines do schema (Task 4) cobrem a lógica de validação. `crypto.randomUUID()` é o padrão do repo pra IDs (CLAUDE.md).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx
git commit -m "feat(branches): componente repeater de faixas de CEP"
```

---

### Task 6: Ligar o editor ao form da filial

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`

- [ ] **Step 1: Adicionar a seção no `branch-form-fields.tsx`**

Importar o editor no topo (junto aos imports de componentes locais):

```tsx
import { CepRangesEditor } from "./cep-ranges-editor";
```

Adicionar a seção entre a seção "Endereço" (`</section>`) e a seção "Equipe":

```tsx
				{/* Faixas de CEP */}
				<section className="flex flex-col gap-3">
					<SectionHeader>Faixas de CEP atendidas</SectionHeader>
					<p className="text-muted-foreground text-xs">
						Sugestão de qual filial atende cada região. Não restringe pedidos —
						todos chegam para todas as filiais.
					</p>
					<CepRangesEditor
						disabled={disabled}
						onChange={(next) => onPatch({ cepRanges: next })}
						value={values.cepRanges ?? []}
					/>
				</section>
```

- [ ] **Step 2: Mapear `cepRanges` no `buildInitial` e nos `FIELD_LABELS`**

Em `branch-form.tsx`, no objeto retornado por `buildInitial` (após `responsibleUserId`), adicionar:

```ts
		cepRanges: d.cepRanges ?? [],
```

E no `FIELD_LABELS` (após `state: "UF"`), adicionar:

```ts
	cepRanges: "Faixas de CEP",
```

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: PASS. (`BranchFormValues.cepRanges` já existe via `branchSchema`; `values.cepRanges` pode ser `null` — por isso o `?? []` no editor.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx apps/web/src/app/dashboard/branches/_components/branch-form.tsx
git commit -m "feat(branches): seção de faixas de CEP no form da filial"
```

---

### Task 7: Exibição read-only na overview-tab + alinhar tipo `BranchDetail`

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/data.ts:81`
- Modify: `apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx`

- [ ] **Step 1: Alinhar o tipo `BranchDetail.cepRanges`**

Em `data.ts`, na interface `BranchDetail`, trocar:

```ts
	cepRanges: Array<{ from: string; to: string }> | null;
```

por:

```ts
	cepRanges: Array<{ from: string; to: string; label?: string }> | null;
```

- [ ] **Step 2: Renderizar as faixas na overview-tab**

Em `overview-tab.tsx`, dentro do `<dl>`, após o bloco `Endereço` (o `<div>` que fecha em ~linha 98), adicionar um item condicional:

```tsx
							{detail.cepRanges && detail.cepRanges.length > 0 ? (
								<div className="sm:col-span-2">
									<dt className="text-muted-foreground text-xs uppercase tracking-wide">
										Faixas de CEP atendidas
									</dt>
									<dd className="mt-1 flex flex-col gap-0.5 text-sm">
										{detail.cepRanges.map((range) => {
											const from = formatCep(range.from);
											const to = formatCep(range.to);
											return (
												<span key={`${range.from}-${range.to}`}>
													{range.label ? `${range.label}: ` : ""}
													{from} a {to}
												</span>
											);
										})}
									</dd>
								</div>
							) : null}
```

> `formatCep` já está importado no arquivo (`@/lib/format/branch`). `key` usa `from-to` (estável, sem index).

- [ ] **Step 3: Type-check**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/branches/data.ts apps/web/src/app/dashboard/branches/[id]/_components/overview-tab.tsx
git commit -m "feat(branches): exibe faixas de CEP na overview da filial"
```

---

### Task 8: Documentar o contrato + smoke run-time

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Documentar o contrato de `cep_ranges`**

Em `docs/integration/admin-ecommerce.md`, adicionar uma subseção (após a tabela de ownership de tabelas) descrevendo:

```markdown
## Faixas de CEP por filial (`branch.cep_ranges`)

`branch.cep_ranges` (jsonb) é `Array<{ from: string; to: string; label?: string }>` — CEPs em **8 dígitos** (sem máscara). Editado só no dashboard (form da filial).

Helper compartilhado em `@emach/db/queries/branch-cep`:
- `matchBranchByCep(cep, branches)` — função pura, **primeira filial** (na ordem) cuja faixa cobre o CEP vence.
- `getBranchByCep(db, cep)` — consulta filiais `active` com faixas e roda o match.

**Semântica:** sugestão **não-autoritativa**. Hoje não há roteamento automático — todo pedido chega para todas as filiais e a primeira que o assume fica com ele. O ecommerce **pode** usar `getBranchByCep` pra sugerir filial, sem obrigatoriedade. Sobreposição entre filiais é permitida (resolvida por first-match-wins).
```

- [ ] **Step 2: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(integration): contrato de cep_ranges e getBranchByCep"
```

- [ ] **Step 3: Smoke run-time (manual, com o usuário)**

> Há dev server servindo este checkout na porta 3005 (verificado nesta sessão via `ss -ltnp` + `readlink /proc/<pid>/cwd`). Se não houver, subir com `cd apps/web && bun run next dev --port 3005`.

Verificar no browser (`claude-in-chrome`, perfil "Notbook"):
1. `/dashboard/branches/<id>/edit` (ou o sheet de edição) → seção "Faixas de CEP atendidas" aparece; adicionar 2 faixas com rótulo; remover uma; salvar.
2. Reabrir a filial → faixas persistidas (round-trip pelo `buildInitial`).
3. Tentar salvar `from > to` ou faixas sobrepostas → `FormErrorPanel` no topo lista o erro; não salva.
4. Overview-tab da filial → faixas exibidas (rótulo + intervalo formatado).
5. Em um pedido pendente com CEP de cliente → a sugestão de filial no `order-actions-panel` continua funcionando (regressão do refactor da Task 3).

- [ ] **Step 4: Rodar a suíte completa**

Run: `cd apps/web && bun run test` e `cd packages/db && bun run test`
Expected: novos testes passam; 1 fail pré-existente em `apps/web` (`activity.test.ts` — `server-only`), não-regressão.

---

## Verificação final (após todas as tasks)

- `bun check-types` verde no monorepo.
- Testes novos passam (`branch-cep`, `branch-schema`); fail pré-existente do `server-only` inalterado.
- Smoke admin completo (Task 8 Step 3).
- PR dispara CI de sync pro ecommerce (mudança em `packages/db/src/{schema,queries}`).
- `bun db:sync` **não** rodado (mudança é só de tipo TS sobre jsonb — sem diff estrutural).

## Notas de execução

- **Não rodar `bun db:sync`** em nenhuma task — não há mudança estrutural.
- A server action (`branches/actions.ts`) **já persiste** `cepRanges` via `normalizePayload` — não precisa de mudança.
- Ordem das tasks importa: Task 1 (tipo) antes da Task 7 (alinha `data.ts`); Task 2 (helper) antes da Task 3 (repoint); Task 4 (schema) antes da Task 6 (form usa o tipo).
- Merge do PR (rebase) e fechamento do #76 exigem aprovação explícita do usuário.

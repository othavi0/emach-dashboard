# Barcode no perfil da ferramenta + Especificações ficha técnica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o código de barras (EAN-13 por variante) visível e escaneável no perfil da ferramenta, com dados mocados realistas, e reescrever a seção Especificações como ficha técnica com leader pontilhado.

**Architecture:** Encoder EAN-13 puro em `apps/web/src/lib` + componente SVG server-safe consumido por um card novo na Visão geral e por um popover na aba Variantes. Dados corrigidos por UPDATE mapeado (17 linhas) + seed + check no verify. `ToolSpecs` reescrito sobre helpers puros testáveis (partição preenchido/vazio).

**Tech Stack:** Next 16 / React 19 (React Compiler ativo), Drizzle, vitest (`environment: node` — só lógica pura tem teste unit; UI é smoke visual), base-ui Popover via `@emach/ui`, Biome/ultracite.

**Spec:** `docs/superpowers/specs/2026-07-16-tool-barcode-especificacoes-design.md`

## Global Constraints

- **⛔ Banco Supabase ÚNICO e COMPARTILHADO (dev = prod = ecommerce).** Permitido NESTE plano: exclusivamente o UPDATE mapeado de 17 linhas da Task 2 (dado seed descartável). PROIBIDO sem autorização explícita do user na sessão: `seed`/`truncate`/`drop`/reset/`db:push` destrutivo. Nenhuma mudança de schema neste plano (zero `db:sync`).
- CWD é a **RAIZ** do monorepo (turbo/bun) — nunca `cd apps/web`; paths absolutos. Testes: `bun --cwd apps/web test`.
- Proibido: `console.*` (usar `logger` de `apps/web/src/lib/logger.ts` — neste plano nem deve ser necessário), `: any`/`as any`/`@ts-ignore`, `React.forwardRef`, `useMemo`/`useCallback` manuais, `key={index}` em `.map()` (IDs estáveis), barrel files.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com `string not found`, re-Read o arquivo antes de re-tentar.
- Commits: Conventional Commits em PT, subject ≤50 chars, **zero atribuição de AI** (sem "Generated with", sem Co-Authored-By).
- Gate por task: `bun check-types` + `bun check` verdes antes de cada commit. Gate final: `bun verify`.
- Read cada arquivo antes de Edit; após retorno de outro agente, re-Read.

---

### Task 1: Encoder EAN-13 puro (`ean13.ts`)

**Files:**
- Create: `apps/web/src/lib/ean13.ts`
- Test: `apps/web/src/lib/__tests__/ean13.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha, sem imports de projeto).
- Produces (Tasks 3/4/5 dependem):
  - `isValidEan13(code: string): boolean`
  - `ean13Modules(code: string): string` — 95 chars `0`/`1`; lança `Error` se inválido
  - `ean13Bars(code: string): { x: number; w: number }[]` — barras (runs de 1s) para SVG; lança se inválido

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/ean13.test.ts
import { describe, expect, it } from "vitest";
import { ean13Bars, ean13Modules, isValidEan13 } from "../ean13";

describe("isValidEan13", () => {
	it("aceita EAN-13 com dígito verificador correto", () => {
		// dígitos 1-12 = 789123450102; soma ponderada 1/3 → check 8
		expect(isValidEan13("7891234501028")).toBe(true);
		expect(isValidEan13("7891234501011")).toBe(true);
	});

	it("rejeita dígito verificador errado", () => {
		expect(isValidEan13("7891234501029")).toBe(false);
	});

	it("rejeita formato não-numérico ou de outro tamanho", () => {
		expect(isValidEan13("GSS280AVE-127")).toBe(false);
		expect(isValidEan13("789123450102")).toBe(false);
		expect(isValidEan13("78912345010288")).toBe(false);
		expect(isValidEan13("")).toBe(false);
	});
});

describe("ean13Modules", () => {
	it("produz 95 módulos com guards nas posições canônicas", () => {
		const m = ean13Modules("7891234501028");
		expect(m).toHaveLength(95);
		expect(m.slice(0, 3)).toBe("101"); // guard esquerda
		expect(m.slice(45, 50)).toBe("01010"); // guard central
		expect(m.slice(92)).toBe("101"); // guard direita
	});

	it("codifica o 2º dígito com paridade L do prefixo 7 (LGLGLG)", () => {
		// 1º dígito 7 → paridade LGLGLG; 2º dígito 8 em L-code = 0110111
		const m = ean13Modules("7891234501028");
		expect(m.slice(3, 10)).toBe("0110111");
	});

	it("lança para código inválido", () => {
		expect(() => ean13Modules("GSS280AVE-127")).toThrow();
	});
});

describe("ean13Bars", () => {
	it("gera runs contíguos que reconstroem os módulos", () => {
		const code = "7891234501028";
		const modules = ean13Modules(code);
		const bars = ean13Bars(code);
		const rebuilt = Array.from({ length: 95 }, () => "0");
		for (const bar of bars) {
			for (let i = bar.x; i < bar.x + bar.w; i++) {
				rebuilt[i] = "1";
			}
		}
		expect(rebuilt.join("")).toBe(modules);
		// runs não se tocam (senão seriam um run só)
		const sorted = [...bars].sort((a, b) => a.x - b.x);
		for (let i = 1; i < sorted.length; i++) {
			const prev = sorted[i - 1];
			if (prev) {
				expect(sorted[i]?.x).toBeGreaterThan(prev.x + prev.w);
			}
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test src/lib/__tests__/ean13.test.ts`
Expected: FAIL — `Cannot find module '../ean13'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/ean13.ts
// Encoder EAN-13 (ISO/IEC 15420): 95 módulos = guard 101 + 6 dígitos L/G
// (paridade pelo 1º dígito) + guard 01010 + 6 dígitos R + guard 101.

const L_CODES = [
	"0001101",
	"0011001",
	"0010011",
	"0111101",
	"0100011",
	"0110001",
	"0101111",
	"0111011",
	"0110111",
	"0001011",
] as const;

const G_CODES = [
	"0100111",
	"0110011",
	"0011011",
	"0100001",
	"0011101",
	"0111001",
	"0000101",
	"0010001",
	"0001001",
	"0010111",
] as const;

const R_CODES = [
	"1110010",
	"1100110",
	"1101100",
	"1000010",
	"1011100",
	"1001110",
	"1010000",
	"1000100",
	"1001000",
	"1110100",
] as const;

const PARITY_BY_FIRST_DIGIT = [
	"LLLLLL",
	"LLGLGG",
	"LLGGLG",
	"LLGGGL",
	"LGLLGG",
	"LGGLLG",
	"LGGGLL",
	"LGLGLG",
	"LGLGGL",
	"LGGLGL",
] as const;

const EAN13_PATTERN = /^\d{13}$/;

export function isValidEan13(code: string): boolean {
	if (!EAN13_PATTERN.test(code)) {
		return false;
	}
	const digits = Array.from(code, Number);
	let sum = 0;
	for (const [i, d] of digits.slice(0, 12).entries()) {
		sum += d * (i % 2 === 0 ? 1 : 3);
	}
	return (10 - (sum % 10)) % 10 === digits[12];
}

export function ean13Modules(code: string): string {
	if (!isValidEan13(code)) {
		throw new Error(`EAN-13 inválido: ${code}`);
	}
	const digits = Array.from(code, Number);
	const parity = PARITY_BY_FIRST_DIGIT[digits[0] ?? 0] ?? "LLLLLL";
	let bits = "101";
	for (let i = 1; i <= 6; i++) {
		const table = parity[i - 1] === "L" ? L_CODES : G_CODES;
		bits += table[digits[i] ?? 0];
	}
	bits += "01010";
	for (let i = 7; i <= 12; i++) {
		bits += R_CODES[digits[i] ?? 0];
	}
	return `${bits}101`;
}

export interface Ean13Bar {
	x: number;
	w: number;
}

export function ean13Bars(code: string): Ean13Bar[] {
	const modules = ean13Modules(code);
	const bars: Ean13Bar[] = [];
	let start = -1;
	for (let i = 0; i <= modules.length; i++) {
		const on = i < modules.length && modules[i] === "1";
		if (on && start < 0) {
			start = i;
		} else if (!on && start >= 0) {
			bars.push({ x: start, w: i - start });
			start = -1;
		}
	}
	return bars;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test src/lib/__tests__/ean13.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Lint + commit**

```bash
bun check-types && bun check
git add apps/web/src/lib/ean13.ts apps/web/src/lib/__tests__/ean13.test.ts
git commit -m "feat: encoder EAN-13 puro com testes"
```

---

### Task 2: Dados — EAN-13 no banco, no seed e no verify

**Files:**
- Modify: `packages/db/scripts/seed/catalog.ts` (17 literais `barcode:`)
- Modify: `packages/db/scripts/seed/verify.ts` (novo check, junto dos checks de barcode nulo/duplicado em ~linha 135)
- Banco: UPDATE pontual de 17 linhas em `tool_variant` (autorizado pelo spec; sem schema change)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: dados reais EAN-13 que as Tasks 4/5 exibem no smoke. Mapeamento fixo sku→EAN (fonte: spec):

| SKU | EAN-13 |
|---|---|
| `PE-82600-127` | `7891234501011` |
| `GSS280AVE-127` | `7891234501028` |
| `CSA100B-127` | `7891234501035` |
| `MC-27H-UN` | `7891234501042` |
| `AU-8-BC-UN` | `7891234501059` |
| `DC-115-INOX-10-UN` | `7891234501066` |
| `DHP453Z-127` | `7891234501073` |
| `DDF458Z-18V` | `7891234501080` |
| `GKS185S-127` | `7891234501097` |
| `ST8000E-127` | `7891234501103` |
| `GWS720-115-BIV` | `7891234501110` |
| `DHP453Z-220` | `7891234501127` |
| `ST8000E-220` | `7891234501134` |
| `GSS280AVE-220` | `7891234501141` |
| `GKS185S-220` | `7891234501158` |
| `CSA100B-220` | `7891234501165` |
| `GKS185S-BIV` | `7891234501172` |

- [ ] **Step 1: Atualizar os 17 `barcode:` do seed**

Em `packages/db/scripts/seed/catalog.ts`, cada variante tem `barcode: "<sku>"` (ex.: linha ~575 `barcode: "DHP453Z-127"`). Trocar o valor pelo EAN da tabela acima — o `sku:` da mesma variante identifica qual linha é. Exemplo do diff em uma variante:

```ts
// antes
				sku: "DHP453Z-127",
				barcode: "DHP453Z-127",
// depois
				sku: "DHP453Z-127",
				barcode: "7891234501073",
```

- [ ] **Step 2: Verificar que nenhum barcode não-EAN sobrou no seed**

Run: `rg -n 'barcode: "' packages/db/scripts/seed/catalog.ts | rg -v '"789'`
Expected: saída vazia (todos os 17 valores começam com 789; a linha ~513 `barcode: string;` é tipo, não valor, e não casa com o padrão).

- [ ] **Step 3: Adicionar check EAN-13 no verify**

Em `packages/db/scripts/seed/verify.ts`, logo após o check `"barcodes duplicados em tool_variant"` (~linha 139), adicionar um item com o MESMO shape dos vizinhos (name + query que retorna `n` esperado 0):

```ts
	{
		name: "tool_variant com barcode fora do formato EAN-13",
		query: "SELECT count(*) AS n FROM tool_variant WHERE barcode !~ '^[0-9]{13}$'",
	},
```

- [ ] **Step 4: UPDATE mapeado no banco (17 linhas — única escrita autorizada)**

```bash
set -a; . apps/web/.env; set +a; psql "$DATABASE_URL" <<'SQL'
UPDATE tool_variant v SET barcode = m.ean
FROM (VALUES
  ('PE-82600-127','7891234501011'),
  ('GSS280AVE-127','7891234501028'),
  ('CSA100B-127','7891234501035'),
  ('MC-27H-UN','7891234501042'),
  ('AU-8-BC-UN','7891234501059'),
  ('DC-115-INOX-10-UN','7891234501066'),
  ('DHP453Z-127','7891234501073'),
  ('DDF458Z-18V','7891234501080'),
  ('GKS185S-127','7891234501097'),
  ('ST8000E-127','7891234501103'),
  ('GWS720-115-BIV','7891234501110'),
  ('DHP453Z-220','7891234501127'),
  ('ST8000E-220','7891234501134'),
  ('GSS280AVE-220','7891234501141'),
  ('GKS185S-220','7891234501158'),
  ('CSA100B-220','7891234501165'),
  ('GKS185S-BIV','7891234501172')
) AS m(sku, ean)
WHERE v.sku = m.sku;
SQL
```

Expected: `UPDATE 17`.

- [ ] **Step 5: Verificar o dado no banco**

```bash
set -a; . apps/web/.env; set +a; psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE barcode ~ '^[0-9]{13}$') AS ean_ok, count(DISTINCT barcode) AS distintos, count(*) AS total FROM tool_variant;"
```

Expected: `ean_ok = 17`, `distintos = 17`, `total = 17`.

- [ ] **Step 6: Lint + commit**

```bash
bun check-types && bun check
git add packages/db/scripts/seed/catalog.ts packages/db/scripts/seed/verify.ts
git commit -m "chore: barcodes do seed viram EAN-13 realistas"
```

---

### Task 3: Componentes base — `BarcodeEan13` + `CopyButton` compartilhado

**Files:**
- Create: `apps/web/src/components/barcode-ean13.tsx`
- Create: `apps/web/src/components/copy-button.tsx`
- Modify: consumidores de `CopyCodeButton` (localizar com `rg -l "CopyCodeButton" apps/web/src`)
- Delete: `apps/web/src/app/dashboard/promotions/_components/copy-code-button.tsx`

**Interfaces:**
- Consumes: `isValidEan13`, `ean13Bars` (Task 1).
- Produces (Tasks 4/5 dependem):
  - `BarcodeEan13({ code, height?, className? }: { code: string; height?: number; className?: string })` — SVG das barras; **retorna `null` se `!isValidEan13(code)`** (o consumidor sempre renderiza o número em mono por conta própria).
  - `CopyButton({ value, label? }: { value: string; label?: string })` — client component; copia `value`, toast "Código copiado", `aria-label` = `Copiar ${label ?? value}`.

- [ ] **Step 1: Criar `BarcodeEan13` (server-safe, sem estado)**

```tsx
// apps/web/src/components/barcode-ean13.tsx
import { ean13Bars, isValidEan13 } from "@/lib/ean13";

interface BarcodeEan13Props {
	className?: string;
	code: string;
	height?: number;
}

/**
 * Barras EAN-13 em SVG (95 módulos de largura lógica). Retorna null para
 * código fora do formato — o consumidor exibe o número em mono sem barras.
 */
export function BarcodeEan13({
	code,
	height = 40,
	className,
}: BarcodeEan13Props) {
	if (!isValidEan13(code)) {
		return null;
	}
	return (
		<svg
			aria-label={`Código de barras ${code}`}
			className={className}
			height={height}
			preserveAspectRatio="none"
			role="img"
			viewBox={`0 0 95 ${height}`}
			width="100%"
		>
			{ean13Bars(code).map((bar) => (
				<rect
					className="fill-foreground"
					height={height}
					key={bar.x}
					width={bar.w}
					x={bar.x}
					y={0}
				/>
			))}
		</svg>
	);
}
```

- [ ] **Step 2: Criar `CopyButton` compartilhado (generalização do CopyCodeButton de promotions)**

```tsx
// apps/web/src/components/copy-button.tsx
"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { notify } from "@/lib/notify";

interface CopyButtonProps {
	label?: string;
	value: string;
}

export function CopyButton({ value, label }: CopyButtonProps) {
	const [copied, setCopied] = useState(false);

	async function handleCopy(event: React.MouseEvent<HTMLButtonElement>) {
		event.stopPropagation();
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			notify.success("Código copiado");
			setTimeout(() => setCopied(false), 1500);
		} catch {
			notify.error("Não foi possível copiar");
		}
	}

	return (
		<button
			aria-label={`Copiar ${label ?? value}`}
			className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			onClick={handleCopy}
			type="button"
		>
			{copied ? (
				<Check aria-hidden className="size-3.5" />
			) : (
				<Copy aria-hidden className="size-3.5" />
			)}
		</button>
	);
}
```

- [ ] **Step 3: Migrar consumidores e deletar o antigo**

Localizar: `rg -n "CopyCodeButton" apps/web/src`. Em cada consumidor, trocar:

```tsx
// antes
import { CopyCodeButton } from "./copy-code-button"; // (ou path relativo equivalente)
<CopyCodeButton code={promo.code} />
// depois
import { CopyButton } from "@/components/copy-button";
<CopyButton label={`código ${promo.code}`} value={promo.code} />
```

Depois: `rm apps/web/src/app/dashboard/promotions/_components/copy-code-button.tsx` e confirmar `rg -n "CopyCodeButton" apps/web/src` → vazio. **Sem re-export shim.**

- [ ] **Step 4: Gate + commit**

```bash
bun check-types && bun check && bun --cwd apps/web test
git add -A apps/web/src
git commit -m "feat: BarcodeEan13 SVG e CopyButton compartilhado"
```

---

### Task 4: Card "Códigos de barras" na Visão geral

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/barcodes-card.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx` (prop nova + card entre Estoque e Carrinho)
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx:66-74` (passar `variants` ao `OverviewTab`)

**Interfaces:**
- Consumes: `BarcodeEan13`, `CopyButton` (Task 3); tipo `ToolDetailVariant` de `../_lib/tool-detail-data` (já contém `id`, `sku`, `barcode`, `voltage`, ordenado por `sortOrder` no `getToolDetail`).
- Produces: `BarcodesCard({ variants }: { variants: ToolDetailVariant[] })` — Server Component.

- [ ] **Step 1: Criar o card**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/barcodes-card.tsx
import { Badge } from "@emach/ui/components/badge";
import { BarcodeEan13 } from "@/components/barcode-ean13";
import { CopyButton } from "@/components/copy-button";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";
import { SectionCard } from "./section-card";

export function BarcodesCard({ variants }: { variants: ToolDetailVariant[] }) {
	return (
		<SectionCard title="Códigos de barras">
			<ul className="flex flex-col">
				{variants.map((v, index) => (
					<li
						className={
							index > 0 ? "mt-3 border-border/60 border-t pt-3" : undefined
						}
						key={v.id}
					>
						<div className="mb-1 flex items-center justify-between gap-2">
							{v.voltage ? (
								<Badge variant="secondary">{v.voltage}</Badge>
							) : (
								<span aria-hidden />
							)}
							<span className="font-mono text-[10px] text-muted-foreground">
								{v.sku}
							</span>
						</div>
						<BarcodeEan13 code={v.barcode} height={36} />
						<div className="mt-1 flex items-center justify-between gap-2">
							<span className="font-mono text-xs">{v.barcode}</span>
							<CopyButton label={`código de barras ${v.barcode}`} value={v.barcode} />
						</div>
					</li>
				))}
			</ul>
		</SectionCard>
	);
}
```

Nota: se `Badge` não existir em `@emach/ui/components/badge`, verificar o import usado em `variants-tab.tsx` (mesma pasta) e copiar o caminho de lá.

- [ ] **Step 2: Prop nova no OverviewTab + card na sidebar**

Em `overview-tab.tsx`:

```tsx
// imports: adicionar
import type { ToolDetailVariant } from "../_lib/tool-detail-data";
import { BarcodesCard } from "./barcodes-card";

// interface OverviewTabProps: adicionar
	variants: ToolDetailVariant[];

// assinatura: adicionar variants à desestruturação
export function OverviewTab({ tool, images, categories, attributes, stockSummary, cartSummary, variants }: OverviewTabProps) {
```

E na coluna lateral, **logo após** o fechamento do `<SectionCard title="Estoque">…</SectionCard>` (antes do card "Carrinho (ecommerce)"):

```tsx
					<BarcodesCard variants={variants} />
```

- [ ] **Step 3: Passar variants no page.tsx**

Em `page.tsx`, no `<OverviewTab …>` (linhas 66-74), adicionar:

```tsx
					variants={detail.variants}
```

- [ ] **Step 4: Gate + smoke visual**

```bash
bun check-types && bun check
```

Com o dev server rodando (porta 3008 desta sessão, ou `bun dev:web`), abrir `http://localhost:3008/dashboard/tools/c34d8e82-9e47-4710-97e2-956f07955c2e`:
- Card "Códigos de barras" entre Estoque e Carrinho, com **2 linhas** (127V e 220V), barras SVG renderizadas, números `7891234501028` / `7891234501141`, botão copiar funcional (toast).
- Screenshot lado a lado com o card Estoque (mesmo vocabulário visual de SectionCard).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "feat: card de códigos de barras na visão geral"
```

---

### Task 5: Popover com barcode grande na aba Variantes

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/barcode-popover.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx` (célula do barcode nos dois modos: EditableRow ~linhas 308-314, ReadOnlyRow ~linha 417)

**Interfaces:**
- Consumes: `BarcodeEan13`, `CopyButton` (Task 3); `Popover/PopoverTrigger/PopoverContent` de `@emach/ui/components/popover` (base-ui, trigger aceita `render={…}`).
- Produces: `BarcodePopover({ barcode, trigger }: { barcode: string; trigger?: "text" | "icon" })` — client component (o arquivo `variants-tab.tsx` já é client).

- [ ] **Step 1: Criar o popover**

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/barcode-popover.tsx
"use client";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { Barcode } from "lucide-react";
import { BarcodeEan13 } from "@/components/barcode-ean13";
import { CopyButton } from "@/components/copy-button";
import { isValidEan13 } from "@/lib/ean13";

interface BarcodePopoverProps {
	barcode: string;
	trigger?: "text" | "icon";
}

export function BarcodePopover({
	barcode,
	trigger = "text",
}: BarcodePopoverProps) {
	return (
		<Popover>
			{trigger === "text" ? (
				<PopoverTrigger
					render={
						<button
							className="cursor-pointer font-mono text-xs underline decoration-border decoration-dotted underline-offset-4 hover:decoration-foreground"
							type="button"
						>
							{barcode}
						</button>
					}
				/>
			) : (
				<PopoverTrigger
					render={
						<button
							aria-label={`Ver código de barras ${barcode}`}
							className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							type="button"
						>
							<Barcode aria-hidden className="size-3.5" />
						</button>
					}
				/>
			)}
			<PopoverContent className="w-auto">
				<div className="flex flex-col items-center gap-2 p-1.5">
					<BarcodeEan13 className="w-60" code={barcode} height={64} />
					{!isValidEan13(barcode) && (
						<p className="text-muted-foreground text-xs">
							Formato fora do padrão EAN-13
						</p>
					)}
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm">{barcode}</span>
						<CopyButton label={`código de barras ${barcode}`} value={barcode} />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
```

- [ ] **Step 2: Usar no ReadOnlyRow**

Em `variants-tab.tsx` (~linha 417), trocar:

```tsx
// antes
			<TableCell className="font-mono text-xs">{v.barcode}</TableCell>
// depois
			<TableCell className="font-mono text-xs">
				<BarcodePopover barcode={v.barcode} />
			</TableCell>
```

(adicionar `import { BarcodePopover } from "./barcode-popover";` no topo.)

- [ ] **Step 3: Usar no EditableRow**

Na célula do input de barcode (~linhas 308-314), trocar:

```tsx
// antes
			<TableCell>
				<Input
					className="h-8 w-[160px] font-mono text-xs"
					onChange={(e) => setState({ ...state, barcode: e.target.value })}
					value={state.barcode}
				/>
			</TableCell>
// depois
			<TableCell>
				<div className="flex items-center gap-1.5">
					<Input
						className="h-8 w-[160px] font-mono text-xs"
						onChange={(e) => setState({ ...state, barcode: e.target.value })}
						value={state.barcode}
					/>
					{/* Popover mostra o valor SALVO (variant.barcode), não o rascunho do input */}
					<BarcodePopover barcode={variant.barcode} trigger="icon" />
				</div>
			</TableCell>
```

- [ ] **Step 4: Gate + smoke visual**

```bash
bun check-types && bun check
```

Em `http://localhost:3008/dashboard/tools/c34d8e82-9e47-4710-97e2-956f07955c2e?tab=variantes` (super_admin vê o modo editável):
- Ícone de barcode ao lado do input abre popover com barras grandes + número + copiar; fecha em Esc/clique fora.
- Verificar o modo read-only: o padrão canônico é conferir com um usuário sem `tools.update`; na prática, smoke rápido = checar que `ReadOnlyRow` renderiza `BarcodePopover` (código) e que o popover funciona no modo editável (mesmo componente).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "feat: popover de barcode na aba variantes"
```

---

### Task 6: Especificações — ficha técnica com leader pontilhado

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_lib/spec-rows.ts`
- Test: `apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-rows.test.ts`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx` (reescrita da renderização; `SpecSection`/`SpecField` atuais somem)

**Interfaces:**
- Consumes: `ToolDetailRow`, `ToolDetailAttribute` (`_lib/tool-detail-data`), `AttributeGroup` (`_lib/attribute-grouping`), `SpecDivergences` (`_lib/spec-divergence`), `AttributeValue`, `HelpTooltip`, `DivergenceMark` (mantido em `tool-specs.tsx`), `formatMeasure` (`@/lib/format/number`).
- Produces (helpers puros; os tipos `Pick<>` estreitos existem para testar sem `as any` — `any` é P0 banido):
  - `interface SpecCandidate { key: string; label: string; mono?: boolean; value: string | null }`
  - `partitionRows(candidates: SpecCandidate[]): { rows: SpecCandidate[]; emptyLabels: string[]; total: number }` — `rows` só com `value !== null`
  - `type PhysicalSpecSource = Pick<ToolDetailRow, "model" | "invoiceModel" | "manufacturerName" | "powerWatts" | "weightKg" | "lengthCm" | "widthCm" | "heightCm">`
  - `physicalCandidates(tool: PhysicalSpecSource): SpecCandidate[]` — Modelo (mono), Modelo NF (mono), Fabricante, Potência, Peso, Dimensões
  - `type FiscalSpecSource = Pick<ToolDetailRow, "hsCode" | "ncm" | "cest">`
  - `fiscalCandidates(tool: FiscalSpecSource): SpecCandidate[]` — HS Code, NCM, CEST (todos mono)
  - `isAttributeFilled(attr: ToolDetailAttribute): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/dashboard/tools/[id]/_lib/__tests__/spec-rows.test.ts
import { describe, expect, it } from "vitest";
import type { ToolDetailAttribute } from "../tool-detail-data";
import {
	fiscalCandidates,
	isAttributeFilled,
	partitionRows,
	physicalCandidates,
	type PhysicalSpecSource,
} from "../spec-rows";

function attr(over: Partial<ToolDetailAttribute>): ToolDetailAttribute {
	const base: ToolDetailAttribute = {
		slug: "x",
		label: "X",
		inputType: "text",
		unit: null,
		options: null,
		sortOrder: 0,
		sourceCategoryId: "c",
		sourceCategoryName: "Cat",
		sourceCategoryDepth: 0,
		valueText: null,
		valueNumeric: null,
		valueNumericMax: null,
		valueBool: null,
	};
	return { ...base, ...over };
}
// Nota: se ToolDetailAttribute tiver campos além destes, completar o base —
// nunca resolver com `as`/`any` (P0 banido). Mesmo princípio nos fixtures abaixo.

describe("partitionRows", () => {
	it("separa preenchidos de vazios preservando ordem e total", () => {
		const result = partitionRows([
			{ key: "a", label: "A", value: "1" },
			{ key: "b", label: "B", value: null },
			{ key: "c", label: "C", value: "3" },
		]);
		expect(result.rows.map((r) => r.key)).toEqual(["a", "c"]);
		expect(result.emptyLabels).toEqual(["B"]);
		expect(result.total).toBe(3);
	});
});

describe("physicalCandidates", () => {
	const base: PhysicalSpecSource = {
		model: "GSS280AVE",
		invoiceModel: null,
		manufacturerName: "Bosch",
		powerWatts: 300,
		weightKg: "1.4",
		lengthCm: "66.13",
		widthCm: "25.65",
		heightCm: "16.79",
	};

	it("formata potência, peso e dimensões preenchidos", () => {
		const rows = physicalCandidates(base);
		const byKey = new Map(rows.map((r) => [r.key, r]));
		expect(byKey.get("powerWatts")?.value).toBe("300 W");
		expect(byKey.get("weightKg")?.value).toBe("1,4 kg");
		expect(byKey.get("dimensions")?.value).toBe("66,13 × 25,65 × 16,79 cm");
		expect(byKey.get("model")?.mono).toBe(true);
		expect(byKey.get("invoiceModel")?.value).toBeNull();
	});

	it("dimensões incompletas contam como vazio", () => {
		const rows = physicalCandidates({ ...base, widthCm: null });
		expect(rows.find((r) => r.key === "dimensions")?.value).toBeNull();
	});
});

describe("fiscalCandidates", () => {
	it("todos os códigos fiscais são mono", () => {
		const rows = fiscalCandidates({
			hsCode: "846729",
			ncm: "84672900",
			cest: null,
		});
		expect(rows.every((r) => r.mono)).toBe(true);
		expect(rows.find((r) => r.key === "cest")?.value).toBeNull();
	});
});

describe("isAttributeFilled", () => {
	it("text: preenchido = não-vazio após trim", () => {
		expect(isAttributeFilled(attr({ valueText: "abc" }))).toBe(true);
		expect(isAttributeFilled(attr({ valueText: "  " }))).toBe(false);
		expect(isAttributeFilled(attr({ valueText: null }))).toBe(false);
	});

	it("boolean: null = vazio, false = preenchido", () => {
		expect(isAttributeFilled(attr({ inputType: "boolean", valueBool: false }))).toBe(true);
		expect(isAttributeFilled(attr({ inputType: "boolean" }))).toBe(false);
	});

	it("number e numeric_range", () => {
		expect(isAttributeFilled(attr({ inputType: "number", valueNumeric: 0 }))).toBe(true);
		expect(isAttributeFilled(attr({ inputType: "number" }))).toBe(false);
		expect(isAttributeFilled(attr({ inputType: "numeric_range", valueNumericMax: 5 }))).toBe(true);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test src/app/dashboard/tools/\[id\]/_lib/__tests__/spec-rows.test.ts`
Expected: FAIL — módulo `../spec-rows` inexistente.

- [ ] **Step 3: Implementar os helpers**

```ts
// apps/web/src/app/dashboard/tools/[id]/_lib/spec-rows.ts
import { formatMeasure } from "@/lib/format/number";
import type { ToolDetailAttribute, ToolDetailRow } from "./tool-detail-data";

export interface SpecCandidate {
	key: string;
	label: string;
	mono?: boolean;
	value: string | null;
}

export interface PartitionedRows {
	emptyLabels: string[];
	rows: SpecCandidate[];
	total: number;
}

export function partitionRows(candidates: SpecCandidate[]): PartitionedRows {
	const rows: SpecCandidate[] = [];
	const emptyLabels: string[] = [];
	for (const c of candidates) {
		if (c.value === null) {
			emptyLabels.push(c.label);
		} else {
			rows.push(c);
		}
	}
	return { rows, emptyLabels, total: candidates.length };
}

export type PhysicalSpecSource = Pick<
	ToolDetailRow,
	| "model"
	| "invoiceModel"
	| "manufacturerName"
	| "powerWatts"
	| "weightKg"
	| "lengthCm"
	| "widthCm"
	| "heightCm"
>;

export function physicalCandidates(tool: PhysicalSpecSource): SpecCandidate[] {
	const dimensions =
		tool.lengthCm !== null && tool.widthCm !== null && tool.heightCm !== null
			? `${formatMeasure(tool.lengthCm, 2) ?? "?"} × ${formatMeasure(tool.widthCm, 2) ?? "?"} × ${formatMeasure(tool.heightCm, 2) ?? "?"} cm`
			: null;
	return [
		{ key: "model", label: "Modelo", mono: true, value: tool.model },
		{
			key: "invoiceModel",
			label: "Modelo NF",
			mono: true,
			value: tool.invoiceModel,
		},
		{ key: "manufacturer", label: "Fabricante", value: tool.manufacturerName },
		{
			key: "powerWatts",
			label: "Potência",
			value: tool.powerWatts === null ? null : `${tool.powerWatts} W`,
		},
		{
			key: "weightKg",
			label: "Peso",
			value:
				tool.weightKg === null
					? null
					: `${formatMeasure(tool.weightKg) ?? "—"} kg`,
		},
		{ key: "dimensions", label: "Dimensões", value: dimensions },
	];
}

export type FiscalSpecSource = Pick<ToolDetailRow, "hsCode" | "ncm" | "cest">;

export function fiscalCandidates(tool: FiscalSpecSource): SpecCandidate[] {
	return [
		{ key: "hsCode", label: "HS Code", mono: true, value: tool.hsCode },
		{ key: "ncm", label: "NCM", mono: true, value: tool.ncm },
		{ key: "cest", label: "CEST", mono: true, value: tool.cest },
	];
}

export function isAttributeFilled(attr: ToolDetailAttribute): boolean {
	switch (attr.inputType) {
		case "boolean":
			return attr.valueBool !== null;
		case "number":
			return attr.valueNumeric !== null;
		case "numeric_range":
			return attr.valueNumeric !== null || attr.valueNumericMax !== null;
		default:
			return (attr.valueText ?? "").trim() !== "";
	}
}
```

Nota: conferir os nomes reais das colunas em `ToolDetailRow` (é o row inteiro de `tool` — `model`, `invoiceModel`, `manufacturerName`, `powerWatts`, `weightKg`, `lengthCm`, `widthCm`, `heightCm`, `hsCode`, `ncm`, `cest`; a renderização atual de `tool-specs.tsx` usa exatamente esses). Se `manufacturerName` divergir (ex.: vem de join), copiar o acesso usado hoje em `tool-specs.tsx:50`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test src/app/dashboard/tools/\[id\]/_lib/__tests__/spec-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Reescrever a renderização de `tool-specs.tsx`**

Substituir o conteúdo do componente (mantendo `DivergenceMark` e os imports de tooltip/help):

```tsx
// apps/web/src/app/dashboard/tools/[id]/_components/tool-specs.tsx
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { HelpTooltip } from "@/components/help-tooltip";
import { FISCAL_HELP, MODEL_HELP } from "../../_components/fields/spec-help";
import type { AttributeGroup } from "../_lib/attribute-grouping";
import type { SpecDivergences } from "../_lib/spec-divergence";
import {
	fiscalCandidates,
	isAttributeFilled,
	partitionRows,
	physicalCandidates,
} from "../_lib/spec-rows";
import type { ToolDetailRow } from "../_lib/tool-detail-data";
import { AttributeValue } from "./attribute-value";

interface ToolSpecsProps {
	attributeGroups: AttributeGroup[];
	divergences: SpecDivergences;
	tool: ToolDetailRow;
}

/** HelpTooltip por key de campo fixo (mantém as ajudas contextuais atuais). */
function fieldHelp(key: string): ReactNode {
	switch (key) {
		case "model":
			return <HelpTooltip label="Sobre Modelo" text={MODEL_HELP.model} />;
		case "invoiceModel":
			return (
				<HelpTooltip label="Sobre Modelo NF" text={MODEL_HELP.invoiceModel} />
			);
		case "hsCode":
			return <HelpTooltip label="Sobre HS Code" {...FISCAL_HELP.hsCode} />;
		case "ncm":
			return <HelpTooltip label="Sobre NCM" {...FISCAL_HELP.ncm} />;
		case "cest":
			return <HelpTooltip label="Sobre CEST" {...FISCAL_HELP.cest} />;
		default:
			return null;
	}
}

export function ToolSpecs({
	tool,
	attributeGroups,
	divergences,
}: ToolSpecsProps) {
	const fisicas = partitionRows(physicalCandidates(tool));
	const fiscal = partitionRows(fiscalCandidates(tool));

	const attributeSections = attributeGroups.map((group) => {
		const filled = group.attributes.filter(isAttributeFilled);
		return {
			group,
			filled,
			emptyLabels: group.attributes
				.filter((a) => !isAttributeFilled(a))
				.map((a) => a.label),
		};
	});

	const emptyLabels = [
		...fisicas.emptyLabels,
		...attributeSections.flatMap((s) => s.emptyLabels),
		...fiscal.emptyLabels,
	];

	const nothingFilled =
		fisicas.rows.length === 0 &&
		fiscal.rows.length === 0 &&
		attributeSections.every((s) => s.filled.length === 0);

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-5">
				{fisicas.rows.length > 0 && (
					<SpecSection
						filled={fisicas.rows.length}
						title="Físicas"
						total={fisicas.total}
					>
						{fisicas.rows.map((row) => (
							<LeaderRow
								diverges={divergences.fixed.has(row.key)}
								help={fieldHelp(row.key)}
								key={row.key}
								label={row.label}
								mono={row.mono}
							>
								{row.value}
							</LeaderRow>
						))}
					</SpecSection>
				)}

				{attributeSections.map(
					({ group, filled }) =>
						filled.length > 0 && (
							<SpecSection
								filled={filled.length}
								key={group.categoryId}
								title={`Técnicas · ${group.categoryName}`}
								total={group.attributes.length}
							>
								{filled.map((a) => (
									<LeaderRow
										diverges={divergences.attributeSlugs.has(a.slug)}
										key={a.slug}
										label={a.label}
									>
										<AttributeValue attr={a} />
									</LeaderRow>
								))}
							</SpecSection>
						)
				)}

				{fiscal.rows.length > 0 && (
					<SpecSection
						filled={fiscal.rows.length}
						title="Classificação fiscal"
						total={fiscal.total}
					>
						{fiscal.rows.map((row) => (
							<LeaderRow
								help={fieldHelp(row.key)}
								key={row.key}
								label={row.label}
								mono={row.mono}
							>
								{row.value}
							</LeaderRow>
						))}
					</SpecSection>
				)}

				{nothingFilled && (
					<p className="text-muted-foreground text-sm">
						Nenhuma especificação preenchida.
					</p>
				)}

				{emptyLabels.length > 0 && (
					<p className="border-border/60 border-t pt-2.5 text-muted-foreground text-xs">
						{emptyLabels.length === 1
							? "1 campo sem valor"
							: `${emptyLabels.length} campos sem valor`}
						: {emptyLabels.join(", ")}
					</p>
				)}
			</div>
		</TooltipProvider>
	);
}

function SpecSection({
	title,
	filled,
	total,
	children,
}: {
	children: ReactNode;
	filled: number;
	title: string;
	total: number;
}) {
	return (
		<section>
			<h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				{title}
				<span className="ml-1.5 font-normal text-[10px] text-muted-foreground/70 normal-case tracking-normal">
					{filled} de {total}
				</span>
			</h3>
			<dl className="grid gap-x-8 md:grid-cols-2">{children}</dl>
		</section>
	);
}

function LeaderRow({
	label,
	children,
	mono,
	help,
	diverges,
}: {
	children: ReactNode;
	diverges?: boolean;
	help?: ReactNode;
	label: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-2 py-1">
			<dt className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
				{label}
				{help}
				{diverges && <DivergenceMark />}
			</dt>
			<span
				aria-hidden
				className="min-w-4 flex-1 self-center border-border border-b border-dotted"
			/>
			<dd
				className={
					mono
						? "text-right font-mono text-xs"
						: "text-right font-medium text-sm"
				}
			>
				{children}
			</dd>
		</div>
	);
}

function DivergenceMark() {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label="Valor diverge entre cadastro e ficha técnica"
				render={<span className="inline-flex text-warning" />}
			>
				<TriangleAlert aria-hidden className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>
				Valor diverge entre o cadastro (coluna fixa) e a ficha técnica
				(atributo).
			</TooltipContent>
		</Tooltip>
	);
}
```

Notas:
- `divergences.fixed` contém keys `"weightKg"`/`"powerWatts"` — as mesmas keys usadas em `physicalCandidates`, então `divergences.fixed.has(row.key)` liga o ⚠ direto.
- `formatMeasure` sai dos imports de `tool-specs.tsx` (agora vive em `spec-rows.ts`).
- `AttributeValue` nunca renderiza "—" aqui porque só atributos `isAttributeFilled` entram.

- [ ] **Step 6: Gate + smoke visual**

```bash
bun check-types && bun check && bun --cwd apps/web test
```

Em `http://localhost:3008/dashboard/tools/c34d8e82-9e47-4710-97e2-956f07955c2e`:
- Especificações como ficha técnica: linhas com leader pontilhado, 2 colunas em desktop, 1 em viewport estreito (redimensionar).
- Header "Físicas · 5 de 6", nota de rodapé "2 campos sem valor: Modelo NF, CEST".
- Zero "—" no corpo; Modelo/HS/NCM em mono; tooltips ⓘ funcionando; screenshot lado a lado com o estado anterior (comparar densidade/leitura).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools
git commit -m "feat: especificações em ficha técnica pontilhada"
```

---

### Task 7: Gate final — verify completo + smoke das 3 superfícies

**Files:** nenhum novo (correções pontuais se o gate falhar).

- [ ] **Step 1: Suíte completa**

Run: `bun verify` (check-types + check + test, da raiz)
Expected: verde. `check-types` com turbo pode servir cache velho — se algo parecer inconsistente, rodar com `--force`.

- [ ] **Step 2: Smoke perfil da ferramenta (funcional + perceptual + dados)**

`http://localhost:3008/dashboard/tools/c34d8e82-9e47-4710-97e2-956f07955c2e`:
- Visão geral: card Códigos de barras (2 EANs, barras, copiar) + ficha técnica nova. Screenshot.
- Aba Variantes: popover nos dois modos. Coluna mostra `7891234501028`/`7891234501141` (≠ SKU).

- [ ] **Step 3: Smoke separação com EAN real**

Na fila de separação (`/dashboard/separacao`), abrir um pedido em separação com a Lixadeira (ex.: `e6089638-637f-488e-b9ae-7bea5c7ababa` se ainda ativo):
- Chip do item mostra o EAN novo.
- Digitar `7891234501028` no campo de bipe + Enter → conta 1 unidade (matching por barcode OK).
- Digitar o SKU `GSS280AVE-127` → **não** conta (mudança de comportamento intencional documentada no spec).

- [ ] **Step 4: Verificação de dados no banco**

```bash
set -a; . apps/web/.env; set +a; psql "$DATABASE_URL" -c "SELECT count(*) FILTER (WHERE barcode !~ '^[0-9]{13}$') AS fora_do_formato, count(DISTINCT barcode) AS distintos, count(*) AS total FROM tool_variant;"
```

Expected: `fora_do_formato = 0`, `distintos = total = 17`.

- [ ] **Step 5: Commit final (se houve correções)**

```bash
git status --short
# se houver ajustes do gate:
git add -A && git commit -m "fix: ajustes do gate final de barcode/specs"
```

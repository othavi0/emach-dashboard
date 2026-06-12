# Refatoração da tela de promoção — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o input de desconto (% / R$), as datas (permitir hoje + fuso SP), o bloqueio de destaque do home, as toasts de erro e o layout full-width da tela de criação/edição de promoção.

**Architecture:** Componentes novos de input com adorno (`AffixInput` → `DiscountInput`/`MoneyInput`) eliminam o símbolo do texto editável; helpers puros de data em fuso SP corrigem a validação; a action ganha guard de destaque; um wrapper `notify` ajusta a duração das toasts. Sem mudança de schema DB.

**Tech Stack:** Next 16, React 19, Zod 4, Drizzle, base-ui, sonner, vitest (env node), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-12-promotion-form-refactor-design.md`

**Convenções do repo (ler antes de começar):**
- Testes vitest rodam em `environment: node` → **sem jsdom**: componentes React são verificados por **smoke no browser** (`bun dev:web` + rota), não por RTL. Lógica pura (datas, formatação, schema, mensagens) é testada por unit.
- Rodar `bun --cwd apps/web test` para a suíte; `bun check-types` (tsc) e `bun check` (ultracite) antes de cada commit.
- Hook PostToolUse roda `bun fix` após Write/Edit (pode reordenar imports) — se um Edit subsequente falhar por `old_string`, re-ler o arquivo.
- Datas de **display** usam `lib/format/datetime.ts`; datas de **input** usam o novo `lib/format/date-input.ts` (este plano).

---

### Task 1: Helper de fuso São Paulo para inputs de data

**Files:**
- Create: `apps/web/src/lib/format/date-input.ts`
- Test: `apps/web/src/lib/format/__tests__/date-input.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/format/__tests__/date-input.test.ts
import { describe, expect, it } from "vitest";
import {
	endOfDaySaoPaulo,
	saoPauloDayKey,
	startOfDaySaoPaulo,
} from "../date-input";

describe("date-input (fuso America/Sao_Paulo, offset -03:00)", () => {
	it("saoPauloDayKey usa o dia civil de Brasília, não UTC", () => {
		// 2026-06-12T02:00:00Z = 2026-06-11 23:00 em SP
		expect(saoPauloDayKey(new Date("2026-06-12T02:00:00Z"))).toBe("2026-06-11");
		// 2026-06-12T10:00:00Z = 2026-06-12 07:00 em SP
		expect(saoPauloDayKey(new Date("2026-06-12T10:00:00Z"))).toBe("2026-06-12");
	});

	it("startOfDaySaoPaulo retorna 00:00 do dia SP (03:00Z)", () => {
		expect(startOfDaySaoPaulo(new Date("2026-06-12T10:00:00Z")).toISOString()).toBe(
			"2026-06-12T03:00:00.000Z"
		);
	});

	it("endOfDaySaoPaulo retorna 23:59:59.999 do dia SP (02:59Z do dia seguinte)", () => {
		expect(endOfDaySaoPaulo(new Date("2026-06-12T10:00:00Z")).toISOString()).toBe(
			"2026-06-13T02:59:59.999Z"
		);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar a falha**

Run: `bun --cwd apps/web test src/lib/format/__tests__/date-input.test.ts`
Expected: FAIL (módulo `../date-input` não existe).

- [ ] **Step 3: Implementar o helper**

```ts
// apps/web/src/lib/format/date-input.ts
/**
 * Bordas de dia no fuso America/Sao_Paulo para INPUTS de data (não display).
 * Brasil não observa DST desde 2019 → offset fixo -03:00.
 * Para formatação de exibição use `datetime.ts`.
 */

const SP_OFFSET = "-03:00";

const DAY_KEY_FMT = new Intl.DateTimeFormat("en-CA", {
	timeZone: "America/Sao_Paulo",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/** "2026-06-12" — dia civil de `d` no fuso de Brasília. Comparável lexicograficamente. */
export const saoPauloDayKey = (d: Date): string => DAY_KEY_FMT.format(d);

/** Instante 00:00:00.000 do dia SP de `d`. */
export const startOfDaySaoPaulo = (d: Date): Date =>
	new Date(`${saoPauloDayKey(d)}T00:00:00.000${SP_OFFSET}`);

/** Instante 23:59:59.999 do dia SP de `d`. */
export const endOfDaySaoPaulo = (d: Date): Date =>
	new Date(`${saoPauloDayKey(d)}T23:59:59.999${SP_OFFSET}`);
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test src/lib/format/__tests__/date-input.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format/date-input.ts apps/web/src/lib/format/__tests__/date-input.test.ts
git commit -m "feat(promotions): helper de borda de dia em fuso São Paulo"
```

---

### Task 2: Wrapper `notify` + closeButton global

**Files:**
- Create: `apps/web/src/lib/notify.ts`
- Test: `apps/web/src/lib/__tests__/notify.test.ts`
- Modify: `packages/ui/src/components/sonner.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/__tests__/notify.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const error = vi.fn();
const success = vi.fn();
vi.mock("sonner", () => ({ toast: { error, success } }));

import { notify } from "../notify";

describe("notify", () => {
	beforeEach(() => {
		error.mockClear();
		success.mockClear();
	});

	it("error dura 8s e tem closeButton", () => {
		notify.error("falhou");
		expect(error).toHaveBeenCalledWith("falhou", {
			duration: 8000,
			closeButton: true,
		});
	});

	it("success dura 4s", () => {
		notify.success("ok");
		expect(success).toHaveBeenCalledWith("ok", { duration: 4000 });
	});

	it("opts do caller sobrescrevem o default", () => {
		notify.error("x", { duration: 12000 });
		expect(error).toHaveBeenCalledWith("x", {
			duration: 12000,
			closeButton: true,
		});
	});
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bun --cwd apps/web test src/lib/__tests__/notify.test.ts`
Expected: FAIL (`../notify` não existe).

- [ ] **Step 3: Implementar o wrapper**

```ts
// apps/web/src/lib/notify.ts
import { type ExternalToast, toast } from "sonner";

const ERROR_MS = 8000;
const DEFAULT_MS = 4000;

/**
 * Wrapper do sonner com durações padrão: erro 8s (+ botão fechar), demais 4s.
 * Use no lugar de `toast.*` para que erros fiquem visíveis o suficiente.
 */
export const notify = {
	error: (message: string, opts?: ExternalToast) =>
		toast.error(message, { duration: ERROR_MS, closeButton: true, ...opts }),
	success: (message: string, opts?: ExternalToast) =>
		toast.success(message, { duration: DEFAULT_MS, ...opts }),
	warning: (message: string, opts?: ExternalToast) =>
		toast.warning(message, { duration: ERROR_MS, ...opts }),
	info: (message: string, opts?: ExternalToast) =>
		toast.info(message, { duration: DEFAULT_MS, ...opts }),
	message: (message: string, opts?: ExternalToast) => toast(message, opts),
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test src/lib/__tests__/notify.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Adicionar `closeButton` global no Toaster**

Em `packages/ui/src/components/sonner.tsx`, no `<Sonner>`, adicionar a prop `closeButton` logo após `className="toaster group"` (antes de `{...props}`, para que callers possam sobrescrever):

```tsx
		<Sonner
			className="toaster group"
			closeButton
			icons={{
```

- [ ] **Step 6: check-types + commit**

Run: `bun check-types`
Expected: sem erros.

```bash
git add apps/web/src/lib/notify.ts apps/web/src/lib/__tests__/notify.test.ts packages/ui/src/components/sonner.tsx
git commit -m "feat: wrapper notify (erro 8s + fechar) e closeButton global no Toaster"
```

---

### Task 3: Schema — datas por dia SP, código normalizado, mensagem de desconto

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts`
- Test: `apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`

- [ ] **Step 1: Escrever os testes que falham (anexar ao arquivo existente)**

Adicionar ao final de `promotion-schema.test.ts` (mantém os testes atuais).
**Atenção:** o arquivo já importa `promotionSchema`/`createPromotionSchema` — **mesclar** com o import existente (não duplicar a linha de import); adicionar só `startOfDaySaoPaulo`. O `describe` abaixo é novo.

```ts
// (mesclar nos imports existentes — não duplicar)
// import { createPromotionSchema, promotionSchema } from "../promotion-schema";
import { startOfDaySaoPaulo } from "@/lib/format/date-input";

const validBase = {
	type: "promotion" as const,
	title: "Liquidação",
	description: null,
	discountType: "percent" as const,
	discountValue: 10,
	appliesToAll: true,
	active: true,
	featured: false,
	startsAt: null as Date | null,
	endsAt: null as Date | null,
	code: null,
	toolIds: [] as string[],
};

describe("promotion-schema — datas e código", () => {
	it("aceita promoção de 1 dia (início = fim no mesmo dia)", () => {
		const day = new Date("2026-08-10T12:00:00Z");
		const r = promotionSchema.safeParse({ ...validBase, startsAt: day, endsAt: day });
		expect(r.success).toBe(true);
	});

	it("rejeita fim em dia anterior ao início", () => {
		const r = promotionSchema.safeParse({
			...validBase,
			startsAt: new Date("2026-08-10T12:00:00Z"),
			endsAt: new Date("2026-08-09T12:00:00Z"),
		});
		expect(r.success).toBe(false);
	});

	it("create: aceita início hoje", () => {
		const r = createPromotionSchema.safeParse({
			...validBase,
			startsAt: startOfDaySaoPaulo(new Date()),
		});
		expect(r.success).toBe(true);
	});

	it("create: rejeita início ontem", () => {
		const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
		const r = createPromotionSchema.safeParse({ ...validBase, startsAt: yesterday });
		expect(r.success).toBe(false);
	});

	it("rejeita desconto zero com mensagem clara", () => {
		const r = promotionSchema.safeParse({ ...validBase, discountValue: 0 });
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(r.error.issues[0]?.message).toMatch(/maior que zero/i);
		}
	});

	it("normaliza código do cupom para UPPERCASE + trim", () => {
		const r = promotionSchema.safeParse({
			...validBase,
			type: "promocode",
			code: "  verao2025 ",
		});
		expect(r.success).toBe(true);
		if (r.success && r.data.type === "promocode") {
			expect(r.data.code).toBe("VERAO2025");
		}
	});
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bun --cwd apps/web test src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`
Expected: FAIL (promo de 1 dia rejeitada hoje; código não normalizado).

- [ ] **Step 3: Implementar as mudanças no schema**

Em `promotion-schema.ts`:

(a) No topo, após o `import { z }`:

```ts
import { saoPauloDayKey } from "@/lib/format/date-input";
```

(b) Em `promotionBaseFields`, trocar a linha do `discountValue`:

```ts
	discountValue: z
		.number()
		.gt(0, "Informe um valor de desconto maior que zero"),
```

(c) No `promocodeVariantSchema`, trocar o campo `code` para normalizar:

```ts
	code: z
		.string()
		.trim()
		.min(1, "Código obrigatório para promocode")
		.max(50, "Código não pode ultrapassar 50 caracteres")
		.regex(
			ASCII_PRINTABLE_REGEX,
			"Código deve conter apenas caracteres ASCII imprimíveis"
		)
		.transform((v) => v.toUpperCase()),
```

(d) No `.superRefine` do `promotionSchema`, **substituir** o bloco cross-field `endsAt <= startsAt` por comparação por dia:

```ts
		// Cross-field: fim não pode cair em dia anterior ao início (comparação por
		// dia no fuso SP — permite promoção de 1 dia, com início 00:00 e fim 23:59)
		if (
			data.startsAt != null &&
			data.endsAt != null &&
			saoPauloDayKey(data.endsAt) < saoPauloDayKey(data.startsAt)
		) {
			ctx.addIssue({
				code: "custom",
				message: "Data de fim não pode ser anterior à data de início",
				path: ["endsAt"],
			});
		}
```

(e) No `createPromotionSchema.superRefine`, **substituir** o check de passado:

```ts
export const createPromotionSchema = promotionSchema.superRefine((data, ctx) => {
	if (
		data.startsAt != null &&
		saoPauloDayKey(data.startsAt) < saoPauloDayKey(new Date())
	) {
		ctx.addIssue({
			code: "custom",
			message: "Data de início não pode ser no passado",
			path: ["startsAt"],
		});
	}
});
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`
Expected: PASS (todos, incluindo os antigos).

- [ ] **Step 5: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts
git commit -m "feat(promotions): datas por dia SP, código normalizado e mensagem de desconto"
```

---

### Task 4: Action — guard de destaque + normalização de datas

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/_lib/featured-message.ts` (puro — evita importar a action `"use server"` no teste)
- Modify: `apps/web/src/app/dashboard/promotions/actions.ts`
- Test: `apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts`

- [ ] **Step 1: Escrever o teste da mensagem (pura) que falha**

```ts
// apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts
import { describe, expect, it } from "vitest";
import { featuredConflictMessage } from "../featured-message";

describe("featuredConflictMessage", () => {
	it("com fim → cita a data", () => {
		const msg = featuredConflictMessage({ endsAt: new Date("2026-08-20T12:00:00Z") });
		expect(msg).toMatch(/20\/08\/2026/);
		expect(msg).toMatch(/remova-o ou aguarde/i);
	});

	it("sem fim → mensagem de sem prazo", () => {
		const msg = featuredConflictMessage({ endsAt: null });
		expect(msg).toMatch(/sem prazo de fim/i);
	});
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bun --cwd apps/web test src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts`
Expected: FAIL (`../featured-message` não existe).

- [ ] **Step 3a: Criar o módulo puro da mensagem**

```ts
// apps/web/src/app/dashboard/promotions/_lib/featured-message.ts
import { formatDate } from "@/lib/format/datetime";

/** Mensagem de bloqueio quando já existe um destaque vivo no home. */
export function featuredConflictMessage(existing: { endsAt: Date | null }): string {
	if (existing.endsAt) {
		return `Já existe um destaque ativo até ${formatDate(existing.endsAt)} — remova-o ou aguarde o fim para destacar esta.`;
	}
	return "Já existe um destaque ativo sem prazo de fim — remova-o para destacar esta.";
}
```

- [ ] **Step 3b: Implementar o guard e a normalização na action**

Em `actions.ts`:

(a) Adicionar imports no topo, junto aos outros `@/lib` (os de `drizzle-orm` `and`/`eq`/`ne` já existem):

```ts
import { endOfDaySaoPaulo, startOfDaySaoPaulo } from "@/lib/format/date-input";
import { featuredConflictMessage } from "./_lib/featured-message";
```

(b) Logo após a função `computeStatus`, adicionar o guard:

```ts
/**
 * Bloqueia marcar uma promoção como destaque enquanto já houver outro destaque
 * vivo (status active ou scheduled). O índice único do banco garante 1 destaque;
 * aqui damos a mensagem amigável antes de tentar o flip-off.
 */
async function assertFeaturedSlotFree(tx: Tx, excludeId?: string) {
	const filters = [eq(promotion.featured, true)];
	if (excludeId) {
		filters.push(ne(promotion.id, excludeId));
	}
	const rows = await tx
		.select({
			active: promotion.active,
			startsAt: promotion.startsAt,
			endsAt: promotion.endsAt,
		})
		.from(promotion)
		.where(and(...filters))
		.limit(1);

	const existing = rows[0];
	if (!existing) {
		return;
	}
	const status = computeStatus(existing);
	if (status === "active" || status === "scheduled") {
		conflict(featuredConflictMessage(existing));
	}
}
```

(c) Em `createPromotion`, dentro da transação, **antes** do `if (isFeatured) { ...update featured false... }`, inserir a chamada do guard (só quando vai destacar):

```ts
				const isFeatured = data.type === "promotion" && data.featured === true;
				if (isFeatured) {
					await assertFeaturedSlotFree(tx);
					await tx
						.update(promotion)
						.set({ featured: false })
						.where(eq(promotion.featured, true));
				}
```

(d) No `tx.insert(promotion).values({...})` do create, trocar as linhas de data:

```ts
					startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
					endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
```

(e) Em `updatePromotion`, mesma coisa: antes do flip-off, chamar o guard com `excludeId`:

```ts
				const isFeatured = data.type === "promotion" && data.featured === true;
				if (isFeatured) {
					await assertFeaturedSlotFree(tx, id);
					await tx
						.update(promotion)
						.set({ featured: false })
						.where(and(eq(promotion.featured, true), ne(promotion.id, id)));
				}
```

(f) No `tx.update(promotion).set({...})` do update, trocar as linhas de data:

```ts
					startsAt: data.startsAt ? startOfDaySaoPaulo(data.startsAt) : null,
					endsAt: data.endsAt ? endOfDaySaoPaulo(data.endsAt) : null,
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/app/dashboard/promotions/actions.ts apps/web/src/app/dashboard/promotions/_lib/featured-message.ts apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts
git commit -m "feat(promotions): bloqueio de destaque vivo e normalização de datas SP"
```

---

### Task 5: Formatação de desconto (pura)

**Files:**
- Create: `apps/web/src/lib/discount-format.ts`
- Test: `apps/web/src/lib/__tests__/discount-format.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// apps/web/src/lib/__tests__/discount-format.test.ts
import { describe, expect, it } from "vitest";
import {
	formatMoney,
	formatPercent,
	parseMoney,
	parsePercent,
	sanitizePercent,
} from "../discount-format";

describe("discount-format", () => {
	it("percent: nunca gruda zero à esquerda nem mantém símbolo", () => {
		expect(sanitizePercent("0%10")).toBe("010"); // texto cru sanitizado…
		expect(parsePercent("10")).toBe(10);
		expect(parsePercent("10,5")).toBe(10.5);
		expect(parsePercent("250")).toBe(100); // clamp 100
		expect(formatPercent(10)).toBe("10");
		expect(formatPercent(10.5)).toBe("10,5");
		expect(formatPercent(0)).toBe("");
	});

	it("money: digit-shift em centavos, sem símbolo", () => {
		expect(parseMoney("15000")).toBe(150);
		expect(parseMoney("R$ 1,50")).toBe(1.5);
		expect(parseMoney("")).toBe(0);
		expect(formatMoney(150)).toBe("150,00");
		expect(formatMoney(1234.5)).toBe("1.234,50");
		expect(formatMoney(0)).toBe("");
	});
});
```

(Nota: `sanitizePercent("0%10")` retorna `"010"` por design — o componente nunca persiste isso porque o display é re-derivado do número; o que importa é `parsePercent` dar 10. O teste documenta o comportamento de sanitize.)

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `bun --cwd apps/web test src/lib/__tests__/discount-format.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar os helpers**

```ts
// apps/web/src/lib/discount-format.ts
const PCT_MAX = 100;

const MONEY_FMT = new Intl.NumberFormat("pt-BR", {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
});

/** Mantém só dígitos e uma vírgula decimal (sem símbolo). */
export function sanitizePercent(display: string): string {
	let cleaned = display.replace(/[^\d.,]/g, "").replace(/\./g, ",");
	const firstComma = cleaned.indexOf(",");
	if (firstComma >= 0) {
		cleaned =
			cleaned.slice(0, firstComma + 1) +
			cleaned.slice(firstComma + 1).replace(/,/g, "");
	}
	return cleaned;
}

export function parsePercent(display: string): number {
	const cleaned = sanitizePercent(display).replace(",", ".");
	if (!cleaned || cleaned === ".") {
		return 0;
	}
	const n = Number(cleaned);
	if (Number.isNaN(n)) {
		return 0;
	}
	return Math.min(PCT_MAX, Math.max(0, n));
}

export function formatPercent(value: number): string {
	if (!value) {
		return "";
	}
	return String(value).replace(".", ",");
}

export function parseMoney(display: string): number {
	const digits = display.replace(/\D/g, "");
	if (!digits) {
		return 0;
	}
	return Number(digits) / 100;
}

export function formatMoney(value: number): string {
	if (!value) {
		return "";
	}
	return MONEY_FMT.format(value);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test src/lib/__tests__/discount-format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/discount-format.ts apps/web/src/lib/__tests__/discount-format.test.ts
git commit -m "feat(promotions): helpers puros de formatação de desconto sem símbolo"
```

---

### Task 6: Componente `AffixInput`

**Files:**
- Create: `apps/web/src/components/affix-input.tsx`

- [ ] **Step 1: Implementar o primitivo** (sem unit test — componente; validado no smoke da Task 9)

```tsx
// apps/web/src/components/affix-input.tsx
"use client";

import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

type AffixInputProps = Omit<React.ComponentProps<"input">, "prefix"> & {
	prefix?: ReactNode;
	suffix?: ReactNode;
};

/**
 * Input com adorno fixo (prefixo/sufixo) — o símbolo fica FORA do texto
 * editável. Espelha as classes do Input base (@emach/ui) para consistência.
 */
export function AffixInput({
	prefix,
	suffix,
	className,
	disabled,
	...rest
}: AffixInputProps) {
	return (
		<div
			className={cn(
				"flex h-8 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-input bg-transparent text-xs transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-transparent dark:bg-input/30",
				disabled && "pointer-events-none opacity-50",
				className
			)}
			data-slot="affix-input"
		>
			{prefix == null ? null : (
				<div className="flex shrink-0 items-center border-input border-r bg-muted px-2.5 text-muted-foreground">
					{prefix}
				</div>
			)}
			<input
				className="min-w-0 flex-1 bg-transparent px-2.5 py-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				disabled={disabled}
				{...rest}
			/>
			{suffix == null ? null : (
				<div className="flex shrink-0 items-center border-input border-l bg-muted px-2.5 text-muted-foreground">
					{suffix}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/components/affix-input.tsx
git commit -m "feat: AffixInput — input com adorno prefixo/sufixo"
```

---

### Task 7: Componente `MoneyInput` (R$ prefixo)

**Files:**
- Create: `apps/web/src/components/money-input.tsx`

- [ ] **Step 1: Implementar** (usa `AffixInput` + helpers de Task 5)

```tsx
// apps/web/src/components/money-input.tsx
"use client";

import { useEffect, useState } from "react";

import { AffixInput } from "@/components/affix-input";
import { formatMoney, parseMoney } from "@/lib/discount-format";

interface MoneyInputProps {
	disabled?: boolean;
	id?: string;
	onChange: (value: number | null) => void;
	value: number | null | undefined;
}

/** Campo de valor em R$ — prefixo fixo, sem símbolo no texto editável. */
export function MoneyInput({ disabled, id, onChange, value }: MoneyInputProps) {
	const [display, setDisplay] = useState(() => formatMoney(value ?? 0));

	// re-sincroniza se o valor mudar por fora (ex.: reset do form)
	useEffect(() => {
		setDisplay(formatMoney(value ?? 0));
	}, [value]);

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const n = parseMoney(e.target.value);
		setDisplay(formatMoney(n));
		onChange(n === 0 ? null : n);
	}

	return (
		<AffixInput
			disabled={disabled}
			id={id}
			inputMode="numeric"
			onChange={handleChange}
			placeholder="0,00"
			prefix="R$"
			value={display}
		/>
	);
}
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/components/money-input.tsx
git commit -m "feat: MoneyInput — valor em R$ com prefixo fixo"
```

---

### Task 8: Componente `DiscountInput` (seletor % / R$ embutido)

**Files:**
- Create: `apps/web/src/components/discount-input.tsx`

- [ ] **Step 1: Implementar** (corrige o bug de sync via `useEffect` no `discountType`)

```tsx
// apps/web/src/components/discount-input.tsx
"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { useEffect, useState } from "react";

import { AffixInput } from "@/components/affix-input";
import {
	formatMoney,
	formatPercent,
	parseMoney,
	parsePercent,
	sanitizePercent,
} from "@/lib/discount-format";

type DiscountType = "percent" | "fixed";

interface DiscountInputProps {
	discountType: DiscountType;
	discountValue: number;
	disabled?: boolean;
	id?: string;
	onChange: (next: { discountType: DiscountType; discountValue: number }) => void;
}

function formatFor(type: DiscountType, value: number): string {
	return type === "percent" ? formatPercent(value) : formatMoney(value);
}

export function DiscountInput({
	discountType,
	discountValue,
	disabled,
	id,
	onChange,
}: DiscountInputProps) {
	const [display, setDisplay] = useState(() =>
		formatFor(discountType, discountValue)
	);

	// Re-sincroniza o display ao trocar o tipo — corrige o bug do MaskedInput
	// (display preso da máscara antiga). Valor numérico é preservado.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-sync só ao trocar de tipo
	useEffect(() => {
		setDisplay(formatFor(discountType, discountValue));
	}, [discountType]);

	function handleTypeChange(next: DiscountType) {
		onChange({ discountType: next, discountValue });
	}

	function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
		if (discountType === "percent") {
			const sanitized = sanitizePercent(e.target.value);
			setDisplay(sanitized);
			onChange({ discountType, discountValue: parsePercent(sanitized) });
		} else {
			const n = parseMoney(e.target.value);
			setDisplay(formatMoney(n));
			onChange({ discountType, discountValue: n });
		}
	}

	const prefix = (
		<Select
			disabled={disabled}
			onValueChange={(v) => handleTypeChange(v as DiscountType)}
			value={discountType}
		>
			<SelectTrigger
				aria-label="Tipo de desconto"
				className="h-full w-auto rounded-none border-0 bg-transparent px-0 pr-1 focus-visible:ring-0 focus-visible:ring-offset-0"
				size="sm"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="start">
				<SelectItem value="percent">%</SelectItem>
				<SelectItem value="fixed">R$</SelectItem>
			</SelectContent>
		</Select>
	);

	return (
		<AffixInput
			disabled={disabled}
			id={id}
			inputMode="decimal"
			onChange={handleInput}
			placeholder={discountType === "percent" ? "Ex: 10" : "0,00"}
			prefix={prefix}
			value={display}
		/>
	);
}
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/components/discount-input.tsx
git commit -m "feat: DiscountInput — seletor % / R$ embutido sem símbolo no texto"
```

---

### Task 9: Refatorar `promotion-form-fields.tsx` (layout em cards + novos inputs)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`

**Contexto:** este é o componente grande do form (estrutura atual: type selector + um grid `lg:grid-cols-2` com colunas livres). Vamos: (1) reorganizar em 4 cards titulados; (2) substituir o radio "Tipo de desconto" + `MaskedInput` de desconto pelo `DiscountInput`; (3) trocar o `MaskedInput` de `minOrderAmount` por `MoneyInput`; (4) adicionar `min` no DatePicker de início no modo create.

- [ ] **Step 1: Atualizar imports**

Remover os imports não mais usados (`MaskedInput`, `brlMask`, `percentageMask`, `RadioGroup`/`RadioGroupItem` **só se** não usados em outro lugar do arquivo — atenção: `RadioGroup` ainda é usado no escopo de Ferramentas e no TypeSelector; **manter**). Trocar:

```tsx
// remover:
import { MaskedInput } from "@/components/masked-input";
import { brlMask, integerMask, percentageMask } from "@/lib/masks";
// por:
import { MaskedInput } from "@/components/masked-input"; // ainda usado p/ maxRedemptions
import { integerMask } from "@/lib/masks";
import { DiscountInput } from "@/components/discount-input";
import { MoneyInput } from "@/components/money-input";
```

E adicionar o import do prop `mode` no DatePicker de início (ver Step 5). Remover as linhas:

```tsx
	const discountMask =
		values.discountType === "percent" ? percentageMask : brlMask;
	const discountLabel =
		values.discountType === "percent" ? "Desconto (%)" : "Desconto (R$)";
```

- [ ] **Step 2: Criar um helper de card local** (logo antes do `export function PromotionFormFields`)

```tsx
function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-4 rounded-lg border border-border p-4">
			<h3 className="font-medium text-sm">{title}</h3>
			{children}
		</div>
	);
}
```

- [ ] **Step 3: Substituir o JSX do `return` por uma grade de cards**

Substituir todo o bloco `<div className="grid gap-x-8 gap-y-6 lg:grid-cols-2"> ... </div>` (as duas colunas atuais) — **mantendo** o `TypeSelector`/cabeçalho de tipo no topo — pela seguinte estrutura de 4 `Section` num grid responsivo. O conteúdo interno de cada campo (Título, Descrição, Código, Limite, etc.) é o **mesmo** de hoje; só muda o agrupamento e os dois inputs (desconto e valor mínimo).

```tsx
		<div className="flex flex-col gap-6">
			{mode === "create" ? (
				<TypeSelector
					disabled={disabled}
					onChange={handleTypeChange}
					value={type}
				/>
			) : (
				<div className="flex items-center gap-2 text-sm">
					{isCoupon ? (
						<Ticket aria-hidden className="size-4 text-muted-foreground" />
					) : (
						<Tag aria-hidden className="size-4 text-muted-foreground" />
					)}
					<span className="font-medium">{typeLabel(type)}</span>
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				{/* Card 1 — Identidade */}
				<Section title="Identidade">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-title">
							Título<span className="text-destructive"> *</span>
						</Label>
						<Input
							disabled={disabled}
							id="promo-title"
							onChange={(e) => onPatch({ title: e.target.value })}
							placeholder={
								isCoupon ? "Ex: Cupom boas-vindas" : "Ex: Liquidação de inverno"
							}
							value={values.title}
						/>
						{errors.title && (
							<p className="text-destructive text-sm">{errors.title}</p>
						)}
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-description">Descrição</Label>
						<Textarea
							disabled={disabled}
							id="promo-description"
							onChange={(e) =>
								onPatch({
									description: e.target.value === "" ? null : e.target.value,
								})
							}
							placeholder="Contexto interno — não aparece no site."
							rows={3}
							value={values.description ?? ""}
						/>
						{errors.description && (
							<p className="text-destructive text-sm">{errors.description}</p>
						)}
					</div>
				</Section>

				{/* Card 2 — Desconto (+ campos de cupom) */}
				<Section title="Desconto">
					<div className="flex flex-col gap-2">
						<Label htmlFor="promo-discount-value">
							Desconto<span className="text-destructive"> *</span>
						</Label>
						<DiscountInput
							disabled={disabled}
							discountType={values.discountType}
							discountValue={values.discountValue}
							id="promo-discount-value"
							onChange={(next) => onPatch(next)}
						/>
						{errors.discountValue && (
							<p className="text-destructive text-sm">{errors.discountValue}</p>
						)}
					</div>

					{isCoupon && (
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-code">
								Código<span className="text-destructive"> *</span>
							</Label>
							<Input
								className="font-mono uppercase"
								disabled={disabled}
								id="promo-code"
								onChange={(e) =>
									onPatch({ code: e.target.value } as Partial<PromotionFormValues>)
								}
								placeholder="VERAO2025"
								value={values.code ?? ""}
							/>
							<p className="text-muted-foreground text-xs">
								Digitado pelo cliente no checkout para aplicar o desconto.
							</p>
							{errors.code && (
								<p className="text-destructive text-sm">{errors.code}</p>
							)}
						</div>
					)}

					{isCoupon && (
						<>
							<div className="flex flex-col gap-2">
								<Label htmlFor="promo-max-redemptions">Limite de resgates</Label>
								<MaskedInput
									disabled={disabled}
									id="promo-max-redemptions"
									mask={integerMask}
									onChange={(n) =>
										onPatch({
											maxRedemptions: n ?? null,
										} as Partial<PromotionFormValues>)
									}
									value={
										(values as { maxRedemptions?: number | null })
											.maxRedemptions ?? undefined
									}
								/>
								<p className="text-muted-foreground text-xs">Vazio = ilimitado</p>
								{errors.maxRedemptions && (
									<p className="text-destructive text-sm">
										{errors.maxRedemptions}
									</p>
								)}
							</div>

							<div className="flex flex-col gap-2">
								<Label htmlFor="promo-min-order-amount">
									Valor mínimo do pedido
								</Label>
								<MoneyInput
									disabled={disabled}
									id="promo-min-order-amount"
									onChange={(n) =>
										onPatch({
											minOrderAmount: n,
										} as Partial<PromotionFormValues>)
									}
									value={
										(values as { minOrderAmount?: number | null }).minOrderAmount
									}
								/>
								<p className="text-muted-foreground text-xs">Vazio = sem mínimo</p>
								{errors.minOrderAmount && (
									<p className="text-destructive text-sm">
										{errors.minOrderAmount}
									</p>
								)}
							</div>
						</>
					)}
				</Section>

				{/* Card 3 — Vigência & publicação */}
				<Section title="Vigência & publicação">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-starts-at">Início</Label>
							<DatePicker
								disabled={disabled}
								id="promo-starts-at"
								min={mode === "create" ? new Date() : undefined}
								onChange={(d) => onPatch({ startsAt: d ?? null })}
								value={values.startsAt ?? undefined}
							/>
							<p className="text-muted-foreground text-xs">Vazio = imediato</p>
							{errors.startsAt && (
								<p className="text-destructive text-sm">{errors.startsAt}</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="promo-ends-at">Fim</Label>
							<DatePicker
								disabled={disabled}
								id="promo-ends-at"
								min={values.startsAt ?? undefined}
								onChange={(d) => onPatch({ endsAt: d ?? null })}
								value={values.endsAt ?? undefined}
							/>
							<p className="text-muted-foreground text-xs">Vazio = sem prazo</p>
							{errors.endsAt && (
								<p className="text-destructive text-sm">{errors.endsAt}</p>
							)}
						</div>
					</div>

					<div className="flex items-center gap-3">
						<Switch
							checked={values.active}
							disabled={disabled}
							id="promo-active"
							onCheckedChange={(v) => onPatch({ active: v })}
						/>
						<Label className="cursor-pointer" htmlFor="promo-active">
							Ativa
						</Label>
					</div>
					<p className="-mt-2 text-muted-foreground text-xs">
						Inativa não aparece no site, mesmo dentro da vigência.
					</p>

					{!isCoupon && (
						<>
							<div className="flex items-center gap-3">
								<Switch
									checked={values.featured}
									disabled={disabled}
									id="promo-featured"
									onCheckedChange={(v) => onPatch({ featured: v })}
								/>
								<Label className="cursor-pointer" htmlFor="promo-featured">
									Destaque no home
								</Label>
							</div>
							<p className="-mt-2 text-muted-foreground text-xs">
								Aparece em destaque no topo da home. Só uma promoção pode ser
								destaque por vez — não é possível ativar enquanto houver outro
								destaque vigente.
							</p>
						</>
					)}
				</Section>

				{/* Card 4 — Ferramentas */}
				<Section title="Ferramentas">
					<RadioGroup
						className="flex gap-4"
						onValueChange={(v) => {
							const all = v === "true";
							if (all) {
								onPatch({ appliesToAll: true, toolIds: [] });
							} else {
								onPatch({ appliesToAll: false });
							}
						}}
						value={String(values.appliesToAll)}
					>
						<Label
							className="flex cursor-pointer items-center gap-2"
							htmlFor="scope-all"
						>
							<RadioGroupItem disabled={disabled} id="scope-all" value="true" />
							Todas as ferramentas
						</Label>
						<Label
							className="flex cursor-pointer items-center gap-2"
							htmlFor="scope-specific"
						>
							<RadioGroupItem
								disabled={disabled}
								id="scope-specific"
								value="false"
							/>
							Ferramentas específicas
						</Label>
					</RadioGroup>

					{!values.appliesToAll && (
						<div className="flex flex-col gap-2">
							<ToolCombobox
								availableTools={availableTools}
								disabled={disabled}
								onChange={(ids) => onPatch({ toolIds: ids })}
								selectedIds={values.toolIds}
							/>
							{errors.toolIds && (
								<p className="text-destructive text-sm">{errors.toolIds}</p>
							)}
							{conflictCount > 0 && (
								<div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
									<AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
									<span>
										{conflictCount === 1
											? "1 desta já tem promoção"
											: `${conflictCount} destas já têm promoção`}{" "}
										— o site aplica o maior desconto.
									</span>
								</div>
							)}
						</div>
					)}
				</Section>
			</div>
		</div>
```

- [ ] **Step 4: Verificar imports órfãos**

Conferir que `Tag`, `Ticket`, `AlertCircle`, `ChevronsUpDown`, `X` (lucide), `Input`, `Textarea`, `Switch`, `Label`, `RadioGroup`, `RadioGroupItem`, `DatePicker`, `Badge`, `Popover*`, `Command*` ainda estão importados e usados. O radio de `discountType` saiu, mas `RadioGroup`/`RadioGroupItem` continuam usados (escopo + TypeSelector).

- [ ] **Step 5: check-types + lint**

Run: `bun check-types && bun check`
Expected: sem erros. Corrigir lint apontado (ex.: ordenação de imports já é tratada pelo hook `bun fix`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx
git commit -m "feat(promotions): layout em cards + DiscountInput/MoneyInput no form"
```

---

### Task 10: `promotion-form.tsx` — full-width, botões à direita, notify

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`
- Modify: `apps/web/src/app/dashboard/promotions/new/page.tsx` (remover wrapper estreito se houver) — verificar; o form já controla a largura.

- [ ] **Step 1: Trocar import de toast por notify**

```tsx
// remover: import { toast } from "sonner";
import { notify } from "@/lib/notify";
```

- [ ] **Step 2: Form ocupa largura total**

Trocar a classe do `<form>`:

```tsx
		<form className="flex w-full flex-col gap-8" onSubmit={handleSubmit}>
```

- [ ] **Step 3: Trocar `toast.*` por `notify.*` e fazer serverError virar toast**

No `handleSubmit`, no ramo de validação:

```tsx
			notify.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
```

Nos ramos de sucesso (`toast.success(...)` → `notify.success(...)`).

Nos ramos de erro de servidor, **além** de `setServerError(...)`, disparar a toast longa. Ex. no create:

```tsx
				} else {
					const msg = result.error || "Não foi possível criar a promoção";
					setServerError(msg);
					notify.error(msg);
				}
```

E igual no update (`"Não foi possível salvar a promoção"`).

- [ ] **Step 4: Botões num footer alinhado à direita**

Trocar o bloco dos botões:

```tsx
			{/* Botões */}
			<div className="flex items-center justify-end gap-3 border-border border-t pt-6">
				<Button
					disabled={isPending}
					onClick={() => router.push("/dashboard/promotions")}
					type="button"
					variant="ghost"
				>
					Cancelar
				</Button>
				<Button disabled={isPending || submitted} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} type={values.type} />
				</Button>
			</div>
```

- [ ] **Step 5: check-types + lint**

Run: `bun check-types && bun check`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx
git commit -m "feat(promotions): form full-width, botões à direita e toasts via notify"
```

---

### Task 11: Migrar toasts dos outros componentes de promoção

**Files (todos em `apps/web/src/app/dashboard/promotions/`):**
- Modify: `_components/copy-code-button.tsx`
- Modify: `_components/delete-promotion-dialog.tsx`
- Modify: `[id]/_components/promotion-header-actions.tsx`

- [ ] **Step 1: Em cada arquivo, trocar o import e as chamadas**

`import { toast } from "sonner";` → `import { notify } from "@/lib/notify";`
`toast.error(` → `notify.error(` ; `toast.success(` → `notify.success(`.

- [ ] **Step 2: check-types + commit**

Run: `bun check-types`

```bash
git add apps/web/src/app/dashboard/promotions
git commit -m "refactor(promotions): toasts via notify nos componentes da feature"
```

---

### Task 12: Nota de contrato (desconto R$ > preço)

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Adicionar nota**

Acrescentar uma subseção ao doc:

```markdown
## Aplicação de desconto (promoções)

O admin não valida `discountValue` (R$ fixo) contra o preço da ferramenta — um
desconto fixo pode exceder o preço. O **ecommerce** deve clampar o preço final
em `max(0, preço - desconto)` ao aplicar promoções/cupons, nunca permitindo
preço negativo. Desconto percentual já é limitado a 100% no admin.
```

- [ ] **Step 2: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(integration): contrato de clamp de desconto no ecommerce"
```

---

### Task 13: Rollout `notify` no restante do app (opcional, isolável em PR à parte)

**Contexto:** ~43 arquivos em `apps/web/src` ainda usam `toast.*` direto. O `closeButton` global (Task 2) já dá o X a todos; este passo dá a duração de 8s aos erros. **Mecânico e isolado** — fazer por diretório, um commit por diretório, `check-types` entre eles. Pode virar PR separado.

Diretórios a migrar (lista do grep em 2026-06-12): `branches/`, `categories/`, `customers/`, `orders/`, `reviews/`, `stock/`, `suppliers/`, `tools/`, `users/`, `site/settings/`. **Não** tocar `design/` (página de demo do design system — toasts ali são exemplos intencionais de `toast` cru).

- [ ] **Step 1: Por diretório, em cada arquivo com `toast.`**

Trocar `import { toast } from "sonner";` → `import { notify } from "@/lib/notify";`
e `toast.error(`→`notify.error(`, `toast.success(`→`notify.success(`, `toast.info(`→`notify.info(`, `toast.warning(`→`notify.warning(`, `toast(`→`notify.message(`.

Provar o padrão em **um** arquivo antes de repetir (evitar erro em lote). Re-ler o arquivo se o hook `bun fix` reordenar imports e um Edit seguinte falhar.

- [ ] **Step 2: Após cada diretório**

Run: `bun check-types`
Expected: sem erros.

```bash
git add apps/web/src/app/dashboard/<dir>
git commit -m "refactor(<dir>): toasts via notify"
```

- [ ] **Step 3: Suíte completa ao final**

Run: `bun --cwd apps/web test`
Expected: verde.

---

### Task 14: Verificação final (smoke runtime)

- [ ] **Step 1: Suíte + tipos + lint**

```bash
bun --cwd apps/web test && bun check-types && bun check
```
Expected: tudo verde.

- [ ] **Step 2: Smoke no browser** (`bun dev:web`, rota `/dashboard/promotions/new`)

Checklist visual/funcional:
- [ ] Tela ocupa a largura toda; 4 cards; botões **Criar/Cancelar à direita**.
- [ ] Digitar desconto `%`: aparece só o número (sem "010"); trocar pra `R$` no dropdown reformata sem corromper (10 não vira 0,10).
- [ ] `Valor mínimo` (cupom) com prefixo `R$`, digitação limpa.
- [ ] Selecionar **hoje** no início → cria sem erro de "data no passado".
- [ ] Início = Fim no mesmo dia → cria (promo de 1 dia).
- [ ] Dias passados desabilitados no calendário de início.
- [ ] Marcar Destaque com outro destaque vivo → toast de erro (8s, com X) explicando.
- [ ] Desconto vazio/zero → erro claro "maior que zero".
- [ ] Editar uma promoção existente → form carrega e salva normalmente.

- [ ] **Step 3: Finalizar branch**

Invocar a skill `superpowers:finishing-a-development-branch`.

---

## Notas de execução

- **Ordem de dependência:** Tasks 1, 5 são base (helpers). 6→7→8 dependem de 5/6. 9 depende de 7/8. 10/11 dependem de 2 (notify). 13 depende de 2.
- **Sem mudança de schema DB** em nenhuma task.
- **Roles desligadas (ADR-0012):** manter `requireCapability("promotions.manage")` nas actions como está — não remover.

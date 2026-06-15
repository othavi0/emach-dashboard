# Banners — Builder componível (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-06-15-banners-composable-builder-design.md`. Leia antes.
> **Base:** evolui o CMS de banners do #176 (já na main). Branch: `banner-builder`.
> **Cada implementer:** Read cada arquivo antes de Edit (não herda state). Rodar `bun check-types` + `bun check` antes de commitar. React 19 + React Compiler: SEM useMemo/useCallback/forwardRef. `<img>` Supabase com `biome-ignore` (noImgElement + useImageSize). Sem console.*/any/ts-ignore/key={index}.
> **ADR-0016:** gates religados — `site.update_banners` é super_admin-only (as actions já chamam `requireCapability`, sem mudança; smoke deve ser feito logado como super_admin).

**Goal:** Evoluir o CMS de banners para um builder componível — slots on/off, presets, enum de layout (4) e variante de CTA (4), badge e countdown — com preview ao vivo refletindo tudo.

**Architecture:** Delta na tabela `banner` (campos nullable + 2 pgEnums + `badgeText`/`countdownTarget`, push-only). `banner-schema.ts` reescrito com `superRefine` para regras cross-field. Form reescrito: preset cards + seções de slot com Switch + pickers de layout/variante + countdown, estado `values` (zod) + `enabledSlots` local; preview ao vivo aproxima o hero Ferrari do storefront.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 + Supabase, Zod, vitest.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `packages/db/src/schema/banner.ts` | modificar | nullable + 2 pgEnums + `badgeText`/`countdownTarget` |
| `.../site/banners/_components/banner-schema.ts` | reescrever | zod nullable + enums + superRefine + tipos + consts |
| `.../_components/__tests__/banner-schema.test.ts` | reescrever | testes das novas regras |
| `.../site/banners/actions.ts` | modificar | create/update mapeiam novos campos |
| `.../_components/banner-presets.ts` | criar | config `PRESETS`, `SlotKey`, `SLOT_FIELDS`, consts de UI |
| `.../_components/preset-cards.tsx` | criar | 4 cards inline |
| `.../_components/slot-section.tsx` | criar | fieldset com Switch no header (slot on/off) |
| `.../_components/layout-picker.tsx` | criar | 4 mini-diagramas radio |
| `.../_components/cta-variant-picker.tsx` | criar | 4 swatches |
| `.../_components/countdown-field.tsx` | criar | input datetime-local ↔ Date |
| `.../_components/banner-form.tsx` | reescrever | orquestra builder + submit + preview |
| `.../_components/banner-live-preview.tsx` | reescrever | layout/variante/badge/countdown/void-black/régua |
| `.../_components/banner-card.tsx` | modificar | indicar slots/variante (ajuste leve) |

Caminho base: `apps/web/src/app/dashboard/site/banners/`.

---

## Task 1: Schema delta + db:sync

**Files:** Modify `packages/db/src/schema/banner.ts`

- [ ] **Step 1: Reescrever o schema com enums e campos novos**

Substituir o conteúdo de `packages/db/src/schema/banner.ts` por:

```ts
import { boolean, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const bannerLayout = pgEnum("banner_layout", [
	"split",
	"stack_left",
	"center_bottom",
	"center_mid",
]);

export const bannerCtaVariant = pgEnum("banner_cta_variant", [
	"red",
	"dark",
	"white",
	"ghost",
]);

export const banner = pgTable("banner", {
	id: text("id").primaryKey(),
	backgroundImageUrl: text("background_image_url"),
	backgroundImageMobileUrl: text("background_image_mobile_url"),
	productImageUrl: text("product_image_url"),
	productImageMobileUrl: text("product_image_mobile_url"),
	title: text("title"),
	subtitle: text("subtitle"),
	altText: text("alt_text"),
	badgeText: text("badge_text"),
	ctaLabel: text("cta_label"),
	ctaHref: text("cta_href"),
	ctaVariant: bannerCtaVariant("cta_variant").notNull().default("red"),
	layout: bannerLayout("layout").notNull().default("split"),
	countdownTarget: timestamp("countdown_target", { withTimezone: true }),
	sortOrder: integer("sort_order").notNull().default(0),
	isActive: boolean("is_active").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export type Banner = typeof banner.$inferSelect;
export type NewBanner = typeof banner.$inferInsert;
```

- [ ] **Step 2: Aplicar no banco**

Run: `bun db:sync`
Expected: cria os 2 enums, adiciona `badge_text`/`countdown_target`/`cta_variant`/`layout`, e `ALTER COLUMN ... DROP NOT NULL` em title/background_image_url/alt_text/cta_label/cta_href. Sem TTY-prompt (não-destrutivo). "Changes applied".

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/banner.ts
git commit -m "feat(db): banner componível — campos nullable + enums layout/ctaVariant + badge/countdown"
```

---

## Task 2: Zod schema reescrito + testes (TDD)

**Files:** Reescrever `_components/banner-schema.ts` e `_components/__tests__/banner-schema.test.ts`

- [ ] **Step 1: Reescrever o teste primeiro**

Substituir `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts` por:

```ts
import { describe, expect, it } from "vitest";
import { bannerFormSchema, MAX_ACTIVE_BANNERS } from "../banner-schema";

const base = {
	backgroundImageUrl: "https://x.supabase.co/storage/v1/object/public/banner-images/a.jpg",
	backgroundImageMobileUrl: null,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: "Potência redefinida",
	subtitle: null,
	altText: "EMACH — Potência",
	badgeText: null,
	ctaLabel: "Ver Catálogo",
	ctaHref: "/catalog",
	ctaVariant: "red" as const,
	layout: "split" as const,
	countdownTarget: null,
	isActive: false,
};

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

describe("bannerFormSchema", () => {
	it("aceita um banner completo válido", () => {
		expect(bannerFormSchema.safeParse(base).success).toBe(true);
	});

	it("aceita banner só com título (sem fundo)", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundImageUrl: null,
			altText: null,
			title: "Só título",
			ctaLabel: null,
			ctaHref: null,
		});
		expect(r.success).toBe(true);
	});

	it("rejeita banner 100% vazio (sem fundo, título nem badge)", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundImageUrl: null,
			altText: null,
			title: null,
			badgeText: null,
			ctaLabel: null,
			ctaHref: null,
		});
		expect(r.success).toBe(false);
	});

	it("exige altText quando há fundo", () => {
		const r = bannerFormSchema.safeParse({ ...base, altText: null });
		expect(r.success).toBe(false);
	});

	it("exige ctaLabel e ctaHref juntos", () => {
		expect(bannerFormSchema.safeParse({ ...base, ctaHref: null }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, ctaLabel: null }).success).toBe(false);
		expect(
			bannerFormSchema.safeParse({ ...base, ctaLabel: null, ctaHref: null }).success
		).toBe(true);
	});

	it("valida formato do ctaHref", () => {
		expect(bannerFormSchema.safeParse({ ...base, ctaHref: "catalog" }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, ctaHref: "https://x.com" }).success).toBe(true);
	});

	it("exige countdown no futuro", () => {
		expect(bannerFormSchema.safeParse({ ...base, countdownTarget: past() }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, countdownTarget: future() }).success).toBe(true);
	});

	it("aplica lengths (title ≤80, badge ≤16, ctaLabel ≤30, subtitle ≤140)", () => {
		expect(bannerFormSchema.safeParse({ ...base, title: "a".repeat(81) }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, badgeText: "a".repeat(17) }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, ctaLabel: "a".repeat(31) }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, subtitle: "a".repeat(141) }).success).toBe(false);
	});

	it("valida enums layout e ctaVariant", () => {
		expect(bannerFormSchema.safeParse({ ...base, layout: "weird" }).success).toBe(false);
		expect(bannerFormSchema.safeParse({ ...base, ctaVariant: "blue" }).success).toBe(false);
	});

	it("expõe MAX_ACTIVE_BANNERS = 6", () => {
		expect(MAX_ACTIVE_BANNERS).toBe(6);
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `bun --cwd apps/web test banner-schema`
Expected: FAIL (schema antigo não tem enums/campos novos; vários casos quebram).

- [ ] **Step 3: Reescrever o schema**

Substituir `apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts` por:

```ts
import { z } from "zod";

export const MAX_ACTIVE_BANNERS = 6;

export const BANNER_LAYOUTS = [
	"split",
	"stack_left",
	"center_bottom",
	"center_mid",
] as const;
export const BANNER_CTA_VARIANTS = ["red", "dark", "white", "ghost"] as const;

export type BannerLayout = (typeof BANNER_LAYOUTS)[number];
export type BannerCtaVariant = (typeof BANNER_CTA_VARIANTS)[number];

const CTA_HREF_RE = /^(\/|https:\/\/)/;

const optionalText = (max: number) =>
	z.string().trim().max(max, `Máx ${max} caracteres`).nullable();

export const bannerFormSchema = z
	.object({
		backgroundImageUrl: z.string().nullable(),
		backgroundImageMobileUrl: z.string().nullable(),
		productImageUrl: z.string().nullable(),
		productImageMobileUrl: z.string().nullable(),
		title: optionalText(80),
		subtitle: optionalText(140),
		altText: optionalText(160),
		badgeText: optionalText(16),
		ctaLabel: optionalText(30),
		ctaHref: z.string().trim().nullable(),
		ctaVariant: z.enum(BANNER_CTA_VARIANTS),
		layout: z.enum(BANNER_LAYOUTS),
		countdownTarget: z.date().nullable(),
		isActive: z.boolean(),
	})
	.superRefine((v, ctx) => {
		if (!(v.backgroundImageUrl || v.title || v.badgeText)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: [],
				message: "O banner precisa de imagem de fundo ou ao menos título/badge.",
			});
		}
		if (v.backgroundImageUrl && !v.altText) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["altText"],
				message: "Texto alternativo é obrigatório quando há imagem de fundo.",
			});
		}
		const hasLabel = Boolean(v.ctaLabel);
		const hasHref = Boolean(v.ctaHref);
		if (hasLabel !== hasHref) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ctaHref"],
				message: "Preencha rótulo e link do botão juntos (ou deixe ambos vazios).",
			});
		}
		if (hasHref && v.ctaHref && !CTA_HREF_RE.test(v.ctaHref)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["ctaHref"],
				message: "Use uma rota interna (/...) ou URL https://",
			});
		}
		if (v.countdownTarget && v.countdownTarget.getTime() <= Date.now()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["countdownTarget"],
				message: "A data do countdown deve estar no futuro.",
			});
		}
	});

export type BannerFormValues = z.infer<typeof bannerFormSchema>;
```

- [ ] **Step 4: Rodar — deve passar**

Run: `bun --cwd apps/web test banner-schema`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts" "apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts"
git commit -m "feat(banners): zod componível (nullable, enums, regras cross-field) + testes"
```

---

## Task 3: Server actions — novos campos

**Files:** Modify `apps/web/src/app/dashboard/site/banners/actions.ts`

- [ ] **Step 1: Atualizar o INSERT do `createBanner`**

No `createBanner`, o objeto passado a `db.insert(banner).values({...})` deve incluir todos os campos. Substituir o bloco `.values({...})` por:

```ts
await db.insert(banner).values({
	id,
	backgroundImageUrl: v.backgroundImageUrl,
	backgroundImageMobileUrl: v.backgroundImageMobileUrl,
	productImageUrl: v.productImageUrl,
	productImageMobileUrl: v.productImageMobileUrl,
	title: v.title,
	subtitle: v.subtitle,
	altText: v.altText,
	badgeText: v.badgeText,
	ctaLabel: v.ctaLabel,
	ctaHref: v.ctaHref,
	ctaVariant: v.ctaVariant,
	layout: v.layout,
	countdownTarget: v.countdownTarget,
	isActive: v.isActive,
	sortOrder: (maxRow?.max ?? -1) + 1,
});
```

- [ ] **Step 2: Atualizar o UPDATE do `updateBanner`**

No `updateBanner`, substituir o objeto do `.set({...})` por:

```ts
await db
	.update(banner)
	.set({
		backgroundImageUrl: v.backgroundImageUrl,
		backgroundImageMobileUrl: v.backgroundImageMobileUrl,
		productImageUrl: v.productImageUrl,
		productImageMobileUrl: v.productImageMobileUrl,
		title: v.title,
		subtitle: v.subtitle,
		altText: v.altText,
		badgeText: v.badgeText,
		ctaLabel: v.ctaLabel,
		ctaHref: v.ctaHref,
		ctaVariant: v.ctaVariant,
		layout: v.layout,
		countdownTarget: v.countdownTarget,
		isActive: v.isActive,
	})
	.where(eq(banner.id, id));
```

Não mudar `countActive`, `toggleBannerActive`, `reorderBanners`, `deleteBanner`, fetchers, nem o guard de 6 ativos. `bannerFormSchema` continua importado e usado em `safeParse`.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (`v` agora tem `badgeText`/`ctaVariant`/`layout`/`countdownTarget`; `countdownTarget: Date | null` casa com a coluna `timestamptz`).

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/actions.ts"
git commit -m "feat(banners): actions persistem layout/ctaVariant/badge/countdown"
```

---

## Task 4: Sub-componentes do builder

**Files:** Create `banner-presets.ts`, `slot-section.tsx`, `layout-picker.tsx`, `cta-variant-picker.tsx`, `countdown-field.tsx`, `preset-cards.tsx` (todos em `_components/`).

- [ ] **Step 1: `banner-presets.ts` (config + tipos de slot)**

```ts
import type { BannerFormValues } from "./banner-schema";

export type SlotKey =
	| "background"
	| "product"
	| "title"
	| "badge"
	| "countdown"
	| "cta";

/** Campos zerados quando o slot é desligado. */
export const SLOT_FIELDS: Record<SlotKey, (keyof BannerFormValues)[]> = {
	background: ["backgroundImageUrl", "backgroundImageMobileUrl", "altText"],
	product: ["productImageUrl", "productImageMobileUrl"],
	title: ["title", "subtitle"],
	badge: ["badgeText"],
	countdown: ["countdownTarget"],
	cta: ["ctaLabel", "ctaHref"],
};

export const SLOT_LABELS: Record<SlotKey, string> = {
	background: "Fundo",
	product: "Produto central",
	title: "Título + descrição",
	badge: "Badge / selo",
	countdown: "Countdown",
	cta: "Botão (CTA)",
};

export interface BannerPreset {
	key: string;
	label: string;
	hint: string;
	slots: SlotKey[];
	layout: BannerFormValues["layout"];
}

export const PRESETS: BannerPreset[] = [
	{
		key: "produto",
		label: "Produto em destaque",
		hint: "fundo + produto + texto + CTA · split",
		slots: ["background", "product", "title", "cta"],
		layout: "split",
	},
	{
		key: "promo",
		label: "Promo full-text",
		hint: "fundo + badge + texto + CTA · centralizado",
		slots: ["background", "badge", "title", "cta"],
		layout: "center_mid",
	},
	{
		key: "countdown",
		label: "Countdown",
		hint: "fundo + produto + contador + CTA",
		slots: ["background", "product", "title", "countdown", "cta"],
		layout: "split",
	},
	{
		key: "imagem",
		label: "Imagem pura",
		hint: "só fundo + CTA",
		slots: ["background", "cta"],
		layout: "split",
	},
];
```

- [ ] **Step 2: `slot-section.tsx`**

```tsx
"use client";

import { Switch } from "@emach/ui/components/switch";
import type { ReactNode } from "react";

export function SlotSection({
	id,
	title,
	enabled,
	onToggle,
	children,
}: {
	id: string;
	title: string;
	enabled: boolean;
	onToggle: (on: boolean) => void;
	children: ReactNode;
}) {
	return (
		<fieldset className="rounded-xl border border-border bg-card">
			<div className="flex items-center justify-between px-4 py-3">
				<label
					className="font-medium text-muted-foreground text-xs uppercase tracking-wider"
					htmlFor={id}
				>
					{title}
				</label>
				<Switch checked={enabled} id={id} onCheckedChange={onToggle} />
			</div>
			{enabled && (
				<div className="border-border border-t px-4 py-4">{children}</div>
			)}
		</fieldset>
	);
}
```

- [ ] **Step 3: `layout-picker.tsx`**

```tsx
"use client";

import { cn } from "@emach/ui/lib/utils";
import { BANNER_LAYOUTS, type BannerLayout } from "./banner-schema";

const LABELS: Record<BannerLayout, string> = {
	split: "Split",
	stack_left: "Empilhado",
	center_bottom: "Centro abaixo",
	center_mid: "Centralizado",
};

function Diagram({ layout }: { layout: BannerLayout }) {
	return (
		<div className="relative mb-1.5 aspect-video overflow-hidden rounded bg-muted">
			{layout === "split" && (
				<>
					<span className="absolute top-[28%] left-[8%] h-[8%] w-[34%] rounded-sm bg-foreground/40" />
					<span className="absolute bottom-[16%] right-[8%] h-[12%] w-[24%] rounded-sm bg-primary" />
					<span className="absolute top-[30%] right-[6%] h-[46%] w-[24%] rounded-sm bg-foreground/20" />
				</>
			)}
			{layout === "stack_left" && (
				<>
					<span className="absolute bottom-[34%] left-[8%] h-[8%] w-[34%] rounded-sm bg-foreground/40" />
					<span className="absolute bottom-[14%] left-[8%] h-[10%] w-[20%] rounded-sm bg-primary" />
					<span className="absolute top-[30%] right-[6%] h-[46%] w-[24%] rounded-sm bg-foreground/20" />
				</>
			)}
			{layout === "center_bottom" && (
				<>
					<span className="-translate-x-1/2 absolute top-[16%] left-1/2 h-[34%] w-[30%] rounded-sm bg-foreground/20" />
					<span className="-translate-x-1/2 absolute bottom-[18%] left-1/2 h-[8%] w-[46%] rounded-sm bg-foreground/40" />
					<span className="-translate-x-1/2 absolute bottom-[6%] left-1/2 h-[8%] w-[24%] rounded-sm bg-primary" />
				</>
			)}
			{layout === "center_mid" && (
				<>
					<span className="-translate-x-1/2 absolute top-[40%] left-1/2 h-[9%] w-[50%] rounded-sm bg-foreground/40" />
					<span className="-translate-x-1/2 absolute top-[56%] left-1/2 h-[9%] w-[26%] rounded-sm bg-primary" />
				</>
			)}
		</div>
	);
}

export function LayoutPicker({
	value,
	onChange,
}: {
	value: BannerLayout;
	onChange: (v: BannerLayout) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-2">
			{BANNER_LAYOUTS.map((l) => (
				<button
					className={cn(
						"rounded-lg border bg-card p-1.5 text-left transition-colors",
						value === l ? "border-primary" : "border-border hover:border-border/60"
					)}
					key={l}
					onClick={() => onChange(l)}
					type="button"
				>
					<Diagram layout={l} />
					<span className="block text-center text-[10px] text-muted-foreground">
						{LABELS[l]}
					</span>
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 4: `cta-variant-picker.tsx`**

```tsx
"use client";

import { cn } from "@emach/ui/lib/utils";
import { BANNER_CTA_VARIANTS, type BannerCtaVariant } from "./banner-schema";

const SWATCH: Record<BannerCtaVariant, string> = {
	red: "bg-[#e60012] text-white",
	dark: "border border-white bg-[#181818] text-white",
	white: "bg-white text-[#181818]",
	ghost: "border border-white bg-transparent text-white",
};

const LABELS: Record<BannerCtaVariant, string> = {
	red: "Vermelho",
	dark: "Escuro",
	white: "Branco",
	ghost: "Contorno",
};

export function CtaVariantPicker({
	value,
	onChange,
}: {
	value: BannerCtaVariant;
	onChange: (v: BannerCtaVariant) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-2">
			{BANNER_CTA_VARIANTS.map((variant) => (
				<button
					className={cn(
						"rounded-lg border p-2 text-center transition-colors",
						value === variant ? "border-primary" : "border-border hover:border-border/60"
					)}
					key={variant}
					onClick={() => onChange(variant)}
					type="button"
				>
					<span
						className={cn(
							"mb-1 inline-block rounded-sm px-3 py-1 font-bold text-[10px]",
							SWATCH[variant]
						)}
					>
						Botão
					</span>
					<span className="block text-[10px] text-muted-foreground">
						{LABELS[variant]}
					</span>
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 5: `countdown-field.tsx`**

```tsx
"use client";

import { Input } from "@emach/ui/components/input";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

/** Date → string aceita pelo input datetime-local, em horário local (entrada do usuário, não display). */
function toLocalInput(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CountdownField({
	value,
	onChange,
	ariaInvalid,
}: {
	value: Date | null;
	onChange: (d: Date | null) => void;
	ariaInvalid?: boolean;
}) {
	return (
		<Input
			aria-invalid={ariaInvalid ? true : undefined}
			onChange={(e) => {
				const raw = e.target.value;
				onChange(raw ? new Date(raw) : null);
			}}
			type="datetime-local"
			value={value ? toLocalInput(value) : ""}
		/>
	);
}
```

- [ ] **Step 6: `preset-cards.tsx`**

```tsx
"use client";

import { cn } from "@emach/ui/lib/utils";
import { type BannerPreset, PRESETS } from "./banner-presets";

export function PresetCards({
	selectedKey,
	onSelect,
}: {
	selectedKey: string | null;
	onSelect: (preset: BannerPreset) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{PRESETS.map((preset) => (
				<button
					className={cn(
						"rounded-lg border bg-card p-3 text-left transition-colors",
						selectedKey === preset.key
							? "border-primary bg-primary/5"
							: "border-border hover:border-border/60"
					)}
					key={preset.key}
					onClick={() => onSelect(preset)}
					type="button"
				>
					<span className="block font-medium text-xs">{preset.label}</span>
					<span className="mt-1 block text-[10px] text-muted-foreground leading-tight">
						{preset.hint}
					</span>
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 7: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS. Conferir que `Switch`/`Input`/`cn` resolvem (já usados no repo). Esses componentes ainda não são importados por ninguém — sem erro de unused (são exports).

- [ ] **Step 8: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/_components/banner-presets.ts" "apps/web/src/app/dashboard/site/banners/_components/slot-section.tsx" "apps/web/src/app/dashboard/site/banners/_components/layout-picker.tsx" "apps/web/src/app/dashboard/site/banners/_components/cta-variant-picker.tsx" "apps/web/src/app/dashboard/site/banners/_components/countdown-field.tsx" "apps/web/src/app/dashboard/site/banners/_components/preset-cards.tsx"
git commit -m "feat(banners): sub-componentes do builder (presets, slot-section, pickers, countdown)"
```

---

## Task 5: `banner-form.tsx` reescrito (orquestração)

**Files:** Reescrever `apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx`

- [ ] **Step 1: Reescrever o form**

Substituir o conteúdo por:

```tsx
"use client";

import type { Banner } from "@emach/db/schema/banner";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Switch } from "@emach/ui/components/switch";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { createBanner, updateBanner } from "../actions";
import { type BannerPreset, type SlotKey, SLOT_FIELDS } from "./banner-presets";
import { type BannerFormValues, bannerFormSchema } from "./banner-schema";
import { BannerLivePreview } from "./banner-live-preview";
import { CtaVariantPicker } from "./cta-variant-picker";
import { CountdownField } from "./countdown-field";
import { ImageUploadTile } from "./image-upload-tile";
import { LayoutPicker } from "./layout-picker";
import { PresetCards } from "./preset-cards";
import { SlotSection } from "./slot-section";

const EMPTY: BannerFormValues = {
	backgroundImageUrl: null,
	backgroundImageMobileUrl: null,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: null,
	subtitle: null,
	altText: null,
	badgeText: null,
	ctaLabel: null,
	ctaHref: null,
	ctaVariant: "red",
	layout: "split",
	countdownTarget: null,
	isActive: false,
};

function initialValues(banner?: Banner): BannerFormValues {
	if (!banner) {
		return EMPTY;
	}
	return {
		backgroundImageUrl: banner.backgroundImageUrl,
		backgroundImageMobileUrl: banner.backgroundImageMobileUrl,
		productImageUrl: banner.productImageUrl,
		productImageMobileUrl: banner.productImageMobileUrl,
		title: banner.title,
		subtitle: banner.subtitle,
		altText: banner.altText,
		badgeText: banner.badgeText,
		ctaLabel: banner.ctaLabel,
		ctaHref: banner.ctaHref,
		ctaVariant: banner.ctaVariant,
		layout: banner.layout,
		countdownTarget: banner.countdownTarget,
		isActive: banner.isActive,
	};
}

function deriveSlots(v: BannerFormValues): Record<SlotKey, boolean> {
	return {
		background: v.backgroundImageUrl !== null,
		product: v.productImageUrl !== null,
		title: v.title !== null,
		badge: v.badgeText !== null,
		countdown: v.countdownTarget !== null,
		cta: v.ctaLabel !== null || v.ctaHref !== null,
	};
}

export function BannerForm({ banner }: { banner?: Banner }) {
	const router = useRouter();
	const [values, setValues] = useState<BannerFormValues>(() => initialValues(banner));
	const [slots, setSlots] = useState<Record<SlotKey, boolean>>(() =>
		deriveSlots(initialValues(banner))
	);
	const [presetKey, setPresetKey] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } = useFormErrors<BannerFormValues>();

	function set<K extends keyof BannerFormValues>(key: K, v: BannerFormValues[K]) {
		setValues((prev) => ({ ...prev, [key]: v }));
	}

	function toggleSlot(key: SlotKey, on: boolean) {
		setSlots((prev) => ({ ...prev, [key]: on }));
		if (!on) {
			setValues((prev) => {
				const next = { ...prev };
				for (const f of SLOT_FIELDS[key]) {
					Reflect.set(next, f, null);
				}
				return next;
			});
		}
		setPresetKey(null);
	}

	function applyPreset(preset: BannerPreset) {
		const enabled = new Set(preset.slots);
		const allKeys: SlotKey[] = ["background", "product", "title", "badge", "countdown", "cta"];
		setSlots(() => {
			const next = {} as Record<SlotKey, boolean>;
			for (const k of allKeys) {
				next[k] = enabled.has(k);
			}
			return next;
		});
		setValues((prev) => {
			const next = { ...prev, layout: preset.layout };
			for (const k of allKeys) {
				if (!enabled.has(k)) {
					for (const f of SLOT_FIELDS[k]) {
						Reflect.set(next, f, null);
					}
				}
			}
			return next;
		});
		setPresetKey(preset.key);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		clearErrors();
		// Defensivo: zerar campos de slots desligados antes de validar.
		const clean = { ...values };
		for (const key of Object.keys(slots) as SlotKey[]) {
			if (!slots[key]) {
				for (const f of SLOT_FIELDS[key]) {
					Reflect.set(clean, f, null);
				}
			}
		}
		const parsed = bannerFormSchema.safeParse(clean);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const r = banner
				? await updateBanner(banner.id, parsed.data)
				: await createBanner(parsed.data);
			if (r.ok) {
				notify.success(banner ? "Banner atualizado" : "Banner criado");
				router.push("/dashboard/site/banners");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	return (
		<form
			className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-4">
				<div>
					<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Começar de um preset
					</p>
					<PresetCards onSelect={applyPreset} selectedKey={presetKey} />
				</div>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Disposição
					</legend>
					<LayoutPicker onChange={(l) => set("layout", l)} value={values.layout} />
				</fieldset>

				<SlotSection
					enabled={slots.background}
					id="slot-background"
					onToggle={(on) => toggleSlot("background", on)}
					title="Fundo"
				>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="2560×1440 · 16:9 · WebP/JPG · ≤500KB"
							label="Fundo · desktop"
							maxBytes={512_000}
							onChange={(u) => set("backgroundImageUrl", u)}
							value={values.backgroundImageUrl}
						/>
						<ImageUploadTile
							help="1080×1920 · 9:16 · ≤350KB · cai pro desktop se vazio"
							label="Fundo · mobile"
							maxBytes={358_400}
							onChange={(u) => set("backgroundImageMobileUrl", u)}
							value={values.backgroundImageMobileUrl}
						/>
					</div>
					<div className="mt-3">
						<LabeledField
							error={errors.altText}
							help={<HelpTooltip text="Descreve a imagem de fundo para leitores de tela." />}
							id="banner-alt-text"
							label="Texto alternativo (alt)"
							required
						>
							{(f) => (
								<Input
									{...f}
									onChange={(e) => set("altText", e.target.value || null)}
									value={values.altText ?? ""}
								/>
							)}
						</LabeledField>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.product}
					id="slot-product"
					onToggle={(on) => toggleSlot("product", on)}
					title="Produto central"
				>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="~2400px · PNG transparente · ≤800KB"
							label="Produto · desktop"
							maxBytes={819_200}
							onChange={(u) => set("productImageUrl", u)}
							value={values.productImageUrl}
						/>
						<ImageUploadTile
							help="~1400px · PNG · ≤500KB · cai pro produto desktop se vazio"
							label="Produto · mobile"
							maxBytes={512_000}
							onChange={(u) => set("productImageMobileUrl", u)}
							value={values.productImageMobileUrl}
						/>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.title}
					id="slot-title"
					onToggle={(on) => toggleSlot("title", on)}
					title="Título + descrição"
				>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.title}
							id="banner-title"
							label={`Título (${(values.title ?? "").length}/80)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={80}
									onBlur={() => {
										if (values.backgroundImageUrl && !values.altText) {
											set("altText", values.title);
										}
									}}
									onChange={(e) => set("title", e.target.value || null)}
									value={values.title ?? ""}
								/>
							)}
						</LabeledField>
						<LabeledField
							error={errors.subtitle}
							id="banner-subtitle"
							label={`Subtítulo (${(values.subtitle ?? "").length}/140)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={140}
									onChange={(e) => set("subtitle", e.target.value || null)}
									value={values.subtitle ?? ""}
								/>
							)}
						</LabeledField>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.badge}
					id="slot-badge"
					onToggle={(on) => toggleSlot("badge", on)}
					title="Badge / selo"
				>
					<LabeledField
						error={errors.badgeText}
						id="banner-badge"
						label={`Texto do selo (${(values.badgeText ?? "").length}/16)`}
					>
						{(f) => (
							<Input
								{...f}
								maxLength={16}
								onChange={(e) => set("badgeText", e.target.value || null)}
								placeholder="LANÇAMENTO"
								value={values.badgeText ?? ""}
							/>
						)}
					</LabeledField>
				</SlotSection>

				<SlotSection
					enabled={slots.countdown}
					id="slot-countdown"
					onToggle={(on) => toggleSlot("countdown", on)}
					title="Countdown"
				>
					<LabeledField
						error={errors.countdownTarget}
						help={<HelpTooltip text="Contador regressivo até esta data/hora no storefront." />}
						id="banner-countdown"
						label="Data/hora alvo"
					>
						{() => (
							<CountdownField
								ariaInvalid={Boolean(errors.countdownTarget)}
								onChange={(d) => set("countdownTarget", d)}
								value={values.countdownTarget}
							/>
						)}
					</LabeledField>
				</SlotSection>

				<SlotSection
					enabled={slots.cta}
					id="slot-cta"
					onToggle={(on) => toggleSlot("cta", on)}
					title="Botão (CTA)"
				>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.ctaLabel}
							id="banner-cta-label"
							label={`Rótulo (${(values.ctaLabel ?? "").length}/30)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={30}
									onChange={(e) => set("ctaLabel", e.target.value || null)}
									value={values.ctaLabel ?? ""}
								/>
							)}
						</LabeledField>
						<LabeledField
							error={errors.ctaHref}
							help={<HelpTooltip text="Rota interna (/catalog) ou URL externa (https://...)." />}
							id="banner-cta-href"
							label="Link"
						>
							{(f) => (
								<Input
									{...f}
									onChange={(e) => set("ctaHref", e.target.value || null)}
									placeholder="/catalog"
									value={values.ctaHref ?? ""}
								/>
							)}
						</LabeledField>
						<div>
							<p className="mb-1.5 text-muted-foreground text-xs">Variante de cor</p>
							<CtaVariantPicker
								onChange={(v) => set("ctaVariant", v)}
								value={values.ctaVariant}
							/>
						</div>
					</div>
				</SlotSection>

				<FieldError>{errors._form}</FieldError>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Publicação
					</legend>
					<label className="flex items-center gap-2 text-sm" htmlFor="banner-is-active">
						<Switch
							checked={values.isActive}
							id="banner-is-active"
							onCheckedChange={(c) => set("isActive", c)}
						/>
						Publicar (exibir no carrossel)
					</label>
				</fieldset>

				<div className="flex justify-end gap-2">
					<Button onClick={() => router.back()} type="button" variant="ghost">
						Cancelar
					</Button>
					<Button disabled={pending} type="submit">
						{banner ? "Salvar" : "Criar banner"}
					</Button>
				</div>
			</div>

			<BannerLivePreview slots={slots} values={values} />
		</form>
	);
}
```

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS. Notas: `errors._form` vem do `useFormErrors` (chave de refine de raiz, ver apps/web/CLAUDE.md). `Reflect.set(next, f, null)` zera campos de slot de tipo variado sem `as any` (assignment direto falha porque `keyof BannerFormValues` inclui campos não-nulláveis). `BannerLivePreview` recebe `slots` (Task 6 implementa a prop).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx"
git commit -m "feat(banners): builder form com presets, slots on/off, layout e variante"
```

---

## Task 6: `banner-live-preview.tsx` upgrade

**Files:** Reescrever `apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx`

- [ ] **Step 1: Reescrever o preview**

Substituir o conteúdo por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import type { SlotKey } from "./banner-presets";
import type { BannerCtaVariant, BannerFormValues } from "./banner-schema";

const CTA_CLASS: Record<BannerCtaVariant, string> = {
	red: "bg-[#e60012] text-white",
	dark: "border border-white bg-[#181818] text-white",
	white: "bg-white text-[#181818]",
	ghost: "border border-white bg-transparent text-white",
};

const CONTENT_POS: Record<BannerFormValues["layout"], string> = {
	split: "left-[7%] top-1/2 -translate-y-1/2 items-start text-left",
	stack_left: "left-[7%] bottom-[14%] items-start text-left",
	center_bottom: "left-1/2 bottom-[14%] -translate-x-1/2 items-center text-center",
	center_mid: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center text-center",
};

function Countdown({ target }: { target: Date }) {
	const ms = Math.max(0, target.getTime() - Date.now());
	const d = Math.floor(ms / 86_400_000);
	const h = Math.floor((ms % 86_400_000) / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return (
		<span className="font-bold text-sm text-white tabular-nums">
			{d}d {h}h {m}m
		</span>
	);
}

export function BannerLivePreview({
	values,
	slots,
}: {
	values: BannerFormValues;
	slots: Record<SlotKey, boolean>;
}) {
	const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
	const isMobile = device === "mobile";

	const bg = slots.background
		? isMobile
			? (values.backgroundImageMobileUrl ?? values.backgroundImageUrl)
			: values.backgroundImageUrl
		: null;
	const product = slots.product
		? isMobile
			? (values.productImageMobileUrl ?? values.productImageUrl)
			: values.productImageUrl
		: null;
	const hasContent =
		(slots.title && values.title) ||
		(slots.badge && values.badgeText) ||
		(slots.countdown && values.countdownTarget);

	return (
		<div className="sticky top-4 flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Preview ao vivo
				</span>
				<div className="flex gap-1 rounded-lg bg-muted p-1">
					<Button onClick={() => setDevice("desktop")} size="sm" variant={isMobile ? "ghost" : "default"}>
						<Monitor className="size-4" /> Desktop
					</Button>
					<Button onClick={() => setDevice("mobile")} size="sm" variant={isMobile ? "default" : "ghost"}>
						<Smartphone className="size-4" /> Mobile
					</Button>
				</div>
			</div>

			<div
				className={cn(
					"relative mx-auto w-full overflow-hidden rounded-lg",
					isMobile ? "aspect-[9/16] max-w-[240px]" : "aspect-video"
				)}
				style={{ background: "radial-gradient(120% 120% at 35% 60%, #2a1a17 0%, #0b0a09 70%)" }}
			>
				{bg ? (
					// biome-ignore lint/performance/noImgElement: preview de URL pública
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img alt="" className="absolute inset-0 size-full object-cover" src={bg} />
				) : (
					<div
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-1/2 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
						style={{ background: "radial-gradient(circle, rgba(230,0,18,0.3), transparent 70%)", filter: "blur(20px)" }}
					/>
				)}

				{product && (
					// biome-ignore lint/performance/noImgElement: preview de URL pública
					// biome-ignore lint/correctness/useImageSize: dimensão via CSS
					<img
						alt=""
						className={cn(
							"absolute top-1/2 size-3/5 -translate-y-1/2 object-contain drop-shadow-[0_24px_24px_rgba(0,0,0,0.6)]",
							values.layout === "split" || values.layout === "stack_left"
								? "right-[6%]"
								: "left-1/2 -translate-x-1/2 top-[8%] translate-y-0"
						)}
						src={product}
					/>
				)}

				{hasContent && (
					<div className={cn("absolute z-10 flex max-w-[70%] flex-col gap-1", CONTENT_POS[values.layout])}>
						{slots.badge && values.badgeText && (
							<span className="inline-block rounded-sm bg-white px-2 py-0.5 font-bold text-[10px] text-[#181818]">
								{values.badgeText}
							</span>
						)}
						{slots.title && values.title && (
							<>
								<p className="font-bold text-white text-xl uppercase leading-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
									{values.title}
								</p>
								<span className="my-1 h-[3px] w-10 bg-[#e60012]" />
							</>
						)}
						{slots.title && values.subtitle && (
							<p className="text-[11px] text-white/85">{values.subtitle}</p>
						)}
						{slots.countdown && values.countdownTarget && (
							<Countdown target={values.countdownTarget} />
						)}
					</div>
				)}

				{slots.cta && values.ctaLabel && (
					<span
						className={cn(
							"absolute z-10 rounded-sm px-3 py-1.5 font-bold text-[11px]",
							CTA_CLASS[values.ctaVariant],
							values.layout === "split" ? "right-[7%] bottom-[12%]" : "left-1/2 bottom-[6%] -translate-x-1/2"
						)}
					>
						{values.ctaLabel} →
					</span>
				)}

				<div className="-translate-x-1/2 absolute bottom-[6%] left-1/2 z-10 flex gap-1">
					<span className="h-[3px] w-4 rounded bg-[#e60012]" />
					<span className="h-[3px] w-4 rounded bg-white/30" />
				</div>
			</div>

			<p className="text-[10px] text-muted-foreground">
				≈ como aparece na home (estilo Ferrari). O texto/posição é aproximação — a render final é do storefront.
			</p>
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS. Se o lint reclamar de ternário aninhado no cálculo de `bg`/`product`, extrair para funções `resolveBg()`/`resolveProduct()` no corpo do componente (sem nested ternary). Não usar any.

- [ ] **Step 3: Smoke visual (controlador faz; subagent não roda dev server)**

(Marcado para a Task 8.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx"
git commit -m "feat(banners): preview reflete layout, variante, badge, countdown e void-black"
```

---

## Task 7: `banner-card.tsx` — indicadores de slot (ajuste leve)

**Files:** Modify `apps/web/src/app/dashboard/site/banners/_components/banner-card.tsx`

- [ ] **Step 1: Adicionar chips de slot no corpo do card**

No `banner-card.tsx`, o corpo atual mostra `title` + linha de CTA. O `title`/`ctaLabel` agora podem ser `null`. Ajustar:
1. Título: usar `item.title ?? "(sem título)"`.
2. Linha de CTA: renderizar só se `item.ctaLabel` presente: `{item.ctaLabel ? \`\${item.ctaLabel} → \${item.ctaHref ?? ""}\` : "sem CTA"}`.
3. Adicionar uma linha de chips discretos indicando slots ativos e a variante, abaixo do título:

```tsx
<div className="mt-1 flex flex-wrap gap-1">
	{item.badgeText && (
		<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">badge</span>
	)}
	{item.countdownTarget && (
		<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">countdown</span>
	)}
	<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">{item.layout}</span>
</div>
```

Garantir que o `<img>` de fundo lide com `item.backgroundImageUrl` possivelmente null: se null, renderizar um placeholder void-black com glow em vez do `<img>` (ex: `<div className="absolute inset-0 bg-black" />` + manter o glow). O `alt` do `<img>` usa `item.altText ?? ""`.

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bun check`
Expected: PASS (campos nullable tratados; sem nested ternary cru — extrair se preciso).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dashboard/site/banners/_components/banner-card.tsx"
git commit -m "feat(banners): card da listagem lida com campos nullable + chips de slot"
```

---

## Task 8: Verificação final + smoke

**Files:** nenhum (verificação)

- [ ] **Step 1: Suíte completa**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: tudo verde (inclui os 10 testes do banner-schema).

- [ ] **Step 2: Aplicar schema e smoke visual** (controlador, logado como super_admin — ADR-0016)

Run: `bun db:sync` (confirmar enums/colunas) + `bun dev:web`, visitar `/dashboard/site/banners/new`. Verificar:
- Clicar cada preset pré-configura os slots certos + layout; cards refletem seleção.
- Ligar/desligar um slot revela/colapsa e limpa os campos.
- Trocar layout/variante atualiza o preview; badge e countdown aparecem no preview.
- Validações: banner vazio → erro `_form`; fundo sem alt → erro no alt; CTA só com rótulo → erro no link; countdown no passado → erro.
- Criar via preset "Imagem pura" (só bg + CTA) e via "Promo full-text" (sem produto). Editar um existente (slots derivados do conteúdo). Publicar; máx 6 ativos.
Conferir erros via `nextjs_call <port> get_errors`.

- [ ] **Step 3: Confirmar sync cross-repo**

Ao mergear na main, `sync-db-schema.yml` abre o PR de schema no ecommerce (enums + colunas + nullability). Registrar no PR que ecommerce#122/#123 dependem desse sync.

---

## Self-Review

**Spec coverage:** §3 schema → Task 1. §6 validação → Task 2. §8 actions → Task 3. §5 presets + §7 sub-componentes → Task 4. §7 form (estado slots/preset, submit) → Task 5. §7 preview upgrade → Task 6. §7 card → Task 7. §11 verificação → Task 8. ✔

**Type consistency:** `BannerFormValues`/`BannerLayout`/`BannerCtaVariant`/`BANNER_LAYOUTS`/`BANNER_CTA_VARIANTS`/`MAX_ACTIVE_BANNERS` (Task 2) usados em Tasks 4-6. `SlotKey`/`SLOT_FIELDS`/`PRESETS`/`BannerPreset` (Task 4) usados em Task 5. `Banner` (Task 1) em Tasks 5,7. `BannerLivePreview` ganha prop `slots` na Task 6 e é chamado com `slots` na Task 5. ✔

**Placeholders:** nenhum. Pontos de "se o lint reclamar…" são instruções de contingência concretas (extrair função), não placeholders. `Reflect.set(obj, field, null)` é a manobra de tipos para zerar campos de slot sem `as any`.

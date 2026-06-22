# Hero Builder: bg mobile seguro + ficha técnica estruturada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver a parte owned-by-dashboard do #229 — tornar o bg mobile seguro por default e adicionar a ficha técnica (`specs`) como dado estruturado, tirando-a da arte queimada.

**Architecture:** Coluna `specs jsonb (string[])` na tabela `banner`; default de `backgroundMobileMode` muda de `inherit` para `none`; refine Zod exige imagem mobile quando modo `custom`; novo slot "Ficha técnica" no builder com editor de lista repetível; aviso não-bloqueante quando `inherit`. A coluna propaga para o `emach-ecommerce` via CI de schema (ADR-0009); o render no storefront é o handoff `emach-ecommerce#158`.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 (push-only), Zod, Vitest, Tailwind, lucide-react.

## Global Constraints

- Schema é **push-only** (ADR-0006): rodar `bun db:sync` após editar `packages/db/src/schema/*.ts`. Sem migrations versionadas.
- Arquivo em `packages/db/src/schema/` **não pode importar de fora de `schema/`** (quebra o sync ecommerce — incidente #88). `banner.ts` só importa de `drizzle-orm/pg-core`.
- Proibido `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`/`@ts-expect-error`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- `key={index}` em `.map()` exige `// biome-ignore lint/suspicious/noArrayIndexKey: <motivo>` documentado.
- Erro de validação de campo **sempre** via `<FieldError>{errors.x}</FieldError>` (`@/components/field-error`) — nunca `<p>` cru com a mensagem (regra ast-grep `raw-validation-error` no CI).
- `revalidateTag` em Next 16 exige 2º arg: `revalidateTag(tag, "max")`.
- Antes de cada commit: `bun check-types`. Antes de fechar: `bun verify` (check-types + check + test). Builder é UI → smoke visual obrigatório (`bun dev:web`, rota `/dashboard/site/banners`).

---

### Task 1: Coluna `specs` + default `none` no schema da tabela `banner`

**Files:**
- Modify: `packages/db/src/schema/banner.ts`

**Interfaces:**
- Produces: coluna `banner.specs` (tipo `string[] | null` no `Banner` inferido); `backgroundMobileMode` passa a default `"none"`. Consumido por Tasks 2–5.

- [ ] **Step 1: Adicionar `jsonb` ao import do drizzle**

Em `packages/db/src/schema/banner.ts`, o import (linhas 2-10) passa de:

```ts
import {
	boolean,
	check,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
```

para (adiciona `jsonb`, ordem alfabética):

```ts
import {
	boolean,
	check,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Trocar o default de `backgroundMobileMode` para `none`**

Linhas 43-45, de:

```ts
		backgroundMobileMode: bannerBackgroundMobileMode("background_mobile_mode")
			.notNull()
			.default("inherit"),
```

para:

```ts
		backgroundMobileMode: bannerBackgroundMobileMode("background_mobile_mode")
			.notNull()
			.default("none"),
```

- [ ] **Step 3: Adicionar a coluna `specs` logo após `subtitle`**

Após a linha `subtitle: text("subtitle"),` (linha 49), inserir:

```ts
			// Ficha técnica do hero: lista de strings curtas (ex: ["1200W", "800 RPM"]).
			// Renderizada como DOM no storefront (#229), não queimada na arte. null/[] = sem painel.
			specs: jsonb("specs").$type<string[]>(),
```

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: PASS (sem erros). `Banner` agora tem `specs: string[] | null`.

- [ ] **Step 5: Aplicar no banco de dev (push-only)**

Run: `bun db:sync`
Expected: aplica `ALTER TABLE banner ADD COLUMN specs jsonb` + `ALTER COLUMN background_mobile_mode SET DEFAULT 'none'`. Ambas não-destrutivas (coluna nullable; troca de default não toca linhas). Sem prompt de rename ambíguo.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/banner.ts
git commit -m "feat(db): coluna specs + default none no banner (#229)"
```

---

### Task 2: Validação Zod — campo `specs` + refine `custom`→imagem mobile

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts`

**Interfaces:**
- Consumes: nada de Task 1 (Zod é independente do Drizzle).
- Produces: `BannerFormValues` ganha `specs: string[] | null`; `bannerFormSchema` rejeita `custom` sem `backgroundImageMobileUrl` (quando há `backgroundImageUrl`) e specs fora dos limites. Consumido por Tasks 3–5.

- [ ] **Step 1: Escrever os testes que falham**

Em `__tests__/banner-schema.test.ts`, primeiro adicionar `specs: null` ao objeto `base` (senão os testes existentes quebram — `specs` é chave obrigatória nullable). O `base` (linhas 4-21) passa a incluir, após `subtitle: null,`:

```ts
	specs: null,
```

Depois adicionar, antes do `it("expõe MAX_ACTIVE_BANNERS...` (linha 116):

```ts
	it("aceita specs nulo, vazio e dentro dos limites", () => {
		expect(bannerFormSchema.safeParse({ ...base, specs: null }).success).toBe(
			true
		);
		expect(bannerFormSchema.safeParse({ ...base, specs: [] }).success).toBe(
			true
		);
		expect(
			bannerFormSchema.safeParse({ ...base, specs: ["1200W", "800 RPM"] })
				.success
		).toBe(true);
	});

	it("rejeita specs com mais de 6 itens", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			specs: ["1", "2", "3", "4", "5", "6", "7"],
		});
		expect(r.success).toBe(false);
	});

	it("rejeita item de spec com mais de 24 caracteres", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			specs: ["a".repeat(25)],
		});
		expect(r.success).toBe(false);
	});

	it("rejeita item de spec vazio", () => {
		const r = bannerFormSchema.safeParse({ ...base, specs: [""] });
		expect(r.success).toBe(false);
	});

	it("exige imagem mobile quando modo custom e há fundo", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundMobileMode: "custom",
			backgroundImageMobileUrl: null,
		});
		expect(r.success).toBe(false);
	});

	it("aceita custom com imagem mobile preenchida", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundMobileMode: "custom",
			backgroundImageMobileUrl:
				"https://x.supabase.co/storage/v1/object/public/banner-images/m.jpg",
		});
		expect(r.success).toBe(true);
	});

	it("ignora exigência de imagem mobile quando não há fundo", () => {
		const r = bannerFormSchema.safeParse({
			...base,
			backgroundImageUrl: null,
			altText: null,
			title: "Só título",
			ctaLabel: null,
			ctaHref: null,
			backgroundMobileMode: "custom",
			backgroundImageMobileUrl: null,
		});
		expect(r.success).toBe(true);
	});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun --cwd apps/web test banner-schema`
Expected: FAIL — os novos casos de `specs` e do refine `custom` falham (campo/refine ainda não existem).

- [ ] **Step 3: Adicionar o campo `specs` ao objeto do schema**

Em `banner-schema.ts`, após `subtitle: optionalText(140),` (linha 35), inserir:

```ts
		specs: z
			.array(z.string().trim().min(1, "Spec vazia").max(24, "Máx 24 caracteres"))
			.max(6, "Máx 6 specs")
			.nullable(),
```

- [ ] **Step 4: Adicionar o refine `custom`→imagem mobile**

Dentro do `.superRefine((v, ctx) => {` , após o bloco do `altText` (linha 62, antes de `const hasLabel`), inserir:

```ts
			if (
				v.backgroundImageUrl &&
				v.backgroundMobileMode === "custom" &&
				!v.backgroundImageMobileUrl
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["backgroundImageMobileUrl"],
					message:
						"Envie uma imagem mobile (9:16) ou troque o modo do fundo no mobile.",
				});
			}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `bun --cwd apps/web test banner-schema`
Expected: PASS (todos, inclusive os antigos com `specs: null` no `base`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts
git commit -m "feat(banners): valida specs e exige bg mobile no modo custom (#229)"
```

---

### Task 3: Persistir `specs` nas server actions

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/actions.ts`

**Interfaces:**
- Consumes: `banner.specs` (Task 1), `BannerFormValues.specs` (Task 2).
- Produces: `createBanner`/`updateBanner` gravam `specs`.

- [ ] **Step 1: Incluir `specs` no insert de `createBanner`**

Em `actions.ts`, no `db.insert(banner).values({...})`, após `subtitle: v.subtitle,` (linha 75), inserir:

```ts
				specs: v.specs,
```

- [ ] **Step 2: Incluir `specs` no update de `updateBanner`**

No `db.update(banner).set({...})`, após `subtitle: v.subtitle,` (linha 131), inserir:

```ts
				specs: v.specs,
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/actions.ts
git commit -m "feat(banners): persiste specs em create/update (#229)"
```

---

### Task 4: Builder — slot "Ficha técnica", editor, default `none`, aviso `inherit`

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/specs-editor.tsx`
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-presets.ts`
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx`

**Interfaces:**
- Consumes: `BannerFormValues.specs` (Task 2), `Banner.specs` (Task 1).
- Produces: `SpecsEditor` (`{ value: string[] | null; onChange: (next: string[]) => void }`); slot `"specs"` em `SlotKey`/`SLOT_FIELDS`/`SLOT_LABELS`.

- [ ] **Step 1: Criar o `SpecsEditor`**

Criar `apps/web/src/app/dashboard/site/banners/_components/specs-editor.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Plus, X } from "lucide-react";

export const MAX_SPECS = 6;
export const MAX_SPEC_LEN = 24;

export function SpecsEditor({
	value,
	onChange,
}: {
	value: string[] | null;
	onChange: (next: string[]) => void;
}) {
	const items = value ?? [];
	return (
		<div className="flex flex-col gap-2">
			{items.map((item, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: lista curta de strings sem ID estável, inputs controlados
				<div className="flex items-center gap-2" key={i}>
					<Input
						maxLength={MAX_SPEC_LEN}
						onChange={(e) => {
							const next = [...items];
							next[i] = e.target.value;
							onChange(next);
						}}
						placeholder="Ex: 1200W"
						value={item}
					/>
					<Button
						aria-label="Remover spec"
						onClick={() => onChange(items.filter((_, j) => j !== i))}
						size="icon"
						type="button"
						variant="ghost"
					>
						<X className="size-4" />
					</Button>
				</div>
			))}
			{items.length < MAX_SPECS && (
				<Button
					className="self-start"
					onClick={() => onChange([...items, ""])}
					size="sm"
					type="button"
					variant="outline"
				>
					<Plus className="size-4" /> Adicionar spec
				</Button>
			)}
			<p className="text-[11px] text-muted-foreground">
				{items.length}/{MAX_SPECS} · cada item até {MAX_SPEC_LEN} caracteres
			</p>
		</div>
	);
}
```

- [ ] **Step 2: Registrar o slot `specs` em `banner-presets.ts`**

No `SlotKey` (linhas 3-9), adicionar `| "specs"` ao final da union:

```ts
export type SlotKey =
	| "background"
	| "product"
	| "title"
	| "badge"
	| "countdown"
	| "cta"
	| "specs";
```

No `SLOT_FIELDS` (linhas 11-18), adicionar a entrada:

```ts
	specs: ["specs"],
```

No `SLOT_LABELS` (linhas 20-27), adicionar:

```ts
	specs: "Ficha técnica",
```

(Os `PRESETS` não precisam mudar — `specs` é opt-in; presets que não o listam o deixam desligado.)

- [ ] **Step 3: Verificar exaustividade de tipos**

Run: `bun check-types`
Expected: PASS. (Se `SlotKey` fosse usado em algum `Record` exaustivo sem `specs`, o build apontaria — `SLOT_FIELDS`/`SLOT_LABELS` já cobertos acima; `ALL_SLOTS` e `deriveSlots` no próximo step.)

- [ ] **Step 4: Wire no `banner-form.tsx` — imports, ALL_SLOTS, EMPTY, initialValues, deriveSlots**

a) Adicionar imports. Após `import { SlotSection } from "./slot-section";` (linha 29):

```tsx
import { SpecsEditor } from "./specs-editor";
import { TriangleAlert } from "lucide-react";
```

(Manter a ordem de imports que o `bun fix` impõe; rode `bun fix` se reclamar.)

b) `ALL_SLOTS` (linhas 31-38) ganha `"specs"`:

```tsx
const ALL_SLOTS: SlotKey[] = [
	"background",
	"product",
	"title",
	"badge",
	"countdown",
	"cta",
	"specs",
];
```

c) `EMPTY` (linhas 62-80): trocar `backgroundMobileMode: "inherit",` por `backgroundMobileMode: "none",` e adicionar `specs: null,` após `subtitle: null,`.

d) `initialValues` (linhas 86-104): adicionar `specs: banner.specs,` após `subtitle: banner.subtitle,`.

e) `deriveSlots` (linhas 107-116): adicionar a chave specs ao objeto retornado:

```tsx
		specs: v.specs !== null && v.specs.length > 0,
```

- [ ] **Step 5: Wire no `banner-form.tsx` — normalizar specs no submit**

Em `handleSubmit`, dentro do `for` que limpa slots off já existe `clean`. Após o `for (const key of ALL_SLOTS) {...}` (linha 185) e antes de `const parsed = bannerFormSchema.safeParse(clean);`, inserir a normalização (remove itens vazios; `[]`→`null`):

```tsx
		if (Array.isArray(clean.specs)) {
			const trimmed = clean.specs
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			clean.specs = trimmed.length > 0 ? trimmed : null;
		}
```

- [ ] **Step 6: Wire no `banner-form.tsx` — aviso `inherit` + erro do bg mobile**

No `SlotSection` de Fundo, logo após o `<div className="grid grid-cols-2 gap-3">...</div>` que contém os `ImageUploadTile` (fecha na linha 251), inserir o `<FieldError>` do bg mobile:

```tsx
						<FieldError>{errors.backgroundImageMobileUrl}</FieldError>
```

Ainda no slot de Fundo, dentro do bloco do seletor de modo, após o `<p className="mt-1.5 text-[11px] text-muted-foreground">{...hint...}</p>` (fecha na linha 285), inserir o aviso:

```tsx
							{values.backgroundMobileMode === "inherit" && (
								<p className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-500">
									<TriangleAlert className="mt-0.5 size-3 shrink-0" />
									Artes widescreen são cortadas no mobile — prefira "Sem fundo"
									ou "Imagem própria".
								</p>
							)}
```

- [ ] **Step 7: Wire no `banner-form.tsx` — `SlotSection` de specs**

Inserir um novo `SlotSection` logo após o de "Título + descrição" (fecha na linha 393) e antes do de "Badge / selo":

```tsx
					<SlotSection
						enabled={slots.specs}
						id="slot-specs"
						onToggle={(on) => toggleSlot("specs", on)}
						title="Ficha técnica"
					>
						<SpecsEditor
							onChange={(next) => set("specs", next)}
							value={values.specs}
						/>
						<FieldError>{errors.specs}</FieldError>
					</SlotSection>
```

- [ ] **Step 8: Verificar tipos, lint e build**

Run: `bun check-types && bun check`
Expected: PASS. Se o lint reclamar de ordem de import, rodar `bun fix` e reconferir.

Run: `bun --cwd apps/web run build`
Expected: build OK (pega erro de hook client em Server Component / `"use server"` re-export que o check-types não vê).

- [ ] **Step 9: Smoke visual**

Run: `bun dev:web` e abrir `/dashboard/site/banners/new`.
Verificar:
- Modo do fundo no mobile já vem em **"Sem fundo"** (default `none`).
- Selecionar **"Herdar desktop"** mostra o aviso âmbar.
- Selecionar **"Imagem própria"** sem enviar a imagem mobile e tentar salvar (com fundo desktop presente) → erro no campo do bg mobile, sem salvar.
- Ligar **"Ficha técnica"**, adicionar/remover itens, contador `X/6`, limite de 24 chars por input.
- Salvar com 2-3 specs → recarregar a edição e confirmar que persistiram (depende da Task 3).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/specs-editor.tsx apps/web/src/app/dashboard/site/banners/_components/banner-presets.ts apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx
git commit -m "feat(banners): editor de ficha técnica + bg mobile seguro (#229)"
```

---

### Task 5: Live preview — renderizar `specs`

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx`

**Interfaces:**
- Consumes: `slots.specs` (Task 4), `values.specs` (Task 2).
- Produces: preview reflete a ficha técnica (espelha o storefront).

- [ ] **Step 1: Incluir specs no cálculo de `hasContent`**

Em `banner-live-preview.tsx`, `hasContent` (linhas 60-63) passa a considerar specs:

```tsx
	const hasContent =
		(slots.title && values.title) ||
		(slots.badge && values.badgeText) ||
		(slots.countdown && values.countdownTarget) ||
		(slots.specs && (values.specs?.length ?? 0) > 0);
```

- [ ] **Step 2: Renderizar a lista de specs no painel de conteúdo**

Dentro do bloco `{hasContent && (...)}`, após o render do subtítulo (`{slots.title && values.subtitle && (...)}`, fecha na linha 155) e antes do countdown, inserir:

```tsx
						{slots.specs && values.specs && values.specs.length > 0 && (
							<ul className="mt-1 flex flex-wrap gap-1">
								{values.specs.map((spec, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: lista curta de strings sem ID estável
									<li
										className="rounded-sm bg-white/15 px-1.5 py-0.5 font-[family-name:var(--font-barlow-condensed)] font-medium text-[10px] text-white uppercase"
										key={i}
									>
										{spec}
									</li>
								))}
							</ul>
						)}
```

- [ ] **Step 3: Verificar tipos e lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 4: Smoke visual**

Run: `bun dev:web`, rota `/dashboard/site/banners/new`. Ligar "Ficha técnica", adicionar specs e ver os chips aparecerem no preview, nos toggles Desktop e Mobile.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/banner-live-preview.tsx
git commit -m "feat(banners): preview da ficha técnica (#229)"
```

---

## Fechamento

- [ ] Rodar `bun verify` (check-types + check + test) — tudo verde.
- [ ] `bun --cwd apps/web run build` verde.
- [ ] Smoke final em `/dashboard/site/banners` (criar, editar, publicar; conferir bg mobile e specs).
- [ ] Ao mergear na `main`: o CI `sync-db-schema.yml` abre PR no `emach-ecommerce` com a coluna `specs`. O render no storefront é o handoff **emach-ecommerce#158** (blocked-by este trabalho).
- [ ] Comentar no #229 que a parte dashboard está concluída e referenciar o PR.

## Self-Review (preenchido)

- **Cobertura do spec:** Parte A (default none — T1/T4; refine custom — T2/T4; aviso inherit — T4) ✓; Parte B (coluna specs — T1; zod — T2; persistência — T3; builder editor — T4; preview — T5) ✓; Parte C (handoff) — fora do plano, rastreado em ecommerce#158 ✓; Parte D (processo) — nota de fechamento ✓.
- **Placeholders:** nenhum — todo step tem código/comando concreto.
- **Consistência de tipos:** `specs: string[] | null` uniforme em `Banner` (T1), `BannerFormValues` (T2), action (T3), `SpecsEditor.value` (T4), preview (T5). `SpecsEditor` exporta `MAX_SPECS`/`MAX_SPEC_LEN`. Slot `"specs"` adicionado em `SlotKey`/`SLOT_FIELDS`/`SLOT_LABELS`/`ALL_SLOTS`/`deriveSlots`. Refine guarda em `v.backgroundImageUrl` para não disparar quando não há fundo.

# Feedback de visibilidade da promoção featured — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar visível no dashboard por que uma promoção destacada (não-)aparece na home do storefront, validando/avisando no form e na listagem.

**Architecture:** Um módulo puro (`featured-home.ts`) concentra os números do contrato do storefront (mín. 2 / teto 4) e a lógica `computeHomeVisibility`. `computeStatus` migra para esse módulo puro para poder ser reusado pelo form (Client Component) sem arrastar `@emach/db`. O zod do form bloqueia featured + `< 2` produtos específicos; o form e o card da listagem consomem `computeHomeVisibility` para indicadores.

**Tech Stack:** Next 16 / React 19, Zod, Vitest (`environment: node`), Tailwind, lucide-react.

## Global Constraints

- `HOME_MIN_PRODUCTS = 2`, `HOME_MAX_PRODUCTS = 4` — espelham o render do storefront (repo `emach-ecommerce`); mudam juntos entre repos.
- **Client Component nunca importa de módulo que puxa `@emach/db`** (P0). Por isso `computeStatus` deve viver em módulo puro (`featured-home.ts`), não em `promotion-query-helpers.ts` (que importa drizzle).
- Erros de validação seguem o padrão do projeto: `<FieldError>` + `aria-invalid`, sem caixa de erro no topo. Nunca `<p>` cru para erro de campo.
- Sem `console.*` (usar `logger`); sem `: any`/`as any`/`@ts-ignore`; sem `key={index}`.
- Bloqueio `< 2` **não** se aplica quando `appliesToAll === true`.
- Gate antes de qualquer commit final: `bun verify` (check-types + check + test). Re-Read arquivo antes de Edit; se Edit falhar com `string not found`, re-Read.
- Conventional Commits em PT, subject ≤ 50 chars.

---

### Task 1: Módulo `featured-home.ts` (contrato + visibilidade) e migração de `computeStatus`

**Files:**
- Create: `apps/web/src/app/dashboard/promotions/_lib/featured-home.ts`
- Create: `apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-home.test.ts`
- Modify: `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts` (remover def local de `computeStatus`; importar do novo módulo)
- Modify: `apps/web/src/app/dashboard/promotions/data.ts:23` (importar `computeStatus` de `./_lib/featured-home`)
- Modify: `apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts:2` (importar `computeStatus` de `../featured-home`)

**Interfaces:**
- Produces:
  - `HOME_MIN_PRODUCTS: 2`, `HOME_MAX_PRODUCTS: 4`
  - `type HomeInvisibleReason = "not_featured" | "inactive" | "expired" | "scheduled" | "too_few_products"`
  - `type HomeVisibility = { visible: true } | { visible: false; reason: HomeInvisibleReason }`
  - `computeStatus(p: { active: boolean; startsAt: Date | null; endsAt: Date | null }): PromotionStatus` (movido para cá)
  - `computeHomeVisibility(input: { featured: boolean; appliesToAll: boolean; toolCount: number; status: PromotionStatus }): HomeVisibility`
- Consumes: `PromotionStatus` de `./promotion-types`.

- [ ] **Step 1: Escrever os testes que falham**

Create `apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-home.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	computeHomeVisibility,
	HOME_MAX_PRODUCTS,
	HOME_MIN_PRODUCTS,
} from "../featured-home";

describe("featured-home constants", () => {
	it("espelha o contrato do storefront", () => {
		expect(HOME_MIN_PRODUCTS).toBe(2);
		expect(HOME_MAX_PRODUCTS).toBe(4);
	});
});

describe("computeHomeVisibility", () => {
	const base = {
		featured: true,
		appliesToAll: false,
		toolCount: 2,
		status: "active" as const,
	};

	it("não-featured não aparece", () => {
		expect(computeHomeVisibility({ ...base, featured: false })).toEqual({
			visible: false,
			reason: "not_featured",
		});
	});

	it("featured + active + 2 produtos específicos aparece", () => {
		expect(computeHomeVisibility(base)).toEqual({ visible: true });
	});

	it("featured + active + 1 produto não aparece (poucos produtos)", () => {
		expect(computeHomeVisibility({ ...base, toolCount: 1 })).toEqual({
			visible: false,
			reason: "too_few_products",
		});
	});

	it("featured + appliesToAll ignora a contagem mínima", () => {
		expect(
			computeHomeVisibility({ ...base, appliesToAll: true, toolCount: 0 })
		).toEqual({ visible: true });
	});

	it("featured inativa não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "inactive" })).toEqual({
			visible: false,
			reason: "inactive",
		});
	});

	it("featured expirada não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "expired" })).toEqual({
			visible: false,
			reason: "expired",
		});
	});

	it("featured agendada ainda não aparece", () => {
		expect(computeHomeVisibility({ ...base, status: "scheduled" })).toEqual({
			visible: false,
			reason: "scheduled",
		});
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test featured-home`
Expected: FAIL — `Cannot find module '../featured-home'`.

- [ ] **Step 3: Criar o módulo**

Create `apps/web/src/app/dashboard/promotions/_lib/featured-home.ts`:

```ts
import type { PromotionStatus } from "./promotion-types";

/**
 * Contrato de renderização da seção de promoção em destaque do storefront
 * (repo emach-ecommerce). Estes números espelham as regras de layout do site e
 * DEVEM ser alterados em conjunto entre os dois repos.
 * Ver docs/integration/admin-ecommerce.md.
 */
export const HOME_MIN_PRODUCTS = 2;
export const HOME_MAX_PRODUCTS = 4;

export type HomeInvisibleReason =
	| "not_featured"
	| "inactive"
	| "expired"
	| "scheduled"
	| "too_few_products";

export type HomeVisibility =
	| { visible: true }
	| { visible: false; reason: HomeInvisibleReason };

/**
 * Status derivado de uma promoção a partir de active + janela de vigência.
 * Vive aqui (módulo puro, sem @emach/db) para ser reusável tanto por código de
 * servidor quanto por Client Components.
 */
export function computeStatus(p: {
	active: boolean;
	startsAt: Date | null;
	endsAt: Date | null;
}): PromotionStatus {
	const now = new Date();
	if (p.endsAt && p.endsAt < now) {
		return "expired";
	}
	if (!p.active) {
		return "inactive";
	}
	if (p.startsAt && p.startsAt > now) {
		return "scheduled";
	}
	return "active";
}

/**
 * Por que uma promoção (não-)aparece na seção de destaque da home.
 * Replica o contrato do storefront: precisa estar featured, ativa, dentro da
 * vigência e — quando aplica a ferramentas específicas — ter ao menos
 * HOME_MIN_PRODUCTS produtos vinculados.
 */
export function computeHomeVisibility(input: {
	featured: boolean;
	appliesToAll: boolean;
	toolCount: number;
	status: PromotionStatus;
}): HomeVisibility {
	if (!input.featured) {
		return { visible: false, reason: "not_featured" };
	}
	if (input.status === "expired") {
		return { visible: false, reason: "expired" };
	}
	if (input.status === "inactive") {
		return { visible: false, reason: "inactive" };
	}
	if (input.status === "scheduled") {
		return { visible: false, reason: "scheduled" };
	}
	if (!input.appliesToAll && input.toolCount < HOME_MIN_PRODUCTS) {
		return { visible: false, reason: "too_few_products" };
	}
	return { visible: true };
}
```

- [ ] **Step 4: Rodar o teste novo e confirmar que passa**

Run: `bun --cwd apps/web test featured-home`
Expected: PASS (8 testes).

- [ ] **Step 5: Migrar `computeStatus` para fora de `promotion-query-helpers.ts`**

Em `apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts`:
1. Remover o bloco `export function computeStatus(...) { ... }` (linhas ~107-123).
2. Adicionar no topo, junto aos imports locais, importando do novo módulo:

```ts
import { computeStatus } from "./featured-home";
```

(O uso interno em `const status = computeStatus(existing)` permanece intacto.)

- [ ] **Step 6: Atualizar `data.ts` para importar do módulo puro**

Em `apps/web/src/app/dashboard/promotions/data.ts`, remover `computeStatus` do import vindo de `./_lib/promotion-query-helpers` (linha ~23) e adicionar:

```ts
import { computeStatus } from "./_lib/featured-home";
```

- [ ] **Step 7: Atualizar o import do teste existente**

Em `apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts` linha 2, trocar:

```ts
import { computeStatus } from "../promotion-query-helpers";
```

por:

```ts
import { computeStatus } from "../featured-home";
```

- [ ] **Step 8: Rodar a suíte de promoções e os tipos**

Run: `bun --cwd apps/web test promotions && bun check-types`
Expected: PASS / sem erros (os testes de `computeStatus` continuam verdes na nova origem).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_lib/featured-home.ts \
        apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-home.test.ts \
        apps/web/src/app/dashboard/promotions/_lib/promotion-query-helpers.ts \
        apps/web/src/app/dashboard/promotions/data.ts \
        apps/web/src/app/dashboard/promotions/_lib/__tests__/promotion-query-helpers.test.ts
git commit -m "feat(promo): modulo featured-home + mover computeStatus"
```

---

### Task 2: Bloqueio zod de `< 2` produtos em promoção destacada

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts` (import + `superRefine`)
- Test: `apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`

**Interfaces:**
- Consumes: `HOME_MIN_PRODUCTS` de `../_lib/featured-home`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts`, adicionar um bloco. O objeto base é uma promoção automática válida:

```ts
import { promotionSchema } from "../promotion-schema";

const featuredBase = {
	type: "promotion" as const,
	title: "Liquida",
	description: null,
	discountType: "percent" as const,
	discountValue: 10,
	appliesToAll: false,
	active: true,
	featured: true,
	startsAt: null,
	endsAt: null,
	toolIds: ["t1", "t2"],
};

describe("promotionSchema — destaque exige 2 produtos", () => {
	it("bloqueia featured + ferramentas específicas + 1 produto", () => {
		const r = promotionSchema.safeParse({ ...featuredBase, toolIds: ["t1"] });
		expect(r.success).toBe(false);
		if (!r.success) {
			const issue = r.error.issues.find((i) => i.path[0] === "toolIds");
			expect(issue?.message).toContain("ao menos 2 produtos");
		}
	});

	it("aceita featured + ferramentas específicas + 2 produtos", () => {
		expect(promotionSchema.safeParse(featuredBase).success).toBe(true);
	});

	it("aceita featured + appliesToAll mesmo sem produtos", () => {
		const r = promotionSchema.safeParse({
			...featuredBase,
			appliesToAll: true,
			toolIds: [],
		});
		expect(r.success).toBe(true);
	});

	it("não aplica o mínimo de 2 quando não é featured (só o de 1)", () => {
		const r = promotionSchema.safeParse({
			...featuredBase,
			featured: false,
			toolIds: ["t1"],
		});
		expect(r.success).toBe(true);
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test promotion-schema`
Expected: FAIL — o caso de 1 produto passa hoje (`r.success === true`), quebrando a asserção.

- [ ] **Step 3: Implementar a regra no `superRefine`**

Em `apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts`:
1. Adicionar import no topo:

```ts
import { HOME_MIN_PRODUCTS } from "../_lib/featured-home";
```

2. No `superRefine` de `promotionSchema`, logo após o bloco `if (!data.appliesToAll && data.toolIds.length < 1)`, inserir:

```ts
// Promoção destacada precisa de ao menos HOME_MIN_PRODUCTS produtos
// específicos para o storefront renderizar a seção da home.
if (
	data.featured &&
	data.type === "promotion" &&
	!data.appliesToAll &&
	data.toolIds.length < HOME_MIN_PRODUCTS
) {
	ctx.addIssue({
		code: "custom",
		message:
			"Promoção destacada precisa de ao menos 2 produtos para aparecer na home",
		path: ["toolIds"],
	});
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test promotion-schema`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-schema.ts \
        apps/web/src/app/dashboard/promotions/_components/__tests__/promotion-schema.test.ts
git commit -m "feat(promo): bloquear destaque com menos de 2 produtos"
```

---

### Task 3: Indicador ao vivo no form (#1) + info de teto (#3)

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx`

**Interfaces:**
- Consumes: `computeStatus`, `computeHomeVisibility`, `HOME_MAX_PRODUCTS` de `../_lib/featured-home`.

Nota: tarefa de UI sem teste unitário próprio (lógica já coberta na Task 1); verificação por smoke visual.

- [ ] **Step 1: Importar os helpers**

No topo de `promotion-form-fields.tsx`, adicionar:

```ts
import {
	computeHomeVisibility,
	computeStatus,
	HOME_MAX_PRODUCTS,
} from "../_lib/featured-home";
```

- [ ] **Step 2: Calcular a visibilidade a partir do estado do form**

Dentro do componente, antes do `return`, derivar:

```ts
const homeVisibility = computeHomeVisibility({
	featured: values.featured,
	appliesToAll: values.appliesToAll,
	toolCount: values.toolIds.length,
	status: computeStatus({
		active: values.active,
		startsAt: values.startsAt ?? null,
		endsAt: values.endsAt ?? null,
	}),
});

const overCap =
	values.featured &&
	!values.appliesToAll &&
	values.toolIds.length > HOME_MAX_PRODUCTS;
```

- [ ] **Step 3: Atualizar a copy e adicionar o indicador sob o switch featured**

Substituir o parágrafo de ajuda do featured (atualmente em `promotion-form-fields.tsx:530-534`) por copy que menciona os 2 produtos e, quando `values.featured`, um indicador do estado atual:

```tsx
<p className="-mt-2 text-muted-foreground text-xs">
	Aparece em destaque no topo da home. Só uma promoção pode ser destaque por
	vez, e ela precisa de ao menos 2 produtos vinculados para aparecer.
</p>
{values.featured &&
	(homeVisibility.visible ? (
		<p className="-mt-1 font-medium text-success text-xs">
			Aparecerá na home.
		</p>
	) : (
		<p className="-mt-1 flex items-start gap-1.5 font-medium text-warning text-xs">
			<AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
			<span>
				{homeVisibility.reason === "too_few_products" &&
					"Não aparecerá na home: faltam produtos (mínimo de 2)."}
				{homeVisibility.reason === "inactive" &&
					"Não aparecerá na home enquanto estiver inativa."}
				{homeVisibility.reason === "expired" &&
					"Não aparecerá na home: vigência expirada."}
				{homeVisibility.reason === "scheduled" &&
					"Aparecerá na home quando a vigência começar."}
			</span>
		</p>
	))}
```

(`reason === "not_featured"` não ocorre aqui pois o bloco só renderiza quando `values.featured`. `AlertCircle` e a cor `text-warning` já são usados neste arquivo.)

- [ ] **Step 4: Adicionar a info de teto no Card "Ferramentas"**

No bloco `!values.appliesToAll` (em torno de `promotion-form-fields.tsx:573-598`), após o aviso de conflito (`conflictCount > 0`), adicionar:

```tsx
{overCap && (
	<div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
		<AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
		<span>
			A home exibe os 4 produtos mais recentes; os demais aparecem só em "Ver
			todas as ofertas".
		</span>
	</div>
)}
```

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 6: Smoke visual**

Run: `bun dev:web` e abrir `/dashboard/promotions/new`.
Conferir:
- Ligar "Destaque no home" com 0/1 produtos específicos → indicador warning "faltam produtos"; com 2 → "Aparecerá na home"; com 5 → indicador ok + aviso de teto.
- Desligar "Ativa" com featured + 2 produtos → indicador "enquanto estiver inativa".
- Trocar para "Todas as ferramentas" com featured → "Aparecerá na home" (sem aviso de teto).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-form-fields.tsx
git commit -m "feat(promo): indicador de visibilidade e teto no form"
```

---

### Task 4: Indicador de visibilidade real no card da listagem

**Files:**
- Modify: `apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx`

**Interfaces:**
- Consumes: `computeHomeVisibility` de `../_lib/featured-home`. `promotion` (`PromotionListItem`) já traz `featured`, `appliesToAll`, `status`, `tools`.

Nota: UI; verificação por smoke visual.

- [ ] **Step 1: Importar o helper e calcular a visibilidade**

No topo de `promotion-card.tsx` adicionar `import { computeHomeVisibility } from "../_lib/featured-home";` e, dentro do componente, derivar:

```ts
const homeVisibility = computeHomeVisibility({
	featured: promotion.featured,
	appliesToAll: promotion.appliesToAll,
	toolCount: promotion.tools.length,
	status: promotion.status,
});
```

- [ ] **Step 2: Substituir o badge estático de destaque**

Trocar o bloco atual (`promotion-card.tsx:48-53`) por um indicador que reflete a visibilidade real. Quando `promotion.featured`:

```tsx
{promotion.featured &&
	(homeVisibility.visible ? (
		<span className="mt-1 inline-flex items-center gap-1 font-medium text-[10px] text-primary uppercase tracking-wide">
			<Star aria-hidden className="size-3 fill-current" />
			Visível na home
		</span>
	) : (
		<span
			className={`mt-1 inline-flex items-center gap-1 font-medium text-[10px] uppercase tracking-wide ${homeVisibility.reason === "scheduled" ? "text-muted-foreground" : "text-warning"}`}
		>
			<AlertTriangle aria-hidden className="size-3" />
			{homeVisibility.reason === "too_few_products" &&
				"Destaque sem efeito: faltam produtos"}
			{homeVisibility.reason === "inactive" &&
				"Destaque sem efeito: inativa"}
			{homeVisibility.reason === "expired" &&
				"Destaque sem efeito: expirada"}
			{homeVisibility.reason === "scheduled" && "Destaque agendado"}
		</span>
	))}
```

- [ ] **Step 3: Atualizar o import de ícones**

Na linha 1, incluir `AlertTriangle` no import do `lucide-react`:

```ts
import { AlertTriangle, Star, Tag, Ticket } from "lucide-react";
```

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 5: Smoke visual**

Run: `bun dev:web` e abrir `/dashboard/promotions`.
Conferir (criar/editar promoções para cobrir os casos):
- Promoção featured ativa com ≥2 produtos → "Visível na home" (Star, primary).
- Promoção featured com 1 produto específico → "Destaque sem efeito: faltam produtos" (warning).
- Promoção featured inativa → "Destaque sem efeito: inativa".
- Promoção não-featured → sem badge.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/promotions/_components/promotion-card.tsx
git commit -m "feat(promo): card mostra visibilidade real na home"
```

---

### Task 5: Documentar o contrato cross-repo

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Adicionar a nota de contrato**

Em `docs/integration/admin-ecommerce.md`, na seção que trata da promoção em destaque (ou ao final, em "Contratos de render"), acrescentar:

```markdown
### Seção de promoção em destaque (home)

O storefront renderiza a promoção `featured` da home com regras de layout que
dependem da quantidade de produtos vinculados:

- **Mínimo de 2 produtos** — com menos de 2 produtos específicos, a seção **não
  renderiza**.
- **Teto de 4 produtos** — a home exibe os 4 mais recentes (`created_at`); os
  demais só em "Ver todas as ofertas".

O dashboard espelha esses números em
`apps/web/src/app/dashboard/promotions/_lib/featured-home.ts`
(`HOME_MIN_PRODUCTS = 2`, `HOME_MAX_PRODUCTS = 4`) para validar/avisar no form e
na listagem. **Alterar o layout no storefront exige atualizar essas constantes
no dashboard junto** (sincronia manual — não há import cross-repo).
```

- [ ] **Step 2: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(promo): registrar contrato de render da home featured"
```

---

### Task 6: Gate final

- [ ] **Step 1: Rodar o gate completo**

Run: `bun verify`
Expected: check-types + check (ultracite) + test todos verdes.

- [ ] **Step 2: Smoke final integrado**

Run: `bun dev:web` — revisitar `/dashboard/promotions/new` e `/dashboard/promotions` confirmando que bloqueio (<2), indicadores e aviso de teto se comportam como nas Tasks 3 e 4 em conjunto.

## Self-Review

**Spec coverage:**
- #1 (clareza featured): Task 3 Step 3 (copy + indicador) + Task 4 (badge real). ✓
- #2 (bloqueio <2): Task 2. ✓
- #3 (info teto): Task 3 Step 4. ✓
- #4 (fora de escopo): não há task — correto. ✓
- Módulo fonte-da-verdade: Task 1. ✓
- Contrato cross-repo doc: Task 5. ✓
- Verificação (bun verify + smoke): Task 6. ✓

**Type consistency:** `computeHomeVisibility`/`computeStatus`/`HomeVisibility`/`HomeInvisibleReason`/`HOME_MIN_PRODUCTS`/`HOME_MAX_PRODUCTS` usados de forma idêntica nas Tasks 1-4. `PromotionStatus` (`"active"|"scheduled"|"expired"|"inactive"`) bate com `computeStatus`. `PromotionListItem` expõe `featured`/`appliesToAll`/`status`/`tools` (confirmado em `data.ts:59`).

**Placeholder scan:** sem TBD/TODO; todo passo de código mostra o código.

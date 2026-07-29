# Banner Builder por Elemento (composition v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o builder de banners acoplado (enum `layout` + presets) por composição por elemento (âncora 3×3 + offset + escala, herança mobile com override), editor canvas-first, mantendo a loja em produção funcionando via dual-write.

**Architecture:** Coluna aditiva `composition` (jsonb) validada por zod no boundary; funções puras para posicionamento/derivação/clamp (todas testadas); um renderer compartilhado (`composition-renderer`) usado pelo canvas do editor e pelo card da listagem; editor client-side com `useReducer` puro. A loja atual continua lendo as colunas legadas, preenchidas por derivação determinística a cada save.

**Tech Stack:** Next 16 (App Router, React 19, React Compiler), Drizzle + Supabase Postgres (push-only), zod, bun test, Tailwind, shadcn/@emach/ui.

**Spec:** `docs/superpowers/specs/2026-07-29-banner-builder-por-elemento-design.md` (ler antes de qualquer task).

## Global Constraints

- CWD é a RAIZ do monorepo — nunca `cd apps/web`; paths absolutos nos comandos.
- Banco Supabase é ÚNICO (dev=prod=ecommerce). NUNCA truncate/drop/reset. O backfill (UPDATE em massa, Task 5) **só roda com autorização explícita do user na sessão** — a task entrega o script, não a execução.
- Ordem de rollout (incidente #240): `bun db:sync` ANTES de deploy de código que lê/escreve `composition`.
- Proibido: `any`/`@ts-ignore`, `console.*` em app code (usar `logger` de `apps/web/src/lib/logger.ts`), `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais, barrel files, `.forEach` em hot path, `font-serif` fora de h1/wordmark.
- Classes Tailwind sempre estáticas (nunca interpolar nome de classe); valores dinâmicos via `style`/CSS vars.
- `revalidateTag("site-banners", "max")` — SEMPRE com o 2º argumento (Next 16).
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit falhar com "string not found", re-Read o arquivo antes de retentar.
- Gate por task: `bun check-types` (com turbo cache limpo se suspeito: `--force`) + `bun check`; gate final `bun verify`.
- Commits: Conventional Commits em PT, subject ≤50 chars, ZERO atribuição de AI.
- Testes com `bun:test` (`import { describe, expect, test } from "bun:test"`), espelhando `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts`.

## File Structure (resultado final)

```
apps/web/src/app/dashboard/site/banners/
  _components/composition/
    composition-schema.ts        # types + zod + clamps + defaults + pilha segura (Task 1)
    derive-legacy.ts             # composition→layout legado e layout→composition (Task 2)
    placement-css.ts             # âncora/offset/focal/gradiente → CSS (Task 6)
    templates.ts                 # 4 templates de partida (Task 8)
    composition-renderer.tsx     # renderer puro compartilhado (Tasks 7 e 12)
    safe-stack.tsx               # pilha segura mobile (Task 12)
    __tests__/*.test.ts
  _components/editor/
    editor-reducer.ts            # estado puro do editor (Task 9)
    anchor-picker.tsx            # picker 3×3 (Task 10)
    element-rail.tsx             # rail de camadas (Task 10)
    inspector.tsx                # painel contextual (Task 10)
    editor-canvas.tsx            # canvas + drag (Task 11)
    banner-editor.tsx            # orquestração + submit (Task 11)
    __tests__/editor-reducer.test.ts
  actions.ts                     # dual-write (Task 4)
  new/page.tsx, [id]/edit/page.tsx  # trocam BannerForm→BannerEditor (Task 11)
  _components/banner-card.tsx    # usa composition-renderer (Task 14)
apps/web/scripts/backfill-banner-composition.ts  # one-off (Task 5)
packages/db/src/schema/banner.ts # coluna composition (Task 3)
REMOVIDOS na Task 14: banner-form.tsx, banner-live-preview.tsx, banner-layout-pos.ts,
  layout-picker.tsx, preset-cards.tsx, banner-presets.ts
MANTIDOS/reusados: banner-schema.ts (conteúdo), image-upload-tile.tsx, specs-editor.tsx,
  countdown-field.tsx, cta-variant-picker.tsx, cta-variant-class.ts, delete-banner-dialog.tsx,
  banner-list.tsx
```

---

## Fase 1 — Fundação

### Task 1: composition-schema.ts (types, zod, clamps, pilha segura)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/composition-schema.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/composition-schema.test.ts`

**Interfaces:**
- Produces: `ANCHORS`, `Anchor9`, `ELEMENT_KEYS`, `ElementKey`, `TEXT_KEYS`, `ElementPlacement`, `BackgroundConfig`, `MobileOverride`, `BannerComposition`, `compositionSchema`, `SAFE_STACK_ORDER: ElementKey[]`, `SAFE_AREA`, `anchorBasePosition(anchor, viewport): {x,y}`, `clampOffsets(anchor, viewport, offsetX, offsetY): {offsetX,offsetY}`, `SCALE_BOUNDS: Record<ElementKey,[number,number]>`, `DEFAULT_COMPOSITION: BannerComposition`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
import { describe, expect, test } from "bun:test";
import {
  clampOffsets,
  compositionSchema,
  DEFAULT_COMPOSITION,
  SAFE_STACK_ORDER,
} from "../composition-schema";

const base = () => structuredClone(DEFAULT_COMPOSITION);

describe("compositionSchema", () => {
  test("DEFAULT_COMPOSITION é válida", () => {
    expect(compositionSchema.safeParse(DEFAULT_COMPOSITION).success).toBe(true);
  });
  test("version desconhecida falha", () => {
    const c = { ...base(), version: 2 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("âncora inválida falha", () => {
    const c = base();
    c.desktop.elements.title = { anchor: "xx" as never, offsetX: 0, offsetY: 0, scale: 100 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("offset fora de ±20 falha", () => {
    const c = base();
    c.desktop.elements.title = { anchor: "bl", offsetX: 21, offsetY: 0, scale: 100 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("escala de produto 50–160: 49 falha, 160 passa", () => {
    const c = base();
    c.desktop.elements.product = { anchor: "mr", offsetX: 0, offsetY: 0, scale: 49 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
    c.desktop.elements.product.scale = 160;
    expect(compositionSchema.safeParse(c).success).toBe(true);
  });
  test("escala de CTA 80–140: 79 falha", () => {
    const c = base();
    c.desktop.elements.cta = { anchor: "br", offsetX: 0, offsetY: 0, scale: 79 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("maxWidth só em texto: 12–80", () => {
    const c = base();
    c.desktop.elements.title = { anchor: "bl", offsetX: 0, offsetY: 0, scale: 100, maxWidth: 81 };
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("zoom do fundo 100–200: 201 falha", () => {
    const c = base();
    c.desktop.background.zoom = 201;
    expect(compositionSchema.safeParse(c).success).toBe(false);
  });
  test("override mobile aceita hidden OU placement", () => {
    const c = base();
    c.mobile.elements.specs = { hidden: true };
    c.mobile.elements.title = { anchor: "tc", offsetX: 0, offsetY: 4, scale: 90 };
    expect(compositionSchema.safeParse(c).success).toBe(true);
  });
});

describe("SAFE_STACK_ORDER", () => {
  test("ordem fixa do spec", () => {
    expect(SAFE_STACK_ORDER).toEqual([
      "badge", "title", "specs", "subtitle", "countdown", "product", "cta",
    ]);
  });
});

describe("clampOffsets", () => {
  test("âncora bl no desktop não deixa sair pela esquerda", () => {
    // base x=5; x+offset ≥ 2 → offsetX ≥ -3
    expect(clampOffsets("bl", "desktop", -20, 0).offsetX).toBe(-3);
  });
  test("âncora br no mobile não invade a faixa dos dots", () => {
    // base y=84 (mobile); y+offset ≤ 84 → offsetY ≤ 0
    expect(clampOffsets("br", "mobile", 0, 10).offsetY).toBe(0);
  });
  test("dentro dos limites passa intacto", () => {
    expect(clampOffsets("mc", "desktop", 10, -10)).toEqual({ offsetX: 10, offsetY: -10 });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bun test apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/composition-schema.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar `composition-schema.ts`**

```ts
import { z } from "zod";

export const ANCHORS = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
export type Anchor9 = (typeof ANCHORS)[number];

export const ELEMENT_KEYS = [
  "badge", "title", "subtitle", "specs", "countdown", "product", "cta",
] as const;
export type ElementKey = (typeof ELEMENT_KEYS)[number];
export const TEXT_KEYS = ["badge", "title", "subtitle", "specs", "countdown"] as const;

export const SCALE_BOUNDS: Record<ElementKey, [number, number]> = {
  badge: [60, 160], title: [60, 160], subtitle: [60, 160],
  specs: [60, 160], countdown: [60, 160],
  product: [50, 160], cta: [80, 140],
};

const OFFSET = z.number().min(-20).max(20);

function placementSchema(scale: [number, number], withMaxWidth: boolean) {
  const shape = {
    anchor: z.enum(ANCHORS),
    offsetX: OFFSET,
    offsetY: OFFSET,
    scale: z.number().int().min(scale[0]).max(scale[1]),
  };
  if (!withMaxWidth) {
    return z.object(shape);
  }
  return z.object({ ...shape, maxWidth: z.number().int().min(12).max(80).optional() });
}

const textPlacement = placementSchema([60, 160], true);
const productPlacement = placementSchema([50, 160], false);
const ctaPlacement = placementSchema([80, 140], false);

const backgroundSchema = z.object({
  zoom: z.number().int().min(100).max(200),
  focal: z.enum(ANCHORS),
});

const hidden = z.object({ hidden: z.literal(true) });

const desktopElements = z.object({
  badge: textPlacement.optional(),
  title: textPlacement.optional(),
  subtitle: textPlacement.optional(),
  specs: textPlacement.optional(),
  countdown: textPlacement.optional(),
  product: productPlacement.optional(),
  cta: ctaPlacement.optional(),
});

const mobileElements = z.object({
  badge: z.union([hidden, textPlacement]).optional(),
  title: z.union([hidden, textPlacement]).optional(),
  subtitle: z.union([hidden, textPlacement]).optional(),
  specs: z.union([hidden, textPlacement]).optional(),
  countdown: z.union([hidden, textPlacement]).optional(),
  product: z.union([hidden, productPlacement]).optional(),
  cta: z.union([hidden, ctaPlacement]).optional(),
});

export const compositionSchema = z.object({
  version: z.literal(1),
  desktop: z.object({ background: backgroundSchema, elements: desktopElements }),
  mobile: z.object({ background: backgroundSchema.optional(), elements: mobileElements }),
});

export type BannerComposition = z.infer<typeof compositionSchema>;
export type ElementPlacement = z.infer<typeof textPlacement>;
export type BackgroundConfig = z.infer<typeof backgroundSchema>;
export type MobileOverride = NonNullable<z.infer<typeof mobileElements>[ElementKey]>;
export type Viewport = "desktop" | "mobile";

// Pilha segura mobile — ordem fixa (spec §Pilha segura).
export const SAFE_STACK_ORDER: ElementKey[] = [
  "badge", "title", "specs", "subtitle", "countdown", "product", "cta",
];

// Área segura em % do container; bottom reserva a faixa dos dots do carrossel.
export const SAFE_AREA = { x: 2, top: 2, bottom: { desktop: 10, mobile: 16 } } as const;

// Posição-base do ponto de referência de cada âncora (% do container).
export function anchorBasePosition(anchor: Anchor9, viewport: Viewport) {
  const col = anchor[1] === "l" ? 5 : anchor[1] === "c" ? 50 : 95;
  const bottomRow = viewport === "desktop" ? 88 : 84;
  const row = anchor[0] === "t" ? 5 : anchor[0] === "m" ? 50 : bottomRow;
  return { x: col, y: row };
}

export function clampOffsets(
  anchor: Anchor9, viewport: Viewport, offsetX: number, offsetY: number,
) {
  const { x, y } = anchorBasePosition(anchor, viewport);
  const maxY = 100 - SAFE_AREA.bottom[viewport];
  const cx = Math.min(Math.max(offsetX, SAFE_AREA.x - x), 98 - x);
  const cy = Math.min(Math.max(offsetY, SAFE_AREA.top - y), maxY - y);
  return {
    offsetX: Math.min(Math.max(cx, -20), 20),
    offsetY: Math.min(Math.max(cy, -20), 20),
  };
}

// Default = equivalente ao layout "split" atual.
export const DEFAULT_COMPOSITION: BannerComposition = {
  version: 1,
  desktop: {
    background: { zoom: 100, focal: "mc" },
    elements: {
      title: { anchor: "bl", offsetX: 2, offsetY: -2, scale: 100, maxWidth: 44 },
      subtitle: { anchor: "bl", offsetX: 2, offsetY: 4, scale: 100, maxWidth: 44 },
      product: { anchor: "mr", offsetX: -1, offsetY: 0, scale: 100 },
      cta: { anchor: "br", offsetX: -2, offsetY: 0, scale: 100 },
    },
  },
  mobile: { elements: {} },
};
```

- [ ] **Step 4: Rodar testes até passar**

Run: `bun test apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/composition-schema.test.ts`
Expected: PASS (todos). Depois `bun check-types` e `bun check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/composition
git commit -m "feat(banners): schema da composition v1"
```

### Task 2: derive-legacy.ts (dual-write + mapa de backfill)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/derive-legacy.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/derive-legacy.test.ts`

**Interfaces:**
- Consumes: `BannerComposition`, `Anchor9`, `SCALE_BOUNDS`, `DEFAULT_COMPOSITION` (Task 1); `BannerLayout` de `../banner-schema` (existente: union dos 8 layouts).
- Produces: `deriveLegacyLayout(c: BannerComposition): { layout: BannerLayout; productScale: number; ctaScale: number }`; `legacyToComposition(input: { layout: BannerLayout; productScale: number; ctaScale: number; hasTitle: boolean; hasSubtitle: boolean; hasBadge: boolean; hasSpecs: boolean; hasCountdown: boolean; hasProduct: boolean; hasCta: boolean }): BannerComposition`

- [ ] **Step 1: Escrever os testes (falhando)**

```ts
import { describe, expect, test } from "bun:test";
import { BANNER_LAYOUTS } from "../../banner-schema";
import { deriveLegacyLayout, legacyToComposition } from "../derive-legacy";

const ALL_ON = {
  hasTitle: true, hasSubtitle: true, hasBadge: true, hasSpecs: true,
  hasCountdown: true, hasProduct: true, hasCta: true,
  productScale: 110, ctaScale: 120,
};

describe("round-trip legado", () => {
  for (const layout of BANNER_LAYOUTS) {
    test(`${layout}: legacyToComposition → deriveLegacyLayout = identidade`, () => {
      const c = legacyToComposition({ layout, ...ALL_ON });
      const d = deriveLegacyLayout(c);
      expect(d.layout).toBe(layout);
      expect(d.productScale).toBe(110);
      expect(d.ctaScale).toBe(120);
    });
  }
});

describe("deriveLegacyLayout", () => {
  test("escala fora do CHECK legado é clampada", () => {
    const c = legacyToComposition({ layout: "split", ...ALL_ON });
    if (c.desktop.elements.cta) {
      c.desktop.elements.cta.scale = 80;
    }
    // CHECK legado de ctaScale é 80–140 — 80 passa direto
    expect(deriveLegacyLayout(c).ctaScale).toBe(80);
  });
  test("composição sem título nem produto cai no fallback split", () => {
    const c = legacyToComposition({
      layout: "split", ...ALL_ON, hasTitle: false, hasProduct: false,
      hasSubtitle: false, hasBadge: false, hasSpecs: false, hasCountdown: false,
    });
    expect(deriveLegacyLayout(c).layout).toBe("split");
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `bun test .../composition/__tests__/derive-legacy.test.ts` (path completo)
Expected: FAIL (module not found).

- [ ] **Step 3: Implementar `derive-legacy.ts`**

O mapa direto (layout → placements) é a fonte; a derivação inversa classifica pelo trio de âncoras. Valores calcados em `banner-layout-pos.ts` atual (título/produto/CTA por layout):

```ts
import type { BannerLayout } from "../banner-schema";
import type { Anchor9, BannerComposition, ElementPlacement } from "./composition-schema";

type Trio = { title: Anchor9; product: Anchor9 | null; cta: Anchor9 };

// Fonte única do mapeamento (espelha banner-layout-pos.ts / LAYOUT_CONFIG da loja).
const LEGACY_TRIO: Record<BannerLayout, Trio> = {
  split: { title: "bl", product: "mr", cta: "br" },
  stack_left: { title: "bl", product: "mr", cta: "bc" },
  center_bottom: { title: "bc", product: "tc", cta: "bc" },
  center_mid: { title: "mc", product: null, cta: "bc" },
  center_cta_right: { title: "ml", product: "tc", cta: "br" },
  mirror_split: { title: "mr", product: "ml", cta: "br" },
  hero_center: { title: "tc", product: "mc", cta: "bc" },
  text_right: { title: "tc", product: "mc", cta: "br" },
};

const p = (anchor: Anchor9, scale = 100, maxWidth?: number): ElementPlacement =>
  maxWidth === undefined
    ? { anchor, offsetX: 0, offsetY: 0, scale }
    : { anchor, offsetX: 0, offsetY: 0, scale, maxWidth };

export function legacyToComposition(input: {
  layout: BannerLayout; productScale: number; ctaScale: number;
  hasTitle: boolean; hasSubtitle: boolean; hasBadge: boolean; hasSpecs: boolean;
  hasCountdown: boolean; hasProduct: boolean; hasCta: boolean;
}): BannerComposition {
  const trio = LEGACY_TRIO[input.layout];
  const elements: BannerComposition["desktop"]["elements"] = {};
  // Badge/specs/countdown/subtítulo acompanham o bloco do título no legado.
  if (input.hasBadge) { elements.badge = p(trio.title); }
  if (input.hasTitle) { elements.title = p(trio.title, 100, 44); }
  if (input.hasSpecs) { elements.specs = p(trio.title, 100, 44); }
  if (input.hasSubtitle) { elements.subtitle = p(trio.title, 100, 44); }
  if (input.hasCountdown) { elements.countdown = p(trio.title); }
  if (input.hasProduct && trio.product !== null) {
    elements.product = p(trio.product, input.productScale);
  }
  if (input.hasCta) { elements.cta = p(trio.cta, input.ctaScale); }
  return {
    version: 1,
    desktop: { background: { zoom: 100, focal: "mc" }, elements },
    mobile: { elements: {} },
  };
}

const col = (a: Anchor9) => a[1] as "l" | "c" | "r";
const row = (a: Anchor9) => a[0] as "t" | "m" | "b";

export function deriveLegacyLayout(c: BannerComposition): {
  layout: BannerLayout; productScale: number; ctaScale: number;
} {
  const e = c.desktop.elements;
  const title = e.title?.anchor ?? e.subtitle?.anchor ?? e.badge?.anchor ?? null;
  const product = e.product?.anchor ?? null;
  const cta = e.cta?.anchor ?? null;

  let layout: BannerLayout = "split"; // fallback
  if (title !== null) {
    const tc = col(title);
    const tr = row(title);
    if (tc === "l" && product !== null && col(product) === "r") {
      layout = cta !== null && col(cta) === "r" ? "split" : "stack_left";
    } else if (tc === "l") {
      layout = "center_cta_right";
    } else if (tc === "r") {
      layout = "mirror_split";
    } else if (tr === "b") {
      layout = "center_bottom";
    } else if (tr === "m") {
      layout = "center_mid";
    } else {
      // texto no topo-centro: hero_center vs text_right pelo CTA
      layout = cta !== null && col(cta) === "r" ? "text_right" : "hero_center";
    }
  }
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  return {
    layout,
    productScale: clamp(e.product?.scale ?? 100, 50, 160),
    ctaScale: clamp(e.cta?.scale ?? 100, 80, 140),
  };
}
```

- [ ] **Step 4: Rodar testes até passar**

Run: `bun test .../composition/__tests__/derive-legacy.test.ts` → PASS. `bun check-types && bun check`.
Atenção: se o round-trip de algum layout falhar, ajustar `deriveLegacyLayout` (a tabela `LEGACY_TRIO` é a verdade; a classificação precisa reproduzi-la nos 8).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners/_components/composition
git commit -m "feat(banners): derivação legado ↔ composition"
```

### Task 3: Coluna `composition` no Drizzle + push

**Files:**
- Modify: `packages/db/src/schema/banner.ts`

**Interfaces:**
- Produces: `banner.composition` (jsonb, nullable) tipada como o JSON da composition; `Banner["composition"]`.

- [ ] **Step 1: Adicionar a coluna** (seguir o padrão da coluna `specs` no mesmo arquivo)

```ts
// Composição por elemento (spec 2026-07-29). Estrutura validada por zod no app
// (apps/web .../composition/composition-schema.ts); NULL = banner pré-backfill.
composition: jsonb("composition").$type<{
  version: 1;
  desktop: Record<string, unknown>;
  mobile: Record<string, unknown>;
} | null>(),
```

Nota: o pacote `@emach/db` não importa zod do app (sem ciclo). O tipo estreito vive no app; aqui só o envelope `{version, desktop, mobile}`. No boundary do app, `compositionSchema.parse()` produz o tipo forte.

- [ ] **Step 2: Push do schema**

Run: `bun db:sync`
Expected: coluna criada sem prompt destrutivo (é ADD COLUMN puro). Se pedir rename ambíguo, abortar e investigar — não deveria.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types --force`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/banner.ts
git commit -m "feat(db): coluna composition no banner"
```

Nota: o CI de sync (ADR-0009) abrirá PR espelhando o schema no repo ecommerce após merge na main — esperado, não requer ação.

### Task 4: Dual-write nas server actions

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts` (adicionar campo opcional)
- Modify: `apps/web/src/app/dashboard/site/banners/actions.ts` (`createBanner`, `updateBanner`)
- Test: ampliar `apps/web/src/app/dashboard/site/banners/_components/__tests__/banner-schema.test.ts`

**Interfaces:**
- Consumes: `compositionSchema`, `DEFAULT_COMPOSITION` (Task 1), `deriveLegacyLayout` (Task 2).
- Produces: `bannerFormSchema` com `composition: compositionSchema.optional()`; actions que, quando `composition` presente, gravam a coluna E os campos legados derivados (`layout`, `productScale`, `ctaScale`).

- [ ] **Step 1: Teste (falhando)** — acrescentar ao arquivo de teste existente (não alterar os 17 casos atuais):

```ts
import { DEFAULT_COMPOSITION } from "../composition/composition-schema";

// dentro do describe existente do bannerFormSchema, novos casos:
test("composition ausente continua válida (form legado)", () => {
  // reusar o fixture válido já existente no arquivo, sem composition
  expect(bannerFormSchema.safeParse(VALIDO).success).toBe(true);
});
test("composition válida passa", () => {
  expect(
    bannerFormSchema.safeParse({ ...VALIDO, composition: DEFAULT_COMPOSITION }).success,
  ).toBe(true);
});
test("composition malformada falha", () => {
  expect(
    bannerFormSchema.safeParse({ ...VALIDO, composition: { version: 9 } }).success,
  ).toBe(false);
});
```

(`VALIDO` = o objeto-base válido que o arquivo de teste já usa — verificar o nome real ao abrir o arquivo e usar esse.)

- [ ] **Step 2: Rodar e confirmar falha** (`composition` desconhecida no schema → `success:false` no caso 2)

- [ ] **Step 3: Implementar**

Em `banner-schema.ts`, no objeto do `bannerFormSchema` (antes do `superRefine`):

```ts
composition: compositionSchema.optional(),
```

com `import { compositionSchema } from "./composition/composition-schema";`.

Em `actions.ts`, no `createBanner` e no `updateBanner`, após o `safeParse` bem-sucedido (`v` = dados validados), montar os valores persistidos:

```ts
import { deriveLegacyLayout } from "./_components/composition/derive-legacy";

// ...dentro da action, antes do insert/update:
const legacy = v.composition ? deriveLegacyLayout(v.composition) : null;
const persisted = {
  ...v,
  ...(legacy === null
    ? {}
    : {
        layout: legacy.layout,
        productScale: legacy.productScale,
        ctaScale: legacy.ctaScale,
        composition: v.composition,
      }),
};
```

e usar `persisted` no `db.insert(banner).values(...)` / `db.update(banner).set(...)` no lugar de `v`. Quando `composition` é `undefined` (form legado, ainda vivo até a Task 11), nada muda — a coluna não é tocada.

- [ ] **Step 4: Rodar tudo**

Run: `bun test apps/web/src/app/dashboard/site/banners` → PASS (17 antigos + 3 novos + Tasks 1-2). `bun check-types && bun check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/banners packages/db
git commit -m "feat(banners): dual-write composition + legado"
```

### Task 5: Script de backfill (entregar, NÃO executar)

**Files:**
- Create: `apps/web/scripts/backfill-banner-composition.ts`

**Interfaces:**
- Consumes: `legacyToComposition` (Task 2), `db`/`banner` de `@emach/db`.

- [ ] **Step 1: Implementar o script**

```ts
// One-off: preenche banner.composition onde NULL, a partir do layout legado.
// Idempotente (WHERE composition IS NULL). Rodar: bun apps/web/scripts/backfill-banner-composition.ts
// ⚠️ Banco único dev=prod — rodar SOMENTE com autorização explícita do user na sessão.
import { db } from "@emach/db";
import { banner } from "@emach/db/schema/banner";
import { eq, isNull } from "drizzle-orm";
import { legacyToComposition } from "../src/app/dashboard/site/banners/_components/composition/derive-legacy";

const rows = await db.select().from(banner).where(isNull(banner.composition));
for (const row of rows) {
  const composition = legacyToComposition({
    layout: row.layout,
    productScale: row.productScale,
    ctaScale: row.ctaScale,
    hasTitle: row.title !== null,
    hasSubtitle: row.subtitle !== null,
    hasBadge: row.badgeText !== null,
    hasSpecs: row.specs !== null && row.specs.length > 0,
    hasCountdown: row.countdownTarget !== null,
    hasProduct: row.productImageUrl !== null,
    hasCta: row.ctaLabel !== null && row.ctaHref !== null,
  });
  await db.update(banner).set({ composition }).where(eq(banner.id, row.id));
  process.stdout.write(`backfilled ${row.id} (${row.layout})\n`);
}
process.stdout.write(`total: ${rows.length}\n`);
```

Ajustar o import de `db`/`banner` ao padrão real do pacote (`@emach/db` exporta `db` e o schema; conferir `packages/db/src/index.ts`). Se o script não resolver env fora do Next, seguir o padrão do script de seed existente no repo (mesmo mecanismo de carregar env).

- [ ] **Step 2: Verificar tipos e lint**

Run: `bun check-types && bun check` → PASS. (Sem teste unit próprio: a lógica de mapeamento já é coberta pelo round-trip da Task 2; o script é I/O fino.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/scripts/backfill-banner-composition.ts
git commit -m "feat(banners): script de backfill da composition"
```

**A execução do backfill fica pro rollout (fim da Fase 4), com autorização explícita do user.**

---

## Fase 2 — Editor desktop

### Task 6: placement-css.ts (âncora/offset/zoom/focal/gradiente → CSS)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/placement-css.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/placement-css.test.ts`

**Interfaces:**
- Consumes: `Anchor9`, `ElementPlacement`, `BackgroundConfig`, `BannerComposition`, `anchorBasePosition` (Task 1).
- Produces: `placementToStyle(p: ElementPlacement, viewport: Viewport): CSSProperties`; `focalToObjectPosition(focal: Anchor9): string`; `backgroundToStyle(bg: BackgroundConfig): CSSProperties`; `textSide(c: BannerComposition): "left" | "right" | "center"`; `GRADIENT_CLASS: Record<"left" | "right" | "center", string>`.

- [ ] **Step 1: Testes (falhando)**

```ts
import { describe, expect, test } from "bun:test";
import {
  backgroundToStyle, focalToObjectPosition, placementToStyle, textSide,
} from "../placement-css";
import { DEFAULT_COMPOSITION } from "../composition-schema";

describe("placementToStyle", () => {
  test("bl desktop: left 7%, top 86%, translate 0/-100%", () => {
    const s = placementToStyle(
      { anchor: "bl", offsetX: 2, offsetY: -2, scale: 100 }, "desktop",
    );
    expect(s.left).toBe("7%");
    expect(s.top).toBe("86%");
    expect(s.transform).toBe("translate(0%, -100%) scale(1)");
  });
  test("mc: translate -50%/-50% e escala aplicada", () => {
    const s = placementToStyle(
      { anchor: "mc", offsetX: 0, offsetY: 0, scale: 120 }, "desktop",
    );
    expect(s.transform).toBe("translate(-50%, -50%) scale(1.2)");
  });
  test("maxWidth vira ch", () => {
    const s = placementToStyle(
      { anchor: "bl", offsetX: 0, offsetY: 0, scale: 100, maxWidth: 44 }, "desktop",
    );
    expect(s.maxWidth).toBe("44ch");
  });
});

describe("fundo", () => {
  test("focal tl → 0% 0%; br → 100% 100%", () => {
    expect(focalToObjectPosition("tl")).toBe("0% 0%");
    expect(focalToObjectPosition("br")).toBe("100% 100%");
  });
  test("zoom 150 vira scale 1.5 com origin no focal", () => {
    const s = backgroundToStyle({ zoom: 150, focal: "tl" });
    expect(s.transform).toBe("scale(1.5)");
    expect(s.transformOrigin).toBe("0% 0%");
  });
});

describe("textSide", () => {
  test("default (título bl) → left", () => {
    expect(textSide(DEFAULT_COMPOSITION)).toBe("left");
  });
});
```

- [ ] **Step 2: Confirmar falha** (module not found)

- [ ] **Step 3: Implementar**

```ts
import type { CSSProperties } from "react";
import {
  type Anchor9, anchorBasePosition, type BackgroundConfig,
  type BannerComposition, type ElementPlacement, type Viewport,
} from "./composition-schema";

const TX = { l: "0%", c: "-50%", r: "-100%" } as const;
const TY = { t: "0%", m: "-50%", b: "-100%" } as const;
const PCT = { l: "0%", c: "50%", r: "100%", t: "0%", m: "50%", b: "100%" } as const;

export function placementToStyle(p: ElementPlacement, viewport: Viewport): CSSProperties {
  const base = anchorBasePosition(p.anchor, viewport);
  const style: CSSProperties = {
    left: `${base.x + p.offsetX}%`,
    top: `${base.y + p.offsetY}%`,
    transform: `translate(${TX[p.anchor[1] as "l" | "c" | "r"]}, ${TY[p.anchor[0] as "t" | "m" | "b"]}) scale(${p.scale / 100})`,
    transformOrigin: `${PCT[p.anchor[1] as "l" | "c" | "r"]} ${PCT[p.anchor[0] as "t" | "m" | "b"]}`,
  };
  if (p.maxWidth !== undefined) {
    style.maxWidth = `${p.maxWidth}ch`;
  }
  return style;
}

export function focalToObjectPosition(focal: Anchor9): string {
  return `${PCT[focal[1] as "l" | "c" | "r"]} ${PCT[focal[0] as "t" | "m" | "b"]}`;
}

export function backgroundToStyle(bg: BackgroundConfig): CSSProperties {
  return {
    transform: `scale(${bg.zoom / 100})`,
    transformOrigin: focalToObjectPosition(bg.focal),
  };
}

export function textSide(c: BannerComposition): "left" | "right" | "center" {
  const a = c.desktop.elements.title?.anchor ?? c.desktop.elements.subtitle?.anchor;
  if (a === undefined) { return "center"; }
  return a[1] === "l" ? "left" : a[1] === "r" ? "right" : "center";
}

// Direção do gradiente de legibilidade (classes estáticas — Tailwind JIT).
export const GRADIENT_CLASS: Record<"left" | "right" | "center", string> = {
  left: "bg-gradient-to-r from-black/80 via-black/20 to-transparent",
  right: "bg-gradient-to-l from-black/80 via-black/20 to-transparent",
  center: "bg-gradient-to-t from-black/85 via-black/30 to-transparent",
};
```

- [ ] **Step 4: PASS + `bun check-types && bun check`**

- [ ] **Step 5: Commit** — `git commit -m "feat(banners): placement→CSS puro"`

### Task 7: composition-renderer.tsx (viewport desktop)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/composition-renderer.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 6; `CTA_VARIANT_CLASS`/`CTA_BASE` de `../cta-variant-class` (existentes); tipo `Banner` de `@emach/db/schema/banner`.
- Produces:

```ts
export type RendererBanner = Pick<Banner,
  | "backgroundImageUrl" | "backgroundImageMobileUrl" | "backgroundMobileMode"
  | "productImageUrl" | "productImageMobileUrl" | "title" | "subtitle" | "specs"
  | "altText" | "badgeText" | "ctaLabel" | "ctaHref" | "ctaVariant" | "countdownTarget">;

export function CompositionRenderer(props: {
  banner: RendererBanner;
  composition: BannerComposition;
  viewport: Viewport;
  selected?: ElementKey | "background" | null;   // outline coral no selecionado (editor)
  onElementPointerDown?: (key: ElementKey, e: React.PointerEvent) => void;
}): JSX.Element;
```

- [ ] **Step 1: Implementar (sem teste unit — lógica pura já coberta nas Tasks 1/6; validação é visual no smoke)**

Estrutura interna (copiar o visual do `banner-live-preview.tsx` atual — fontes Barlow, cores `#da291c`/`#0b0a09`, gradiente radial de marca — mas posicionando cada elemento por `placementToStyle`):

```tsx
"use client";

// Renderer compartilhado: canvas do editor, card da listagem e implementação
// de referência pro storefront (issue no repo ecommerce).
import Image from "next/image";
import type { PointerEvent } from "react";
import { CTA_BASE, CTA_VARIANT_CLASS } from "../cta-variant-class";
import {
  type BannerComposition, type ElementKey, SAFE_STACK_ORDER, type Viewport,
} from "./composition-schema";
import {
  backgroundToStyle, focalToObjectPosition, GRADIENT_CLASS, placementToStyle, textSide,
} from "./placement-css";
// ... RendererBanner (Pick acima)

function resolveBg(banner: RendererBanner, c: BannerComposition, viewport: Viewport) {
  if (viewport === "desktop") { return banner.backgroundImageUrl; }
  switch (banner.backgroundMobileMode) {
    case "none": return null;
    case "custom": return banner.backgroundImageMobileUrl ?? banner.backgroundImageUrl;
    default: return banner.backgroundImageUrl;
  }
}

export function CompositionRenderer({ banner, composition, viewport, selected, onElementPointerDown }: Props) {
  const bgUrl = resolveBg(banner, composition, viewport);
  const bgCfg = viewport === "mobile"
    ? (composition.mobile.background ?? composition.desktop.background)
    : composition.desktop.background;
  const elements = /* Task 12 introduz partition p/ mobile; aqui (fase 2) só desktop: */
    composition.desktop.elements;
  const hasText = Boolean(banner.title || banner.subtitle);
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0b0a09]">
      {/* gradiente radial de marca por baixo (igual ao preview atual) */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #2a1a17 0%, #0b0a09 70%)" }} />
      {bgUrl !== null && (
        <div className="absolute inset-0" style={backgroundToStyle(bgCfg)}>
          <Image alt={banner.altText ?? ""} className="object-cover" fill sizes="100vw" src={bgUrl}
            style={{ objectPosition: focalToObjectPosition(bgCfg.focal) }} />
        </div>
      )}
      {hasText && (
        <div aria-hidden="true" className={`absolute inset-0 ${GRADIENT_CLASS[textSide(composition)]}`} />
      )}
      {/* um bloco absoluto por elemento presente em `elements`, na ordem SAFE_STACK_ORDER
          para z-index estável; cada bloco: style={placementToStyle(placement, viewport)},
          data-element={key}, onPointerDown={(e) => onElementPointerDown?.(key, e)},
          outline coral quando selected === key.
          Conteúdo por elemento (mesmo markup/classes do banner-live-preview.tsx atual):
          badge → pill branco uppercase; title → Barlow Condensed uppercase + régua vermelha;
          subtitle → texto branco/85; specs → chips "· spec"; countdown → snapshot congelado
          "Xd Xh Xm" (useState(() => Date.now()), igual ao preview atual — sem ticker);
          product → <Image fill object-contain> com drop-shadow;
          cta → CTA_BASE + CTA_VARIANT_CLASS[banner.ctaVariant] + "{label} →". */}
    </div>
  );
}
```

O comentário acima é o contrato do markup — implementar copiando os blocos correspondentes do `banner-live-preview.tsx` (Read ele antes; as classes exatas de título/badge/specs/countdown/CTA já existem lá e devem ser preservadas 1:1 para fidelidade visual).

- [ ] **Step 2: `bun check-types && bun check`** → PASS

- [ ] **Step 3: Commit** — `git commit -m "feat(banners): composition-renderer desktop"`

### Task 8: templates.ts

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/templates.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/templates.test.ts`

**Interfaces:**
- Produces: `BANNER_TEMPLATES: { key: string; label: string; hint: string; composition: BannerComposition; slots: ElementKey[] }[]` (4 itens: `produto`, `promo-central`, `countdown`, `imagem-pura`).

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, expect, test } from "bun:test";
import { compositionSchema } from "../composition-schema";
import { BANNER_TEMPLATES } from "../templates";

describe("BANNER_TEMPLATES", () => {
  test("são 4 e todas as compositions validam", () => {
    expect(BANNER_TEMPLATES.length).toBe(4);
    for (const t of BANNER_TEMPLATES) {
      expect(compositionSchema.safeParse(t.composition).success).toBe(true);
    }
  });
  test("slots batem com os elementos presentes", () => {
    for (const t of BANNER_TEMPLATES) {
      expect(Object.keys(t.composition.desktop.elements).toSorted()).toEqual(
        t.slots.toSorted(),
      );
    }
  });
});
```

- [ ] **Step 2: Confirmar falha → Step 3: Implementar**

```ts
import { DEFAULT_COMPOSITION, type BannerComposition, type ElementKey } from "./composition-schema";

const t = (
  key: string, label: string, hint: string, composition: BannerComposition,
) => ({
  key, label, hint, composition,
  slots: Object.keys(composition.desktop.elements) as ElementKey[],
});

export const BANNER_TEMPLATES = [
  t("produto", "Produto em destaque", "fundo + produto à direita + texto + CTA",
    DEFAULT_COMPOSITION),
  t("promo-central", "Promo central", "badge + texto centralizado + CTA", {
    version: 1,
    desktop: {
      background: { zoom: 100, focal: "mc" },
      elements: {
        badge: { anchor: "mc", offsetX: 0, offsetY: -14, scale: 100 },
        title: { anchor: "mc", offsetX: 0, offsetY: -4, scale: 110, maxWidth: 60 },
        subtitle: { anchor: "mc", offsetX: 0, offsetY: 6, scale: 100, maxWidth: 60 },
        cta: { anchor: "bc", offsetX: 0, offsetY: 0, scale: 100 },
      },
    },
    mobile: { elements: {} },
  }),
  t("countdown", "Countdown", "produto + contador + CTA", {
    version: 1,
    desktop: {
      background: { zoom: 100, focal: "mc" },
      elements: {
        title: { anchor: "bl", offsetX: 2, offsetY: -8, scale: 100, maxWidth: 44 },
        countdown: { anchor: "bl", offsetX: 2, offsetY: -2, scale: 110 },
        product: { anchor: "mr", offsetX: -1, offsetY: 0, scale: 100 },
        cta: { anchor: "br", offsetX: -2, offsetY: 0, scale: 100 },
      },
    },
    mobile: { elements: {} },
  }),
  t("imagem-pura", "Imagem pura", "só a arte + CTA", {
    version: 1,
    desktop: {
      background: { zoom: 100, focal: "mc" },
      elements: { cta: { anchor: "bc", offsetX: 0, offsetY: 0, scale: 100 } },
    },
    mobile: { elements: {} },
  }),
] as const;
```

- [ ] **Step 4: PASS + gates → Step 5: Commit** — `git commit -m "feat(banners): templates de partida"`

### Task 9: editor-reducer.ts (estado puro do editor)

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/editor-reducer.ts`
- Test: `apps/web/src/app/dashboard/site/banners/_components/editor/__tests__/editor-reducer.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 8; `BannerFormValues` de `../banner-schema` (existente).
- Produces:

```ts
export type EditorSelection = ElementKey | "background" | null;
export type EditorState = {
  content: BannerFormValues;            // campos de conteúdo (sem composition)
  composition: BannerComposition;
  viewport: Viewport;
  selected: EditorSelection;
  dirty: boolean;
};
export type EditorAction =
  | { type: "select"; target: EditorSelection }
  | { type: "setViewport"; viewport: Viewport }
  | { type: "applyTemplate"; templateKey: string }
  | { type: "toggleElement"; key: ElementKey; enabled: boolean }
  | { type: "setPlacement"; key: ElementKey; placement: ElementPlacement }   // no viewport atual
  | { type: "drag"; key: ElementKey; deltaX: number; deltaY: number }        // em % do container
  | { type: "setBackground"; config: BackgroundConfig }                      // no viewport atual
  | { type: "setContent"; patch: Partial<BannerFormValues> }
  | { type: "setMobileOverride"; key: ElementKey; override: MobileOverride | null }; // null = volta a herdar
export function editorReducer(state: EditorState, action: EditorAction): EditorState;
export function initialEditorState(banner: Banner | null): EditorState;
```

Regras a implementar (todas testadas):
- `drag`: soma delta ao offset do placement do viewport atual e aplica `clampOffsets`. No viewport mobile, se o elemento não tem override (herda), o drag **cria** o override a partir de `{anchor:"mc", offsetX:0, offsetY:0, scale:100}` clampado — é o "arrastar ativa override" do spec.
- `toggleElement` com `enabled:false`: remove o placement desktop, o override mobile E limpa os campos de conteúdo do elemento (mesmo mapa slot→campos do form atual: badge→badgeText; title→title; subtitle→subtitle; specs→specs; countdown→countdownTarget; product→productImageUrl+productImageMobileUrl; cta→ctaLabel+ctaHref). `enabled:true`: cria placement default do elemento (usar o do `DEFAULT_COMPOSITION` quando existir; senão `{anchor:"mc", offsetX:0, offsetY:0, scale:100}` com bounds do elemento).
- `applyTemplate`: substitui `composition` pela do template e limpa conteúdo dos slots ausentes.
- `initialEditorState(banner)`: banner nulo → `EMPTY` de conteúdo (mesmos defaults do form atual) + `DEFAULT_COMPOSITION`; banner existente → mapeia colunas → `content` e usa `banner.composition` parseada (`compositionSchema.parse`); se `null`, converte na hora com `legacyToComposition` (mesmos flags `has*` do backfill).
- Toda action seta `dirty: true`, exceto `select` e `setViewport`.

- [ ] **Step 1: Testes (falhando)** — cobrir: drag clampa; drag no mobile cria override; toggle off limpa conteúdo; toggle on restaura placement; applyTemplate troca composition e limpa slots; setMobileOverride null volta a herdar; initialEditorState com banner sem composition converte do legado. Exemplo dos dois primeiros:

```ts
import { describe, expect, test } from "bun:test";
import { editorReducer, initialEditorState } from "../editor-reducer";

const s0 = initialEditorState(null);

describe("drag", () => {
  test("desktop: clampa offset na área segura", () => {
    const s1 = editorReducer(
      { ...s0, selected: "title" },
      { type: "drag", key: "title", deltaX: -50, deltaY: 0 },
    );
    // título default: anchor bl (base x=5, offsetX 2) → mínimo -3
    expect(s1.composition.desktop.elements.title?.offsetX).toBe(-3);
    expect(s1.dirty).toBe(true);
  });
  test("mobile: drag em elemento herdado cria override", () => {
    const s1 = editorReducer(
      { ...s0, viewport: "mobile" },
      { type: "drag", key: "title", deltaX: 0, deltaY: 5 },
    );
    const o = s1.composition.mobile.elements.title;
    expect(o !== undefined && !("hidden" in o)).toBe(true);
  });
});
```

- [ ] **Step 2: Confirmar falha → Step 3: Implementar o reducer** (função pura, sem side effects; `structuredClone` no estado aninhado antes de mutar) **→ Step 4: PASS + gates**

- [ ] **Step 5: Commit** — `git commit -m "feat(banners): reducer do editor"`

### Task 10: anchor-picker, element-rail, inspector

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/anchor-picker.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/element-rail.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/inspector.tsx`

**Interfaces:**
- Consumes: Tasks 1 e 9; componentes existentes `image-upload-tile`, `specs-editor`, `countdown-field`, `cta-variant-picker`, e primitivos de `@emach/ui` (Input, Slider, Switch, Button, Label).
- Produces:

```ts
// anchor-picker.tsx
export function AnchorPicker(props: { value: Anchor9; onChange: (a: Anchor9) => void }): JSX.Element;
// element-rail.tsx — rótulos PT: Badge, Título, Descrição, Ficha técnica, Countdown, Produto, Botão
export function ElementRail(props: {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
}): JSX.Element;
// inspector.tsx
export function Inspector(props: {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  errors: Record<string, string>;      // erros de validação por campo (do submit)
}): JSX.Element;
```

- [ ] **Step 1: AnchorPicker** — grid 3×3 de botões (`grid grid-cols-3 gap-1`), cada célula `aria-label` com o nome da zona em PT ("superior esquerda"…), célula ativa com `bg-primary`; genérico (usado por posição de elemento E ponto focal do fundo).

- [ ] **Step 2: ElementRail** — lista vertical dos 7 elementos na ordem `ELEMENT_KEYS`, cada linha: Switch (dispatch `toggleElement`), label PT, clique seleciona (`select`). Elemento desligado em `text-muted-foreground`. No viewport mobile, badge textual à direita: `herdado` (sem override), `override` (com placement), `oculto` (hidden) + botão "resetar" (dispatch `setMobileOverride` null) quando há override/hidden. Entrada fixa "Fundo" no rodapé (seleciona `"background"`). Sem drag-reorder (a ordem da pilha é fixa).

- [ ] **Step 3: Inspector** — render condicional pelo `state.selected`:
  - Elemento: `AnchorPicker` + dois `Slider` de offset (−20..20, step 1) + `Slider` de escala (bounds de `SCALE_BOUNDS[key]`, step 5) + `Slider` de largura máx (12..80) só para `TEXT_KEYS`; abaixo, os campos de conteúdo do elemento (mesmos inputs/limites do form atual: título 80, descrição 140, badge 16, CTA label 30 + href + `CtaVariantPicker`, uploads de produto, `SpecsEditor`, `CountdownField`). No viewport mobile com elemento herdado: mostrar aviso "Herdando a pilha segura — arraste no canvas ou clique em Personalizar" + botão "Personalizar" (dispatch `setMobileOverride` com placement default) + botão "Ocultar no mobile" (`{hidden:true}`).
  - `"background"`: `ImageUploadTile` desktop/mobile + seletor de modo mobile (3 botões, textos atuais do form) + `Slider` zoom (100..200, step 5) + `AnchorPicker` do focal + campo altText.
  - `null`: dica "Selecione um elemento no canvas ou no painel esquerdo".
  - Todos os dispatches de conteúdo via `setContent`; os de placement via `setPlacement`/`setBackground`.

- [ ] **Step 4: Gates** — `bun check-types && bun check` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(banners): rail, inspector e anchor-picker"`

### Task 11: editor-canvas + banner-editor + wiring das páginas

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/editor-canvas.tsx`
- Create: `apps/web/src/app/dashboard/site/banners/_components/editor/banner-editor.tsx`
- Modify: `apps/web/src/app/dashboard/site/banners/new/page.tsx` (troca `BannerForm` → `BannerEditor`)
- Modify: `apps/web/src/app/dashboard/site/banners/[id]/edit/page.tsx` (idem, com `banner`)

**Interfaces:**
- Consumes: Tasks 7, 8, 9, 10; `createBanner`/`updateBanner` (Task 4); `notify`/toast e `reportValidationError` conforme usados no `banner-form.tsx` atual (Read antes).
- Produces: `export function BannerEditor({ banner }: { banner?: Banner }): JSX.Element`.

- [ ] **Step 1: EditorCanvas** — wrapper `relative` com `aspect-video` (desktop) ou `aspect-[9/16] max-w-[300px] mx-auto` (mobile). Renderiza `CompositionRenderer` com `onElementPointerDown`. Drag com pointer events (`setPointerCapture`); converter delta de px → % do container (`delta / rect.width * 100`, idem height) e despachar `{type:"drag"}` a cada `pointermove` (o clamp é do reducer). Durante drag, mostrar grid 3×3 fantasma (`opacity-40`, linhas `border-dashed border-white/15`). Clique simples sem movimento = só `select`.

- [ ] **Step 2: BannerEditor** — client component:
  - `useReducer(editorReducer, banner ?? null, initialEditorState)`.
  - Topbar: toggle Desktop/Mobile (dois botões com ícones Monitor/Smartphone), Switch "Publicar", aviso estático `text-muted-foreground text-xs`: "O site renderiza uma aproximação deste banner até a loja atualizar.", botão Salvar (`useTransition`).
  - Na criação (sem `banner`): faixa de templates acima do canvas (4 cards pequenos com `label`/`hint`; clique = `applyTemplate`); some após qualquer edição (`dirty`).
  - Grid: `lg:grid-cols-[220px_1fr_320px]` → `ElementRail` | `EditorCanvas` | `Inspector`.
  - Submit: monta `{ ...state.content, composition: state.composition }`, valida com `bannerFormSchema.safeParse` (mesmo fluxo de erros do form atual: toast + foco), chama `createBanner`/`updateBanner`, sucesso → toast + `router.push("/dashboard/site/banners")` + `router.refresh()`.

- [ ] **Step 3: Wiring** — nas duas páginas, substituir o import/uso de `BannerForm` por `BannerEditor` (mesmas props). NÃO deletar `banner-form.tsx` ainda (Task 14).

- [ ] **Step 4: Gates + smoke**

Run: `bun check-types --force && bun check` → PASS.
Smoke: `bun dev:web`, abrir `/dashboard/site/banners/new` — criar banner com template "Produto em destaque", arrastar título, salvar; reabrir em edit e conferir persistência (composition + layout derivado via card antigo na listagem). Erros de runtime: `nextjs_call <port> get_errors`.

- [ ] **Step 5: Commit** — `git commit -m "feat(banners): editor canvas-first desktop"`

---

## Fase 3 — Mobile

### Task 12: Pilha segura + renderer mobile

**Files:**
- Create: `apps/web/src/app/dashboard/site/banners/_components/composition/safe-stack.tsx`
- Modify: `apps/web/src/app/dashboard/site/banners/_components/composition/composition-schema.ts` (adiciona `partitionMobileElements`)
- Modify: `apps/web/src/app/dashboard/site/banners/_components/composition/composition-renderer.tsx`
- Test: `apps/web/src/app/dashboard/site/banners/_components/composition/__tests__/partition.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 6, 7.
- Produces: `partitionMobileElements(c: BannerComposition): { stacked: ElementKey[]; positioned: [ElementKey, ElementPlacement][]; hidden: ElementKey[] }` (exportada de `composition-schema.ts`); `SafeStack` (componente interno do renderer mobile).

- [ ] **Step 1: Teste de `partitionMobileElements` (falhando)**

```ts
import { describe, expect, test } from "bun:test";
import { DEFAULT_COMPOSITION, partitionMobileElements } from "../composition-schema";

describe("partitionMobileElements", () => {
  test("sem overrides: tudo que existe no desktop vai pra pilha, na ordem fixa", () => {
    const r = partitionMobileElements(DEFAULT_COMPOSITION);
    expect(r.stacked).toEqual(["title", "subtitle", "product", "cta"]);
    expect(r.positioned).toEqual([]);
    expect(r.hidden).toEqual([]);
  });
  test("override posiciona; hidden esconde; resto continua na pilha", () => {
    const c = structuredClone(DEFAULT_COMPOSITION);
    c.mobile.elements.title = { anchor: "tc", offsetX: 0, offsetY: 2, scale: 90 };
    c.mobile.elements.subtitle = { hidden: true };
    const r = partitionMobileElements(c);
    expect(r.stacked).toEqual(["product", "cta"]);
    expect(r.positioned.map(([k]) => k)).toEqual(["title"]);
    expect(r.hidden).toEqual(["subtitle"]);
  });
});
```

- [ ] **Step 2: Confirmar falha → Step 3: Implementar**

`partitionMobileElements` em `composition-schema.ts`: itera `SAFE_STACK_ORDER`, considera só keys presentes em `desktop.elements`; override com `hidden` → `hidden[]`; override placement → `positioned[]`; sem override → `stacked[]`.

`safe-stack.tsx`: flex-col empilhando os `stacked` na ordem recebida, ancorado na base do container acima da faixa reservada (`absolute inset-x-[5%] bottom-[16%] flex flex-col items-start gap-3`), produto centralizado (`self-center h-[38%] w-[82%] relative`), CTA full-width (mesmo markup do renderer). Recebe `banner`, `keys: ElementKey[]` e reusa as mesmas sub-renders de elemento do renderer (extrair a render de cada elemento do Task 7 pra função interna compartilhada `renderElement(key, banner, style?)` no próprio arquivo do renderer, exportada apenas dentro do módulo composition).

No `composition-renderer.tsx`, quando `viewport === "mobile"`: usar `partitionMobileElements`; `positioned` renderiza absoluto via `placementToStyle(p, "mobile")`; `stacked` via `SafeStack`; `hidden` não renderiza. Fundo mobile: `composition.mobile.background ?? composition.desktop.background` (já feito na Task 7).

- [ ] **Step 4: PASS + gates → Step 5: Commit** — `git commit -m "feat(banners): pilha segura e renderer mobile"`

### Task 13: Modo mobile no editor

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/_components/editor/editor-canvas.tsx`
- Modify: `apps/web/src/app/dashboard/site/banners/_components/editor/banner-editor.tsx`

**Interfaces:**
- Consumes: Tasks 9–12 (reducer já tem `setViewport`/`setMobileOverride`/drag-cria-override; rail já mostra badges; inspector já tem "Personalizar"/"Ocultar").

- [ ] **Step 1: Canvas mobile** — toggle do topbar troca `state.viewport`; canvas vira `aspect-[9/16]`; elementos da pilha (herdados) recebem `data-inherited` e cursor `grab` com dica; iniciar drag num herdado despacha `drag` normal (o reducer cria o override — comportamento já testado na Task 9). Elementos `positioned` arrastam como no desktop.

- [ ] **Step 2: Smoke completo dos dois viewports**

`bun dev:web`: criar banner, alternar pra mobile, conferir pilha; arrastar título → vira override (badge no rail muda); "resetar" volta pra pilha; "Ocultar no mobile" some do canvas; salvar e reabrir preservando tudo.

- [ ] **Step 3: Gates + commit** — `bun check-types --force && bun check` → `git commit -m "feat(banners): modo mobile do editor"`

---

## Fase 4 — Listagem e consolidação

### Task 14: banner-card no renderer novo + remoção dos legados

**Files:**
- Modify: `apps/web/src/app/dashboard/site/banners/_components/banner-card.tsx`
- Delete: `banner-form.tsx`, `banner-live-preview.tsx`, `banner-layout-pos.ts`, `layout-picker.tsx`, `preset-cards.tsx`, `banner-presets.ts` (todos em `_components/`)

- [ ] **Step 1: banner-card** — substituir o miolo visual (que usa `CONTENT_POS`/`PRODUCT_POS`/`CTA_POS`) por `<CompositionRenderer banner={banner} composition={parsed} viewport="desktop" />` dentro do thumb `aspect-video`. `parsed` = `compositionSchema.safeParse(banner.composition)`; quando falha/null (janela pré-backfill), renderizar via `legacyToComposition` na hora. Ícones Monitor/Smartphone de cobertura mantidos.

- [ ] **Step 2: Deletar os 6 arquivos legados** e corrigir todos os imports quebrados (`rg -l "banner-layout-pos|banner-presets|BannerForm|LayoutPicker|PresetCards|BannerLivePreview" apps/web/src`). `cta-variant-class.ts` FICA (renderer usa).

- [ ] **Step 3: Gate integral**

Run: `bun verify` (check-types + check + test) → PASS integral.

- [ ] **Step 4: Smoke "3 provas"** — funcional: fluxo criar/editar/ativar/reordenar/deletar completo no dev; perceptual: screenshot do card e do canvas lado a lado com um banner pré-existente (fidelidade com o que o preview antigo mostrava); dados: conferir no banco (`select id, layout, composition->>'version' from banner`) que dual-write está populando os dois lados.

- [ ] **Step 5: Commit** — `git commit -m "refactor(banners): renderer único e fim dos presets"`

**Checkpoint de rollout (pedir autorização ao user):** `bun db:sync` já aplicado (Task 3); rodar agora `bun apps/web/scripts/backfill-banner-composition.ts` — UPDATE em massa no banco compartilhado, **exige ok explícito do user nesta sessão**.

---

## Fase 5 — Handoff pro ecommerce

### Task 15: Contrato no docs + issue detalhada no repo emach-ecommerce

**Files:**
- Modify: `docs/integration/admin-ecommerce.md` (seção "Render do hero (banner)")
- Create (temporário, scratchpad): corpo da issue

- [ ] **Step 1: Atualizar `docs/integration/admin-ecommerce.md`** — reescrever a seção do hero: `composition` é a fonte de verdade da composição; documentar o shape v1 (copiar os types da Task 1), semântica de âncora/offset/escala/área segura (valores de `SAFE_AREA`/`anchorBasePosition`), pilha segura (`SAFE_STACK_ORDER` + partition), fundo (zoom/focal + modos mobile), gradiente automático (`textSide`), e o período de transição: colunas legadas (`layout`, `productScale`, `ctaScale`) continuam sendo derivadas a cada save ATÉ o storefront migrar; depois disso viram deprecated.

- [ ] **Step 2: Escrever a issue** (arquivo no scratchpad, depois `gh issue create`). Estrutura do corpo:
  - Contexto: link pro spec do dashboard + PR; por que (fim do LAYOUT_CONFIG duplicado, issue #130).
  - Contrato completo da composition v1 (types + semântica, copiado do doc do Step 1).
  - Implementação de referência: `apps/web/src/app/dashboard/site/banners/_components/composition/{composition-schema.ts,placement-css.ts,composition-renderer.tsx,safe-stack.tsx}` no repo do dashboard (paths exatos).
  - Tarefas pro storefront: (1) ler `composition` no `HeroBanner`; (2) renderer genérico por placement substituindo `LAYOUT_CONFIG` (manter parallax/float/glow/autoplay como estão); (3) pilha segura mobile = comportamento atual formalizado; (4) fallback: `composition NULL` → render legado; (5) avisar o dashboard pra remover o dual-write quando estiver no ar.
  - Critério de aceite: paridade visual com o canvas do dashboard nos 4 templates + nos banners ativos de produção.

- [ ] **Step 3: Criar a issue**

```bash
gh issue create -R othavi0/emach-ecommerce \
  -t "Hero: renderizar banner.composition (builder por elemento)" \
  -F <arquivo-do-corpo>
```

**Antes de rodar: reler o corpo procurando qualquer atribuição de AI (proibida).** Confirmar o slug do repo com `gh repo view othavi0/emach-ecommerce` (ajustar se o owner/nome divergir).

- [ ] **Step 4: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs: contrato da composition no integration"
```

---

## Self-review do plano (executado na escrita)

- Cobertura do spec: decisões 1–11 → Tasks 15/1/9/12/1/8/6/1/10/4/11 respectivamente; fases 1–5 do spec = fases 1–5 do plano; guard-rails preservados (validações intocadas em banner-schema, clamp na Task 1, gradiente na Task 6, MAX_ACTIVE_BANNERS não tocado).
- Tipos consistentes entre tasks (Interfaces blocks); `partitionMobileElements` definida na Task 12 e exportada de `composition-schema.ts`.
- Riscos sinalizados: round-trip da Task 2 é o teste-guarda do dual-write; fidelidade visual do renderer valida no smoke da Task 14 (3 provas); backfill gated por autorização explícita.

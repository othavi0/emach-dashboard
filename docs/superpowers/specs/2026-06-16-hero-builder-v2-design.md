# Design — Hero Builder v2 (presets + tamanhos + fonte)

> Status: **aprovado** (brainstorming 2026-06-16). Sucessor do #186 (fidelidade do CTA).
> Escopo: spec único coeso, **build incremental** por fatias. Cross-repo (dashboard + storefront `emach-ecommerce`).

## Contexto

O builder de banner do hero (`apps/web/src/app/dashboard/site/banners/`) hoje oferece 4 presets de layout fixos e nenhum controle de tamanho. O banner é persistido na tabela `banner` (DB compartilhado) e **renderizado de verdade pelo storefront** (`emach-ecommerce`, `hero-carousel.tsx`). O preview do dashboard é aproximação.

Logo, toda feature aqui é **cross-repo**: o dashboard guarda/preview, o storefront honra. Schema sincroniza dashboard → ecommerce por CI (ADR-0009).

## Decisões (brainstorming)

1. **Arquitetura híbrida**: presets (enum) pra **posição** + sliders contínuos pra **tamanho**. Não virou eixos 100% componíveis (storefront viraria matriz; consistência de marca sofreria).
2. **Tamanho = slider contínuo** (componente `Slider` do design system), percentual inteiro, default 100:
   - `product_scale`: **50–160%**
   - `cta_scale`: **80–140%**
   - Storefront aplica `scale = valor/100` sobre o tamanho-base. Bounds validados (zod + CHECK no DB) → valor fora do limite nunca chega no storefront.
3. **8 presets** no `bannerLayout`: 4 atuais (`split`, `stack_left`, `center_bottom`, `center_mid`) + 4 novos:
   - `center_cta_right` — produto centro, texto esquerda, CTA direita-baixo (o pedido original).
   - `mirror_split` — produto esquerda, texto direita, CTA direita-baixo (espelho do split; alterna slides).
   - `hero_center` — produto dominante centro, texto topo-centro, CTA centro-baixo.
   - `text_right` — produto esquerda, texto+CTA agrupados à direita.
4. **Fonte**: self-host **Barlow** (corpo/CTA) + **Barlow Condensed** (títulos/labels) no dashboard via `next/font/google`, **escopado ao preview** (não troca o `font-sans` global do chrome). Sem pacote cross-repo (storefront já tem as fontes).

## Mudanças — Schema (`packages/db/src/schema/banner.ts`)

- `bannerLayout` pgEnum: adicionar os 4 valores novos. **Push-only (ADR-0006)**: `ALTER TYPE ... ADD VALUE` via `db:sync`. Enum só cresce (sem remover).
- Novas colunas:
  ```ts
  productScale: integer("product_scale").notNull().default(100),
  ctaScale: integer("cta_scale").notNull().default(100),
  ```
- CHECK de bounds (via `triggers.sql`/declarativo): `product_scale BETWEEN 50 AND 160`, `cta_scale BETWEEN 80 AND 140`.
- `bun db:sync` aplica; CI sincroniza pro ecommerce.

## Mudanças — Schema do form (`_components/banner-schema.ts`)

- `BANNER_LAYOUTS`: + os 4 valores.
- Campos: `productScale: z.number().int().min(50).max(160)`, `ctaScale: z.number().int().min(80).max(140)`.

## Mudanças — Dashboard form

- **Presets**: o seletor de layout (preset cards) ganha os 4 novos com thumbnail/diagrama. Fonte única dos diagramas: reusar mini-render do preset.
- **Sliders**: na seção "Produto central", slider `Tamanho da ferramenta` (50–160); na seção "Botão (CTA)", slider `Tamanho do botão` (80–140). Estilo `Slider` do design system, label com valor `%` ao lado. Default 100.
- Persistência via server action existente de banner (incluir os 2 campos novos no insert/update + revalidate).

## Mudanças — Preview (`banner-live-preview.tsx`)

- **Refatorar o modelo de posição**: hoje `CONTENT_POS` é map por layout, mas posição do produto (`productSide` bool) e do CTA (ternário) são derivadas. Com 8 presets, extrair **3 maps explícitos** por layout: `CONTENT_POS`, `PRODUCT_POS`, `CTA_POS`. Cada preset novo define os 3.
- **Aplicar escala**: produto `style={{ transform: scale(productScale/100) }}` (ou `width` proporcional) a partir do baseline; CTA idem com `cta_scale`. Mesma fórmula que o storefront vai usar.
- **Fonte**: aplicar Barlow Condensed no título, Barlow no subtítulo/badge/CTA, via classe/var escopada.

## Mudanças — Fonte (`next/font`)

- Módulo (ex: `apps/web/src/lib/fonts.ts` ou local ao banner): `Barlow` + `Barlow_Condensed` de `next/font/google` com `variable: "--font-barlow"` / `"--font-barlow-condensed"`.
- Aplicar as CSS vars no wrapper do preview (e nos swatches/diagramas se fizer sentido), sem mexer no `font-sans` global.

## Contrato cross-repo → return-issue no `emach-ecommerce`

O storefront (`hero-carousel.tsx`) **precisa honrar** (senão o preview volta a mentir):
1. Renderizar os **4 layouts novos** (mesmas posições de produto/texto/CTA definidas aqui).
2. Aplicar **`product_scale`** e **`cta_scale`** (`scale = valor/100`) sobre os tamanhos-base.
3. (Fontes já existem no storefront — sem ação.)

**Abrir return-issue** no `emach-ecommerce` com o contrato (valores de enum, fórmula de escala, mapa de posições por preset). Coordenar deploy: schema sincroniza por CI, mas o **render** é manual lá. Até o storefront acompanhar, marcar os presets/escala novos como "preview pode divergir" OU segurar a publicação dos layouts novos.

## Fatias de build (incremental)

1. **Schema + sliders de tamanho** (menor risco, sem preset novo): colunas + bounds + 2 sliders + preview aplica escala. Return-issue storefront (escala).
2. **Fonte**: next/font no preview.
3. **Presets novos** (1 por vez ou em bloco): enum + maps de posição no preview + thumbnails. Return-issue storefront (render dos layouts).

## Verificação (por fatia)

- `bun check-types` + `bun check` verdes.
- `bun db:sync` aplica schema sem erro; conferir colunas/enum no banco.
- Smoke visual (`/dashboard/site/banners` → editar): sliders mexem o produto/CTA no preview ao vivo dentro dos bounds; cada preset novo posiciona produto/texto/CTA como especificado; título em Barlow Condensed.
- Sem `: any`, sem `console.*`, datas via helper, IDs `crypto.randomUUID()`.

## Fora de escopo

- Eixos 100% componíveis (descartado).
- Pacote de tokens/fontes compartilhado cross-repo (fonte fica self-host no dashboard).
- Mudanças no render do storefront **neste repo** (vira return-issue no ecommerce; ADR-0009 / [[feedback_emach_cross_repo_issues]]).

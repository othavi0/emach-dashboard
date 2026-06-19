# Coordenação cross-repo — migração de imports do split `catalog.ts` (044)

> **Pré-requisito do merge de #228 (`arquiteruta2`).** O plano 044 deletou
> `packages/db/src/queries/catalog.ts` (1166 LOC) e o dividiu em `tools.ts` /
> `categories.ts` / `promotions.ts` / `reviews.ts` / `catalog-helpers.ts`. Esses
> arquivos vivem na superfície de sync (ADR-0009), então ao mergear #228 na `main`
> o workflow `sync-db-schema.yml` propaga o split pro **ecommerce** e os imports de
> `@emach/db/queries/catalog` lá quebram até migrarem. Este doc é o handoff pronto.

## Como o sync funciona (ADR-0009 + `.github/workflows/sync-db-schema.yml`)

1. Push na `main` do dashboard tocando `packages/db/src/{schema,queries,sql}` dispara o workflow.
2. Ele faz `rsync -a --delete` de `queries/` → ecommerce (**deleta `catalog.ts`, traz os 4 novos**).
3. Abre/atualiza o PR `chore/sync-db-schema` (base `main`) em `othavi0/emach-ecommerce` (= `othavioquiliao/...` via redirect de rename de conta).
4. O **CI do ecommerce roda nesse PR** e fica vermelho nos 23 imports até serem migrados *na própria branch* `chore/sync-db-schema`. Só então mergeia.

**Não precisa de shim/barrel.** O `exports` do `@emach/db` é wildcard (`"./*": "./src/*.ts"`), então `@emach/db/queries/{tools,categories,promotions,reviews}` resolvem automaticamente assim que o sync traz os arquivos. A migração é puramente trocar o path em 23 arquivos. Zero mudança em `package.json`.

## Sequência de merge recomendada

1. Aprovar + mergear **#228** → `main` do dashboard (gate é só `REVIEW_REQUIRED`; CI verde).
2. Aguardar o workflow abrir/atualizar `chore/sync-db-schema` no ecommerce (CI vermelho — esperado).
3. No ecommerce, na branch `chore/sync-db-schema`: rodar o script abaixo → `bun fix && bun check-types` → push.
4. CI verde → mergear o sync PR. Fim.

## Mapa de migração — onde cada símbolo passou a morar

| Símbolo (importado pelo ecommerce) | Novo arquivo |
| --- | --- |
| `CategoryNode`, `getCategoryBySlug`, `getCategoryTree`, `getAllCategorySlugs` | `@emach/db/queries/categories` |
| `ToolListItem`, `ToolDetail`, `ToolSearchResult`, `getTools`, `getToolBySlug`, `getRecentTools`, `searchTools`, `getAllToolSlugs` | `@emach/db/queries/tools` |
| `PromotionWithTools`, `getFeaturedPromotion` | `@emach/db/queries/promotions` |
| `ReviewStats`, `getReviews` | `@emach/db/queries/reviews` |

### 18 arquivos — troca simples de path (todos os símbolos vão pra 1 arquivo)

→ `categories`: `catalog/_components/category-tree.tsx`, `catalog/_components/filter-panel.tsx`, `catalog/_lib/category-tree.ts`, `catalog/_lib/category-tree.test.ts`, `lib/catalog-cache.ts`
→ `reviews`: `product/[slug]/_components/product-reviews-section.tsx`
→ `promotions`: `components/promo-highlight.tsx`
→ `tools`: `product/[slug]/_components/{product-json-ld,product-info,product-reviews,product-specs}.tsx`, `product/[slug]/page.tsx`, `components/{product-grid,product-card,product-carousel,search-overlay}.tsx`, `lib/actions/search.ts`, `lib/product-detail.ts`

### 5 arquivos — split do import (símbolos em 2 arquivos novos)

| Arquivo | Resultado |
| --- | --- |
| `catalog/_components/catalog-content.tsx` | `CategoryNode`→categories · `ToolListItem`→tools |
| `catalog/page.tsx` | `getCategoryBySlug`→categories · `getTools`→tools |
| `product/[slug]/_components/related-products.tsx` | `getCategoryBySlug`→categories · `getTools`,`ToolListItem`→tools |
| `page.tsx` (home) | `getFeaturedPromotion`→promotions · `getRecentTools`→tools |
| `sitemap.ts` | `getAllCategorySlugs`→categories · `getAllToolSlugs`→tools |

## Script de aplicação (rodar da raiz do ecommerce, na branch `chore/sync-db-schema`)

Salvar como `migrate-catalog-imports.mjs` e rodar `node migrate-catalog-imports.mjs`. Falha alto se algum bloco não casar (drift do app code desde a auditoria) — aí migrar à mão pelo mapa acima.

```js
import { readFileSync, writeFileSync } from "node:fs";

const OLD = '"@emach/db/queries/catalog"';
const SIMPLE = {
  categories: [
    "apps/web/src/app/(shop)/catalog/_components/category-tree.tsx",
    "apps/web/src/app/(shop)/catalog/_components/filter-panel.tsx",
    "apps/web/src/app/(shop)/catalog/_lib/category-tree.ts",
    "apps/web/src/app/(shop)/catalog/_lib/category-tree.test.ts",
    "apps/web/src/lib/catalog-cache.ts",
  ],
  reviews: ["apps/web/src/app/(shop)/product/[slug]/_components/product-reviews-section.tsx"],
  promotions: ["apps/web/src/components/promo-highlight.tsx"],
  tools: [
    "apps/web/src/app/(shop)/product/[slug]/_components/product-json-ld.tsx",
    "apps/web/src/app/(shop)/product/[slug]/_components/product-info.tsx",
    "apps/web/src/app/(shop)/product/[slug]/_components/product-reviews.tsx",
    "apps/web/src/app/(shop)/product/[slug]/_components/product-specs.tsx",
    "apps/web/src/app/(shop)/product/[slug]/page.tsx",
    "apps/web/src/components/product-grid.tsx",
    "apps/web/src/components/product-card.tsx",
    "apps/web/src/components/product-carousel.tsx",
    "apps/web/src/components/search-overlay.tsx",
    "apps/web/src/lib/actions/search.ts",
    "apps/web/src/lib/product-detail.ts",
  ],
};

const SPLITS = [
  {
    file: "apps/web/src/app/(shop)/catalog/_components/catalog-content.tsx",
    from: 'import type { CategoryNode, ToolListItem } from "@emach/db/queries/catalog";',
    to: 'import type { CategoryNode } from "@emach/db/queries/categories";\nimport type { ToolListItem } from "@emach/db/queries/tools";',
  },
  {
    file: "apps/web/src/app/(shop)/catalog/page.tsx",
    from: 'import { getCategoryBySlug, getTools } from "@emach/db/queries/catalog";',
    to: 'import { getCategoryBySlug } from "@emach/db/queries/categories";\nimport { getTools } from "@emach/db/queries/tools";',
  },
  {
    file: "apps/web/src/app/(shop)/product/[slug]/_components/related-products.tsx",
    from: 'import {\n\tgetCategoryBySlug,\n\tgetTools,\n\ttype ToolListItem,\n} from "@emach/db/queries/catalog";',
    to: 'import { getCategoryBySlug } from "@emach/db/queries/categories";\nimport { getTools, type ToolListItem } from "@emach/db/queries/tools";',
  },
  {
    file: "apps/web/src/app/(shop)/page.tsx",
    from: 'import {\n\tgetFeaturedPromotion,\n\tgetRecentTools,\n} from "@emach/db/queries/catalog";',
    to: 'import { getFeaturedPromotion } from "@emach/db/queries/promotions";\nimport { getRecentTools } from "@emach/db/queries/tools";',
  },
  {
    file: "apps/web/src/app/sitemap.ts",
    from: 'import {\n\tgetAllCategorySlugs,\n\tgetAllToolSlugs,\n} from "@emach/db/queries/catalog";',
    to: 'import { getAllCategorySlugs } from "@emach/db/queries/categories";\nimport { getAllToolSlugs } from "@emach/db/queries/tools";',
  },
];

let failed = false;
for (const [target, files] of Object.entries(SIMPLE)) {
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    if (!src.includes(OLD)) { console.error(`MISS simple: ${file}`); failed = true; continue; }
    writeFileSync(file, src.replaceAll(OLD, `"@emach/db/queries/${target}"`));
    console.log(`ok  ${target}\t${file}`);
  }
}
for (const { file, from, to } of SPLITS) {
  const src = readFileSync(file, "utf8");
  if (!src.includes(from)) { console.error(`MISS split: ${file}`); failed = true; continue; }
  writeFileSync(file, src.replace(from, to));
  console.log(`ok  split\t${file}`);
}
if (failed) { console.error("\nAlgum bloco nao casou — migrar à mão pelo mapa do doc."); process.exit(1); }
console.log("\nFeito. Rodar: bun fix && bun check-types");
```

## Notas

- **2 comentários stale (não bloqueiam build):** `apps/web/src/lib/promotions.ts:4` e `apps/web/src/lib/auto-promo.ts:14` citam `packages/db/src/queries/catalog.ts`. A regra agora vive em `queries/promotions.ts` — atualizar o comentário ao migrar (opcional).
- `catalog-helpers.ts` **não** é importado pelo ecommerce (só uso interno do dashboard/dos novos arquivos de query). `ToolListItem` é re-exportado por `tools.ts`, então o mapa aponta pra `tools` (superfície pública), não pra `catalog-helpers`.
- O `bun fix` (ultracite) do ecommerce vai reordenar/normalizar os imports após o script — não precisa formatar à mão.

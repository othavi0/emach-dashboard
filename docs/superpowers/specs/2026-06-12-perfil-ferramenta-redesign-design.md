# Design — Redesign do Perfil de Ferramenta

> Data: 2026-06-12 · Alvo: `/dashboard/tools/[id]` (referência: `b3be9615-35e4-4849-8ad2-c1cb821d4cf9`)
> Origem: brainstorm pós-`/impeccable critique` (score 25 → 34). Este redesign ataca a organização visual da **Visão geral**, ancorado nos dados reais do banco.

## Contexto & motivação

A Visão geral hoje mistura cards gratuitos, espaço morto e specs achatadas que ignoram a estrutura real do dado. Investigação no banco (tool `b3be9615`) revelou que os "tópicos" de uma ferramenta vêm de **3 fontes**:

1. **Colunas fixas** de `tool`: model, invoiceModel, manufacturerName, powerWatts, weightKg, length/width/heightCm, hsCode/ncm/cest, visibleOnSite, supplierId, **overweightShippingAmount**, slug.
2. **Atributos dinâmicos** (`attribute_definition` → `tool_attribute_value`): por categoria, **herdados da cadeia ancestral**. Tipos: `text/number/select/boolean/numeric_range/color`. Cada um tem `unit`, `options`, `is_required`, `sort_order`, e a **categoria que o define**.
3. **Relações**: variants, stock_level, review, tool_image, tool_category.

### Problemas confirmados no banco (não-cosméticos)
- **Atributos vêm de categorias diferentes da cadeia** — ex.: 7 de "Ferramentas Elétricas" + 2 de "Furadeiras e Parafusadeiras". Hoje renderizam num grid único sem mostrar a origem.
- **Duplicação fixa × dinâmica:** Potência e Peso existem como coluna fixa **e** como atributo, com valores divergentes (Peso 1.700 kg fixo × 1.8 kg atributo).
- **Tipos ricos ignorados:** `color`/`select` (existem no sistema: 1 color, 5 select) renderizam como texto cru — sem swatch nem label de option.
- **Campos ocultos:** `overweightShippingAmount` (frete >30kg) não aparece em lugar nenhum.

## Objetivos
- Visão geral densa e legível, organizada por tópicos reais do banco, sem cards/bordas gratuitos.
- Refletir a estrutura do dado: specs técnicas agrupadas pela **categoria-fonte**.
- Renderizar atributos **por tipo** (swatch, range, boolean, select).
- Expor divergências de cadastro em vez de escondê-las.

## Escopo
- **Visão geral** → redesign completo (card grid edge-to-edge + carrossel). Foco do trabalho.
- **Header** → inalterado (`EntityIdentityHeader` + ação contextual já canônicos).
- **Variantes / Estoque / Atividade / Avaliações** → **passe de consistência**: adotar o `SectionCard` edge-to-edge onde fizer sentido e revisar borda/cor; **sem** redesign do zero.

### Fora de escopo
- Corrigir a duplicação no **modelo de dados** (atributo que duplica coluna fixa) — é decisão de schema/produto separada. Aqui só **sinalizamos** a divergência na UI.
- Edição de specs/atributos (continua na página de edição).
- `error.tsx` da rota (decisão app-wide pendente).

## Decisões (do brainstorm)
| Tema | Decisão |
|---|---|
| Direção de layout | **B — grid de cards**, refinado |
| Bordas internas | **Edge-to-edge** (faixa de título com `border-b` full-bleed via `-mx`) |
| Imagens | **Carrossel** quando excede o visível; cap **8 fotos** |
| Specs técnicas | **Agrupar por categoria-fonte**, ordenar por `sort_order` |
| Duplicação Potência/Peso | **Sinalizar divergência** (⚠ warning), não esconder |
| Campos a expor | frete >30kg · swatch de cor · label de select · slug (só o slug) · visibilidade |

## Estrutura da Visão geral

Grid responsivo de `SectionCard` (`repeat(auto-fit, minmax(280px, 1fr))` no bloco de specs; imagens/descrição ocupam largura cheia). Cada card: faixa de título (uppercase, `border-b` edge-to-edge) + corpo padded.

1. **Imagens** — `ImageCarousel`, cap 8, ~4 visíveis; setas ‹ › + dots só quando excede. ≤4 fotos = grid estático sem setas.
2. **Descrição** — só se `tool.description`; markdown via `ToolDescription` (já existe).
3. **Físicas** — Modelo, Modelo NF, Fabricante, Potência, Peso, Dimensões. ⚠ na divergência.
4. **Técnicas · `<categoria-fonte>`** — um card por categoria-fonte (ex.: "Gerais (Ferramentas Elétricas)", "Específicas (Furadeiras e Parafusadeiras)"). Atributos ordenados por `sort_order`, render por tipo.
5. **Fiscal** — HS/NCM/CEST com `HelpTooltip` (já implementado).
6. **Estoque** — resumo (total/filiais/alertas) + link pra aba Estoque.
7. **Logística & Metadados** — frete >30kg (`overweightShippingAmount` ou "a combinar"), categoria primária + secundárias, fornecedor, slug, visibilidade, criada.

## Camada de dados — `getToolDetail` (`_lib/tool-detail-data.ts`)

Estender a query de atributos para trazer o necessário ao agrupamento e render por tipo:

- Adicionar ao `select` de `tool_attribute_value`: `attribute_definition.category_id`, nome da categoria-fonte (join `category`), `attribute_definition.options`, `attribute_definition.sort_order`, `attribute_definition.is_required`.
- Atualizar `ToolDetailAttribute` com: `sourceCategoryId`, `sourceCategoryName`, `options` (tipado `AttributeOptions | null`), `sortOrder`.
- Derivar `attributesByCategory: { categoryId, categoryName, attributes: ToolDetailAttribute[] }[]`, ordenado e com `attributes` ordenados por `sortOrder`.

### Detecção de divergência (por unidade — robusto, sem heurística de label)
Helper puro `detectSpecDivergences(tool, attributes)`:
- Pares fixos conhecidos: `weightKg`→unit `"kg"`, `powerWatts`→unit `"W"`.
- Para cada par, se existe atributo com a mesma `unit` e `valueNumeric` ≠ valor da coluna fixa → marcar **ambos** (coluna e atributo) como divergentes.
- Retorna um `Set`/mapa consumido pelos cards Físicas e Técnicas pra render do ⚠ (warning + ícone `TriangleAlert`, AAA: cor + ícone + tooltip "valor diverge do cadastro/ficha").

## Componentes

- **`SectionCard`** (`[id]/_components/section-card.tsx`, server) — `{ title, action?, children }`. Faixa de título uppercase + `border-b` edge-to-edge; corpo `p-4`. Tijolo do grid. Reutilizável também no passe das outras tabs.
- **`ImageCarousel`** (`[id]/_components/image-carousel.tsx`, client) — `{ images }`, cap 8. Track horizontal com scroll-snap, setas prev/next (desabilitam nas pontas), dots. `prefers-reduced-motion`: sem scroll animado. Thumbs Supabase via `<img>` com `biome-ignore` (padrão do projeto).
- **`AttributeValue`** (render por tipo) — `color`→swatch (`options.swatches`) + label; `boolean`→"Sim/Não"; `numeric_range`→"a – b unit"; `select`→label da option (`options.options`); `number`→"v unit"; `text`→texto. Substitui o `formatAttributeValue` atual.
- **`ToolSpecs`** vira o consumidor dos grupos + divergências (refatora o atual).

## Outras tabs (passe de consistência)
- **Avaliações** — já achatada; envolver o bloco de rating num `SectionCard` se ganhar clareza; manter lista `divide-y`.
- **Estoque / Variantes** — manter tabela; só alinhar borda do wrapper ao raio/none do `SectionCard` e revisar cor. Sem mudança estrutural.
- **Atividade** — inalterada além de cor/borda se divergir.

## Verificação
- `bun check-types` + `bun check` (lint).
- **Smoke visual numa ferramenta com fiscal + color + select preenchidos** (a Furadeira não tem fiscal nem cor) — validar swatch, select, fiscal, divergência, carrossel com >4 fotos.
- Conferir AAA da divergência (ícone + cor + tooltip, não só cor).

## Riscos
- **Render por tipo com `options` malformado** — guard defensivo (fallback pro `valueText`/"—").
- **Carrossel + scroll-snap em base-ui/Tailwind** — usar scroll nativo + `scroll-snap`, sem lib.
- **Divergência por unidade** assume unidades canônicas ("kg"/"W"); se um atributo usar unidade diferente pro mesmo conceito, não casa (aceitável — só não sinaliza, não quebra).

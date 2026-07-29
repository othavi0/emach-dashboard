# Banner Builder por elemento (composition v1)

**Data:** 2026-07-29 · **Status:** aprovado em brainstorming (grilling decisão a decisão + mockups no visual companion)

## Problema

O builder atual acopla a composição inteira num enum `layout` (8 opções) + presets que ligam/desligam slots em pacote fechado. Não dá pra posicionar botão, produto, título e descrição de forma independente. No mobile é pior: o storefront ignora o `layout` abaixo de `lg:` e renderiza TODO banner na mesma composição fixa (texto embaixo, CTA full-width, produto centralizado); `productScale`/`ctaScale` nem se aplicam. Além disso, as posições vivem em código duplicado nos dois repos (`banner-layout-pos.ts` no dashboard ↔ `LAYOUT_CONFIG` no `hero-carousel.tsx` da loja), com paridade mantida na mão (issue ecommerce#130).

## Decisões (grilling 2026-07-29)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Escopo cross-repo | **Dashboard agora**; issue bem detalhada no repo `emach-ecommerce` pra loja aplicar depois |
| 2 | Modelo de posicionamento | **Âncora 3×3 + offset % + escala** por elemento; editor com **drag limitado** (clamp) que só edita o offset |
| 3 | Relação desktop → mobile | **Herança por elemento com override**: conteúdo é um só; sem override o elemento cai na pilha segura |
| 4 | Default mobile | **Pilha segura fixa** (ordem imutável, nunca quebra — comportamento atual da loja) |
| 5 | Granularidade | **7 elementos independentes**: badge, título, descrição, specs, countdown, produto, CTA |
| 6 | Ponto de partida | **Templates editáveis** (3–4) que só preenchem valores iniciais; presets acoplados morrem |
| 7 | Fundo | **Zoom (100–200%) + ponto focal (âncora 3×3)**; sem imagem = gradiente da marca ("vazio") |
| 8 | Texto | **Escala (60–160%) + largura máxima** por elemento; cor/fonte fixas da marca |
| 9 | CTA | Mantém as **4 variantes** (red/dark/white/ghost) + posição/escala do modelo novo |
| 10 | Transição | **Dual-write**: builder grava composition E deriva o layout legado mais próximo pras colunas antigas |
| 11 | Editor | **Canvas-first**: canvas central com drag, rail de camadas à esquerda, inspector contextual à direita |

## Modelo de dados

Coluna nova **aditiva** `composition` (jsonb, nullable) em `packages/db/src/schema/banner.ts`. Nenhuma coluna existente é alterada ou removida — a loja em produção continua lendo as colunas legadas até migrar. Conteúdo (textos, link, URLs de imagem, `ctaVariant`, `specs`) permanece nas colunas atuais; a composition guarda só forma/posição.

```ts
type Anchor9 = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
type ElementKey = "badge" | "title" | "subtitle" | "specs" | "countdown" | "product" | "cta";

type ElementPlacement = {
  anchor: Anchor9;
  offsetX: number;   // -20..20 (% do container, a partir da âncora)
  offsetY: number;   // -20..20
  scale: number;     // product 50..160 · cta 80..140 · textos 60..160 (%)
  maxWidth?: number; // só textos: 12..80 (ch)
};

type BackgroundConfig = {
  zoom: number;      // 100..200 (%)
  focal: Anchor9;    // ponto focal do corte (object-position)
};

type BannerComposition = {
  version: 1;
  desktop: {
    background: BackgroundConfig;                       // imagem em si vem das colunas atuais
    elements: Partial<Record<ElementKey, ElementPlacement>>; // ausente = elemento desligado
  };
  mobile: {
    background?: BackgroundConfig;                      // ausente = mesmo zoom/focal do desktop
    elements: Partial<Record<ElementKey, MobileOverride>>;   // ausente = herda a pilha segura
  };
};

type MobileOverride =
  | { hidden: true }                                    // esconde só no mobile
  | ElementPlacement;                                   // destacado da pilha, posição livre no 9:16
```

- **Elemento ligado** = presente em `desktop.elements` E com conteúdo nas colunas (ex.: CTA ligado exige `ctaLabel`+`ctaHref`). Desligar o elemento no editor remove a entry e limpa o conteúdo (comportamento atual dos slots).
- **Fundo mobile**: `backgroundMobileMode`/`backgroundImageMobileUrl` continuam como hoje (herdar/própria/vazio). `composition.mobile.background` só adiciona zoom/focal quando há imagem no mobile.
- **Validação**: `bannerCompositionSchema` (zod) no boundary — jsonb não tem CHECK (mesmo padrão de `specs`). Ranges acima + âncoras/keys por enum. `composition` inválida ou `version` desconhecida → erro de validação, nunca render quebrado.
- **`composition = null`** = banner legado ainda não backfillado; o dashboard renderiza pelo caminho legado até o backfill rodar (janela curta).

### Pilha segura (default mobile)

Ordem fixa, sem reordenação: **badge → título → specs → descrição → countdown → produto → CTA**. Elementos herdados renderizam empilhados no 9:16 com o estilo atual da loja (CTA full-width na base, produto centralizado, texto a partir do terço inferior). Elemento com override sai da pilha; os demais compactam. É a formalização do mobile hardcoded atual do `hero-carousel.tsx` — comprovadamente à prova de quebra.

### Área segura (clamp)

O drag/offset nunca posiciona o bounding box do elemento fora de: margens laterais 2%, topo 2%, base **10% no desktop / 16% no mobile** (faixa reservada aos indicadores do carrossel + botão pause da loja). Clamp aplicado no editor E no zod (offsets já limitados a ±20%).

## Derivação legada (dual-write) e backfill

### Dual-write (enquanto a loja não migra)

`deriveLegacyLayout(composition): { layout, productScale, ctaScale }` — função pura e determinística que escolhe 1 dos 8 layouts pelo trio (coluna da âncora do título, presença/lado do produto, âncora do CTA):

| Título | Produto | CTA | → layout |
|---|---|---|---|
| esquerda | direita | direita | `split` |
| esquerda | direita | centro/inline | `stack_left` |
| esquerda | centro/ausente | direita | `center_cta_right` |
| centro (linha inferior) | topo/centro | qualquer | `center_bottom` |
| centro (linha média) | ausente | qualquer | `center_mid` |
| direita | esquerda | qualquer | `mirror_split` |
| centro (linha superior) | centro | centro | `hero_center` |
| centro (linha superior) | centro | direita | `text_right` |
| *fallback* | | | `split` |

`productScale`/`ctaScale` legados recebem a escala da composition clampada nos CHECKs do banco (50–160 / 80–140). `createBanner`/`updateBanner` gravam composition + derivados na mesma mutação. O editor mostra aviso discreto: *"O site renderiza uma aproximação deste banner até a loja atualizar."* Quando a loja migrar (issue), a derivação é removida.

### Backfill (uma vez)

Script one-off (`scripts/backfill-banner-composition.ts`, `bun`): para cada banner com `composition IS NULL`, converte `layout` → composition usando o mapa inverso (os valores exatos de `banner-layout-pos.ts` + `LAYOUT_CONFIG` viram âncora+offset equivalentes), preservando `productScale`/`ctaScale`/`backgroundMobileMode`. UPDATE linha a linha, volume pequeno (≤ dezenas), não-destrutivo, idempotente (só onde NULL).

**Ordem de rollout (lição do incidente #240):** 1º `bun db:sync` (coluna no banco), 2º deploy do código, 3º backfill. Round-trip de teste: backfill(8 layouts) → deriveLegacyLayout = identidade nos 8.

## Editor (canvas-first)

Substitui o form atual em `new/` e `[id]/edit/`. Anatomia:

- **Topbar**: toggle Desktop/Mobile (troca canvas 16:9 ↔ 9:16), switch Publicar, Salvar, aviso de aproximação.
- **Rail esquerdo (camadas)**: os 7 elementos com switch ligar/desligar e seleção; no modo mobile cada um exibe badge `⇣ herdado` / `✎ override` / `∅ oculto` + ação "resetar pra herdado". Entrada "Fundo" fixa no rodapé do rail.
- **Canvas central**: renderiza via `composition-renderer` (o mesmo do card/preview). Elemento selecionado ganha outline coral; drag (pointer events, matemática em % do container) edita `offsetX/offsetY` com clamp na área segura; grid 3×3 fantasma aparece durante o drag. No modo mobile, arrastar um elemento herdado ativa o override imediatamente (badge muda pra `✎ override`; "resetar pra herdado" desfaz).
- **Inspector direito (contextual)**: controles do selecionado — âncora (picker 3×3), offsets, escala, largura máx (textos), campos de conteúdo (título/descrição/link/label, variante do CTA, uploads, specs, countdown). Reusa `image-upload-tile`, `specs-editor`, `countdown-field`, `cta-variant-picker` e os limites de caracteres atuais. Fundo selecionado → zoom, focal, modo mobile do fundo.
- **Templates**: na criação, 4 cards ("Produto em destaque", "Promo central", "Countdown", "Imagem pura") que só preenchem uma composition inicial + slots ligados. Nada fica acoplado depois do clique. `preset-cards`/`layout-picker`/`banner-presets` atuais morrem.

Estrutura de arquivos (em `apps/web/src/app/dashboard/site/banners/`):

```
_components/composition/
  composition-renderer.tsx   # puro: (banner, composition, viewport) → JSX; usado por canvas, card e como referência da loja
  safe-stack.tsx             # render da pilha segura mobile
  composition-schema.ts      # zod + types + clamps + defaults
  derive-legacy.ts           # deriveLegacyLayout + mapa de backfill
  templates.ts
_components/editor/
  banner-editor.tsx          # estado (useReducer), submit, dirty-check
  editor-canvas.tsx          # drag + seleção + grid fantasma
  element-rail.tsx
  inspector.tsx
  anchor-picker.tsx
```

`banner-live-preview.tsx`, `banner-layout-pos.ts`, `layout-picker.tsx`, `preset-cards.tsx` e `banner-presets.ts` são removidos ao final (o canvas E o card passam a usar `composition-renderer`). `banner-card.tsx` troca o render interno pelo renderer novo (thumb desktop; ícones de cobertura mobile mantidos).

## Guard-rails e validações (mantidos)

- Máx. **6 banners ativos** (`MAX_ACTIVE_BANNERS`), contador âmbar, checagem em create/update/toggle.
- `altText` obrigatório com fundo; CTA exige label+href juntos; href `/(rota)` ou `https://`; countdown no futuro; banner não 100% vazio (fundo OU título OU badge).
- Gradiente de legibilidade **automático** (não configurável): direção derivada da âncora do título/descrição (esquerda→`to-r`, direita→`to-l`, centro→`to-t`); presente só quando há texto.
- Limites de upload/formatos/dimensões recomendadas inalterados; capability `site.update_banners` e auditoria (`banner.*`) inalteradas; drag-reorder e demais telas da listagem inalterados.

## Fases de entrega

1. **Fundação**: schema + `composition-schema.ts` + `derive-legacy.ts` + `db:sync` + backfill + dual-write nas actions (UI atual continua funcionando por cima).
2. **Editor desktop**: canvas-first completo no modo desktop + templates + remoção dos presets.
3. **Modo mobile**: toggle 9:16, pilha segura, overrides por elemento, badges herdado/override.
4. **Listagem + consolidação**: `banner-card` no renderer novo, remoção dos arquivos legados de preview/posição, testes, polish.
5. **Issue no `emach-ecommerce`**: contrato completo da composition v1 (tipos, pilha segura, área segura, gradiente, exemplos), `composition-renderer` como implementação de referência, plano de remoção do `LAYOUT_CONFIG` e sinal de volta pra removermos o dual-write.

## Testes

- Unit: `composition-schema` (boundaries de todos os ranges, âncoras inválidas, version desconhecida, override mobile `hidden` vs placement).
- Unit: `derive-legacy` (tabela de decisão completa + fallback) e round-trip backfill→derive = identidade nos 8 layouts.
- Unit: clamp de área segura (desktop/mobile) e ordem da pilha segura.
- `banner-schema.test.ts` atual continua passando (validações de conteúdo intocadas).
- Smoke visual: dev server + comparação lado a lado canvas ↔ card ↔ (quando a loja migrar) storefront.

## Fora de escopo

Agendamento de publicação (publishAt/unpublishAt), cores/fontes customizadas, novos estilos de CTA, reordenação da pilha segura, animações configuráveis (parallax/float/glow da loja ficam como estão), cleanup de imagens órfãs no update (dívida pré-existente, rastrear à parte), migração do storefront em si (vira issue).

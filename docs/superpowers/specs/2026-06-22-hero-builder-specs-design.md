# Design — Hero Builder: bg mobile seguro + ficha técnica estruturada (#229)

> Origem: issue #229 (handoff do storefront emach-ecommerce). O fix do storefront já foi
> feito lá (commit `7747774`); este design cobre a parte owned-by-dashboard.

## Problema

No storefront o hero da home quebrava no mobile. Causa raiz: o conteúdo de valor do hero
(título, painel de specs "FICHA TÉCNICA · 1200W · 800 RPM…", subtítulo) está **queimado
dentro da arte de background widescreen** (`backgroundImageUrl`). No mobile, `object-cover`
em retrato recorta a arte no centro e some com o conteúdo. Como o texto vive na imagem,
`banner.title`/`subtitle` ficam `null`.

## Reframe vs. estado real do builder

O issue foi escrito sem visibilidade do Hero Builder. Confrontado com o código, boa parte
do que ele pede já existe:

| Pedido do issue | Realidade no builder | Gap real |
|---|---|---|
| `backgroundMobileMode` default `none`; exigir mobile url quando `custom` | Enum `inherit/custom/none`, UI tri-state e tile de upload mobile já existem. Default é `inherit`; mobile url não é obrigatória em `custom` | Trocar default + 1 refine |
| Texto estruturado (título/subtítulo/specs como DOM) | `title`, `subtitle`, `badge` já são campos estruturados e renderizam como DOM | **Falta só o campo `specs`** |
| Limpar banner de teste "Ver Catalogo2" | Já desativado no storefront (`is_active=false`) | Processo, não código |

## Escopo

| Parte | Onde | Tipo |
|---|---|---|
| A. Fix mobile bg (default `none` + validação `custom` + aviso `inherit`) | dashboard | fix |
| B. Campo `specs` estruturado (schema + builder + preview) | dashboard | feature |
| C. Renderizar `specs` como DOM no hero | ecommerce | handoff (issue separada) |
| D. Arte = só visual; revisar banner de teste | processo | nota |

Fora de escopo (YAGNI): header "FICHA TÉCNICA" configurável (label fixo no storefront);
pares label/valor `<dl>` (lista simples basta); remover `inherit` do enum (arriscado em
push-only — o aviso resolve); **derivar specs de uma tool vinculada** — o `banner` não tem
FK `toolId` (só `productImageUrl`) e o issue pede campos estruturados, não integração com o
catálogo; specs são entrada manual (`string[]`). Vincular tool ao banner é feature à parte.

## A. Fix mobile bg

**Schema** (`packages/db/src/schema/banner.ts`)
- `backgroundMobileMode`: default `"inherit"` → **`"none"`**. Push-only (ADR-0006): afeta
  só banners novos; existentes mantêm o valor atual (os 2 de teste já tratados via DB). Sem
  backfill necessário.

**Zod** (`apps/web/src/app/dashboard/site/banners/_components/banner-schema.ts`)
- Novo refine: `backgroundMobileMode === "custom"` ⇒ `backgroundImageMobileUrl` obrigatória.
  Hoje "cai pro desktop se vazio", que é o mesmo bug disfarçado. Erro associado ao campo.

**Builder** (`apps/web/src/app/dashboard/site/banners/_components/banner-form.tsx`)
- `EMPTY.backgroundMobileMode` → `"none"`.
- Aviso não-bloqueante quando `inherit` está selecionado: *"Artes widescreen são cortadas no
  mobile — prefira 'Sem fundo' ou 'Imagem própria'."*

## B. Campo `specs`

**Schema:** nova coluna `specs = jsonb("specs").$type<string[]>()` **nullable** (consistente
com `title`/`subtitle`). `null`/`[]` = sem painel de specs. O dado guarda só os valores
(`["1200W", "800 RPM", "Ø125mm"]`); o header "FICHA TÉCNICA" é label de rendering do
storefront, não vai no dado. `bun db:sync` após editar.

**Zod:** `specs: z.array(z.string().trim().min(1).max(24)).max(6).optional()` — itens curtos,
teto de 6 para caber no painel. Fica fora do refine de raiz existente (specs sozinho não
compõe um hero).

**Builder:** novo `SlotSection` "Ficha técnica" com lista de inputs repetíveis (add/remove
item, contador `X/6`, char-count por item), seguindo o padrão dos campos existentes.

**Live preview** (`banner-live-preview.tsx`): renderizar `specs` como chips/lista,
espelhando o que o storefront fará. Atenção ao acoplamento existente (subtitle só aparece no
preview quando o slot `title` está ativo) para não repetir o padrão no specs sem intenção.

**Testes** (`__tests__/banner-schema.test.ts`): default `none`; refine `custom`→mobile url
obrigatória; limites de `specs` (vazio aceito, >6 itens rejeitado, item >24 rejeitado).

## C. Handoff storefront (cross-repo)

A coluna `specs` propaga para o `emach-ecommerce` via CI PR automático de schema (ADR-0009) —
chega lá sozinha. Trabalho manual: **issue nova no `emach-ecommerce`** para renderizar
`banner.specs` como `<ul>` semântico no hero (`apps/web/src/components/hero-carousel.tsx`,
`DESIGN.md §10`), substituindo o texto queimado na arte. Ganho: a11y, SEO, i18n,
responsividade — resolve a classe inteira do bug, não só o mobile.

## D. Processo (não-código)

Ao criar banners reais: arte de background = só visual; título/subtítulo/specs vão nos campos
estruturados. Revisar o banner de teste "Ver Catalogo2" (label com typo, sem produto).

## Plano de verificação

- `bun verify` (check-types + check + test) verde.
- Smoke visual obrigatório (não basta check-types): `bun dev:web`, criar/editar banner em
  `/dashboard/site/banners`, conferir o controle de specs, o aviso de `inherit` e o bloqueio
  de `custom` sem mobile url; checar o preview ao vivo nos toggles desktop/mobile.

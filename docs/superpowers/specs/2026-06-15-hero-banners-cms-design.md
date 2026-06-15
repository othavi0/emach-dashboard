# Hero / Banners da home — CMS no dashboard

> Spec de design. Origem: issue #173 (ecommerce). Escopo: **só dashboard** (schema + bucket + CRUD). O consumo no storefront (refactor do `HeroCarousel`) é um **issue separado**, criado no ecommerce após o sync de schema.
> Data: 2026-06-15.

## 1. Objetivo

Tornar o hero/carrossel da home do storefront — hoje **hardcoded** (`apps/web/src/components/hero-carousel.tsx` no `emach-ecommerce`: array `HERO_SLIDES` com 2 slides fixos `{ bg, product, alt }`, CTA global fixo `Ver Catálogo → /catalog`, sem título/SEO) — **gerenciável pelo dashboard**: staff cria/edita/ordena/publica slides com imagem de fundo, ferramenta central, título/subtítulo e botão (texto + link).

A tabela é **owned-by-dashboard** (ADR-0009): nasce aqui; o workflow `sync-db-schema.yml` faz `rsync --delete` de `packages/db/src/schema/**` e abre o PR de schema no ecommerce automaticamente ao mergear na `main`.

## 2. Insight cross-repo (importante)

O `hero-carousel.tsx` atual **não renderiza título nem subtítulo** — o `alt` é só o `alt` da imagem de fundo, e o CTA é **global e fixo**. A composição visual é: fundo `object-cover` + produto `object-contain` flutuando no centro + glow vermelho radial + dots inferiores + 1 CTA (canto inferior). Autoplay de 9s, loop, `h-[88svh]` mobile (portrait) e `h-svh` desktop (landscape).

Consequência: este issue **cria dados** (`title`, `subtitle`, `ctaLabel`, `ctaHref` por slide) que **o storefront ainda não sabe exibir**. O preview ao vivo do dashboard mostra a **composição pretendida**; a posição final do texto/CTA é decisão do **refactor do storefront** (issue futuro). O preview rotula isso como "texto indicativo".

## 3. Decisões (brainstorming)

| Decisão | Escolha |
|---|---|
| Rota | `/dashboard/site/hero` (dentro do grupo `/site/`, junto com Notificações) |
| Nav | Reaproveitar o item "Banners" (`nav-config.ts`), remover `disabled`, apontar para a nova rota |
| Forma do CRUD | Lista reordenável (drag-and-drop) + criar/editar em **página dedicada** (`/new`, `/[id]/edit`) |
| Card de listagem | Media-card "imagem limpa + corpo": thumb = imagem real (fundo+produto, **sem texto sobreposto**); título/CTA no corpo |
| Layout do form | Duas colunas — form à esquerda (seções), **preview ao vivo lateral fixo (sticky)** à direita com toggle desktop/mobile |
| Preview ao vivo | Sim — espelha o hero do storefront (desktop landscape / mobile portrait) |
| Agendamento | **Fora de escopo** (só toggle `isActive` manual). Ver §9 (evolução futura) |
| Capability | `site.update_banners` (já existe em `permissions.ts`) |

## 4. Schema — `hero_slide`

Novo arquivo `packages/db/src/schema/hero-slide.ts` + `export * from "./hero-slide"` no barrel `schema/index.ts`. Convenções de `packages/db/CLAUDE.md` (ID `text` PK por `crypto.randomUUID()` no caller; `timestamptz`). `bun db:sync` após criar.

| coluna | tipo | nota |
|---|---|---|
| `id` | `text` PK | `crypto.randomUUID()` no caller |
| `backgroundImageUrl` | `text NOT NULL` | bucket `hero-images`, URL pública absoluta |
| `backgroundImageMobileUrl` | `text` (nullable) | fallback → desktop quando null |
| `productImageUrl` | `text` (nullable) | ferramenta central opcional (banner só fundo+texto é válido) |
| `productImageMobileUrl` | `text` (nullable) | fallback → `productImageUrl` quando null |
| `title` | `text NOT NULL` | headline visível + SEO |
| `subtitle` | `text` (nullable) | linha de apoio, render condicional |
| `altText` | `text NOT NULL` | a11y da imagem de fundo |
| `ctaLabel` | `text NOT NULL` | texto do botão |
| `ctaHref` | `text NOT NULL` | link do botão — string (valida formato no zod) |
| `sortOrder` | `integer NOT NULL default 0` | ordem no carrossel |
| `isActive` | `boolean NOT NULL default false` | publica/despublica; nasce despublicado |
| `createdAt` | `timestamptz NOT NULL default now()` | |
| `updatedAt` | `timestamptz NOT NULL default now()` `$onUpdate` | |

Notas: `ctaHref` é `string` porque no ecommerce o link vem do DB em runtime e `typedRoutes` não valida runtime (cast no consumo); a validação de formato mora no zod do dashboard. `subtitle` nullable de propósito (render condicional no storefront, evita migration futura).

## 5. Storage

- `HERO_IMAGES_BUCKET = "hero-images"` em `apps/web/src/lib/supabase-server.ts`. Bucket **público**, criado no Supabase (espelha `tool-images`).
- Upload/delete server-side espelhando `tools/_components/image-actions.ts`: `uploadToPublicBucket({ bucket, formData, maxSizeBytes, allowedTypes })` / `removeStorageObject` / `extractPublicUrlPath` de `lib/storage.ts`.
- `ALLOWED_TYPES`: `image/jpeg`, `image/png`, `image/webp`. `maxSizeBytes` por tipo de imagem (ver guidelines §7).
- Thumbs e previews no dashboard via `<img>` puro + `// biome-ignore lint/performance/noImgElement: Supabase public URL` (convenção). **Não** mexer em `next.config.ts` do dashboard.
- `deleteHeroSlide` remove as imagens do bucket junto com a linha.

## 6. Rotas, nav e componentes

```
apps/web/src/app/dashboard/site/hero/
  page.tsx                      # listagem (Server Component)
  actions.ts                    # server actions + fetchers
  new/page.tsx                  # criar
  [id]/edit/page.tsx            # editar
  _components/
    hero-card.tsx               # media-card (layout aprovado: imagem limpa + corpo)
    hero-list.tsx               # grid 3-col + dnd-kit; seções "No ar" / "Rascunhos"
    hero-form.tsx               # 2 colunas (form + preview), compartilhado new/edit
    hero-live-preview.tsx       # toggle desktop/mobile, espelha o hero do storefront
    image-upload-tile.tsx       # 4×, com guidelines visíveis + preview
    delete-hero-dialog.tsx      # AlertDialog destrutivo
    hero-slide-schema.ts        # zod (fonte única form + action)
```

- **Nav** (`apps/web/src/app/dashboard/_components/nav-config.ts`): item "Banners" passa a `{ label: "Banners", href: "/dashboard/site/hero", icon: ImageIcon }` (remover `disabled: true`).
- **Listagem:** grid de 3 colunas. Duas seções — **"No ar — ordem do carrossel" (N/6 ativos)** com cards arrastáveis (dnd-kit), e **"Rascunhos / despublicados"**. Card tracejado "+ Criar novo banner" no fim. Sem scroll infinito (poucos slides). Empty state via `<Empty>`.
- **Card (media-card):** thumb 16:9 com imagem real (fundo+produto) + badge de ordem (`#N`, top-left) + badge de status das imagens (🖥/📱, top-right) + handle de arrastar no hover. Corpo: título + CTA resolvida. Footer edge-to-edge: botão Editar + toggle de publicação. Shell e footer conforme DESIGN.md §4.
- **Form:** duas colunas (`1.15fr .85fr`). Esquerda em seções (**Imagens** 2×2, **Conteúdo**, **Botão**, **Publicação**). Direita: `hero-live-preview` sticky com segmented control 🖥 Desktop / 📱 Mobile. Campos via `<LabeledField>` + `<FieldError>` + `useFormErrors`. Botão Salvar.
- **dnd-kit:** `id` estável no `<DndContext>` (ex: `id="hero-sortable"`) — gotcha de hidratação (DESIGN.md / `categories-tree.tsx`).

## 7. Validação (zod) e guidelines de imagem

`hero-slide-schema.ts` (fonte única form + action):
- `title`: 1–80 chars. `subtitle`: ≤140 (nullable). `ctaLabel`: 1–30. `altText`: 1+ (obrigatório).
- `ctaHref`: regex `^(\/|https:\/\/)` — rota interna ou URL externa.
- `backgroundImageUrl`: obrigatório (URL não-vazia). Demais imagens conforme nullability.
- **Máx 6 slides `isActive = true`** — validado no **server action** (conta no banco; não expressável em zod puro). Ativar um 7º (no toggle da lista ou no publish do form) é bloqueado com mensagem clara. Motivo: autoplay 9s × 6 ≈ ciclo de 54s.

Guidelines exibidas em cada `image-upload-tile` (helper text + dimensão + ratio + formato + peso máx + preview):

| imagem | dimensão | ratio | formato | peso máx | obrigatória |
|---|---|---|---|---|---|
| Fundo desktop | 2560×1440 | 16:9 | WebP/JPG | ≤500 KB | **sim** |
| Fundo mobile | 1080×1920 | 9:16 | WebP/JPG | ≤350 KB | não (→ desktop) |
| Produto desktop | ~2400px lado maior | livre, fundo transparente | PNG | ≤800 KB | não |
| Produto mobile | ~1400px lado maior | livre, transparente | PNG | ≤500 KB | não (→ produto desktop) |

Motivo do mobile separado: hero é portrait no mobile (`88svh`) e landscape no desktop (`svh`) com `object-cover` — imagem única sempre cropa mal num dos dois.

## 8. Server actions

`actions.ts`, todas com `"use server"` + `await requireCapability("site.update_banners")` no início + retorno `ActionResult<T>` + `revalidatePath("/dashboard/site/hero")` (e `revalidateTag("site-banners")`). Erros de banco via `getPgError` (não `e.message.includes`). Auditoria: `logUserActivity` com `actorUserId: session.user.id`.

- `createHeroSlide(input)` — nasce `isActive=false`, `sortOrder` = (max atual)+1.
- `updateHeroSlide(id, input)`.
- `deleteHeroSlide(id)` — remove imagens do bucket + linha (`AlertDialog` no client).
- `reorderHeroSlides(orderedIds: string[])` — escreve `sortOrder` em lote.
- `toggleHeroSlideActive(id, active)` — guard dos 6 ativos antes de ativar.
- `uploadHeroImage(formData)` / `deleteHeroImage(url)` — espelham `image-actions.ts`.

Fetchers (Server Component): `fetchHeroSlides()` ordenado por `sortOrder` (separa ativos/rascunhos no render); `fetchHeroSlide(id)` para o edit.

## 9. Decisões menores e fora de escopo

Decisões tomadas:
- `altText` pré-preenche com `title` (editável) — reduz fricção mantendo a11y.
- Slide novo nasce rascunho (`isActive=false`), `sortOrder` = próximo disponível.
- Card sem ação de editar inline além do botão Editar (vai pra página `/[id]/edit`).

**Fora de escopo deste issue** (vira issue no ecommerce, pós-sync):
- `getActiveHeroSlides()` (query SSR `WHERE isActive ORDER BY sortOrder`).
- Refactor do `HeroCarousel` para receber `slides: HeroSlide[]` via props e renderizar `title`/`subtitle`/CTA por slide (SSR p/ SEO) — **decide a posição final do texto**.
- Whitelist do host Supabase em `next.config.ts > images.remotePatterns` (lado ecommerce).
- Cache: home tem `revalidate = 600` (edições levam ~10min). Avaliar revalidação on-demand cross-repo.

**Evolução futura (não agora):** agendamento por slide (`startsAt`/`endsAt` + cron de ativação) para banners sazonais (Black Friday etc.). Exige 2 colunas + job cron + lógica de "ativo efetivo" no consumo. Descartado por YAGNI.

## 10. Verificação

- `bun check-types` + `bun check` (ultracite) verdes.
- `bun db:sync` aplica o schema; conferir a tabela `hero_slide` no banco.
- Smoke visual (`bun dev:web`): criar slide com upload, reordenar (drag), publicar/despublicar, validar bloqueio do 7º ativo, conferir preview desktop/mobile, excluir (confirma remoção das imagens do bucket).

## 11. Checklist (espelha o issue #173)

- [ ] Schema `hero_slide` + barrel + `bun db:sync`
- [ ] Bucket `hero-images` + `HERO_IMAGES_BUCKET` + upload/delete server-side
- [ ] Nav: reativar item "Banners" → `/dashboard/site/hero`
- [ ] Listagem (3-col, media-card, seções No ar/Rascunhos, dnd-kit reorder, toggle)
- [ ] Form 2 colunas + preview ao vivo (desktop/mobile) + 4 uploads com guidelines
- [ ] Validação zod (lengths, ctaHref, máx 6 ativos no action)
- [ ] Server actions (create/update/delete/reorder/toggle/upload) com capability + ActionResult
- [ ] `bun check-types` + `bun check` verdes + smoke visual

# Banners da home — Builder componível (evolução do CMS)

> Spec de design (dashboard). Origem: issue **#177**. Evolui o CMS de banners (#173, PR #176). A "nova abordagem" foi decidida em sessão de design no ecommerce — spec espelho: `emach-ecommerce/docs/superpowers/specs/2026-06-15-hero-banners-design.md`. Este spec cobre o **lado dashboard**: delta de schema + builder UI. O consumo no storefront é coberto por ecommerce#122/#123/#124, **pós-sync**.
> Data: 2026-06-15.

## 1. Objetivo

Transformar o CMS de banners de um form fixo (imagens + título + subtítulo + CTA, todos obrigatórios) num **builder componível de hero**: o staff monta cada banner ligando/desligando **slots**, partindo de um **preset**, escolhendo a **disposição** (layout) e a **variante do botão**. Sem page-builder drag-and-drop (mantém simples de manter).

**Princípio:** o banco controla a camada de overlay (consistente); a arte de fundo carrega o editorial livre (ficha técnica, número decorativo). Por isso ficha técnica **não** vira campo.

A tabela `banner` é owned-by-dashboard (ADR-0009): o delta nasce aqui e o `sync-db-schema.yml` abre o PR de schema no ecommerce ao mergear na `main`.

## 2. Decisões de UX do builder (brainstorming)

| Decisão | Escolha |
|---|---|
| Presets | **Cards inline no topo do form** (4); clicar pré-configura slots+layout, segue editável |
| Slots on/off | **Switch no header de cada seção** (fieldset); ligar revela campos, desligar colapsa e limpa |
| Layout | Picker de 4 **mini-diagramas radio** (split / stack_left / center_bottom / center_mid) |
| Variante de CTA | 4 **swatches** (red / dark / white / ghost) |
| Preview ao vivo | Aproxima o hero **Ferrari do storefront** (Barlow uppercase, cantos retos, void-black + glow, régua vermelha), refletindo layout/slots/variante/badge/countdown |
| Sistema visual dos controles | Design do **admin** (editorial/coral, DESIGN.md do dashboard) — não confundir com o Ferrari do preview |

## 3. Schema — delta na tabela `banner`

Arquivo `packages/db/src/schema/banner.ts`. `bun db:sync` após editar. Relaxar NOT NULL→nullable e adicionar colunas com default são operações **não-destrutivas** (push-only seguro; linhas existentes recebem os defaults). Registrar os enums no mesmo arquivo.

**Tornar nullable (slots desligáveis):**
- `title`: `notNull()` → nullable
- `backgroundImageUrl`: `notNull()` → nullable (sem bg → storefront renderiza void-black + glow)
- `ctaLabel`, `ctaHref`: `notNull()` → nullable (CTA desligável)
- `altText`: `notNull()` → nullable (par com background; validação condicional)

**Adicionar:**
```ts
export const bannerLayout = pgEnum("banner_layout", [
  "split", "stack_left", "center_bottom", "center_mid",
]);
export const bannerCtaVariant = pgEnum("banner_cta_variant", [
  "red", "dark", "white", "ghost",
]);
```
- `layout`: `bannerLayout("layout").notNull().default("split")`
- `ctaVariant`: `bannerCtaVariant("cta_variant").notNull().default("red")`
- `badgeText`: `text("badge_text")` (nullable)
- `countdownTarget`: `timestamp("countdown_target", { withTimezone: true })` (nullable)

**Mantém:** `id`, `backgroundImageMobileUrl`, `productImageUrl`, `productImageMobileUrl`, `subtitle`, `sortOrder`, `isActive`, `createdAt`, `updatedAt`. Tipos `Banner`/`NewBanner` re-inferidos. Barrel já exporta `./banner`.

## 4. Slots (cada um liga/desliga independente)

| Slot | Campo(s) | Desligado quando |
|---|---|---|
| Fundo | `backgroundImageUrl` (+ `*MobileUrl`, `altText`) | bg nulo |
| Produto central | `productImageUrl` (+ `*MobileUrl`) | nulo |
| Título + descrição | `title` (+ `subtitle`) | title nulo |
| Badge/selo | `badgeText` | nulo |
| Countdown | `countdownTarget` | nulo |
| CTA | `ctaLabel` + `ctaHref` (+ `ctaVariant`) | ambos nulos |

`layout` e `ctaVariant` não são slots — são sempre presentes (têm default). Presets só pré-marcam slots; qualquer combinação válida (respeitando §6).

## 5. Presets (cards inline, pré-configuram slots + layout)

Config estática `PRESETS` (não persistida; só pré-preenche o form). Cada preset define quais slots nascem ligados + o `layout` inicial:

1. **Produto em destaque** — Fundo + Produto + Título + Descrição + CTA · `split`
2. **Promo full-text** — Fundo + Badge + Título + Descrição + CTA · `center_mid` (sem produto)
3. **Countdown** — Fundo + Produto + Título + Countdown + CTA · `split`
4. **Imagem pura** — só Fundo + CTA · sem overlay de texto

No **create**: nenhum preset selecionado por padrão; clicar um aplica (e pode trocar). No **edit**: sem preset ativo (mostra "personalizado"); cards continuam disponíveis como atalho (com confirmação antes de sobrescrever slots já preenchidos).

## 6. Validação (zod) — `banner-schema.ts`

Reescrever `bannerFormSchema` com campos nullable + `superRefine` para regras cross-field. Issues de `path` vazio caem na chave **`_form`** (renderizar `<FieldError>{errors._form}</FieldError>` no rodapé do form, conforme apps/web/CLAUDE.md).

- Campos: `backgroundImageUrl` `string|null`; `title`/`subtitle`/`altText`/`ctaLabel`/`ctaHref`/`badgeText` nulláveis; `layout` enum; `ctaVariant` enum; `countdownTarget` `Date|null`; `isActive` bool.
- **Conteúdo mínimo** (`superRefine`, → `_form`): exigir `backgroundImageUrl` **OU** ao menos um de (`title`, `badgeText`). Sem banner 100% vazio.
- **altText condicional:** obrigatório se `backgroundImageUrl` presente (a11y) — erro no campo `altText`.
- **CTA par:** `ctaLabel` e `ctaHref` ambos presentes ou ambos ausentes (erro em `ctaHref`); se presente, `ctaHref` casa `^(\/|https:\/\/)`.
- **Countdown no futuro:** se `countdownTarget` presente, `> now()` (erro em `countdownTarget`).
- **Máx 6 `isActive`** — validado no server action (conta no banco; inalterado vs #176).
- **Lengths:** `title` ≤80, `subtitle` ≤140, `badgeText` ≤16, `ctaLabel` ≤30.

`MAX_ACTIVE_BANNERS = 6` mantido.

## 7. Builder UI

Reescrita do form (`banner-form.tsx`) + upgrade do preview. Componentes novos isolados.

### Estado do form
`BannerFormValues` (do zod) + estado local `enabledSlots: Record<SlotKey, boolean>` (quais seções estão expandidas/ligadas). `enabledSlots` inicializa de:
- **edit:** presença de conteúdo (ex: `title != null` → slot título on);
- **create:** do preset escolhido (ou tudo off até escolher).

Ligar um slot expande a seção (campos vazios editáveis). Desligar colapsa **e** zera os campos do slot no `values` (defensivo). No submit: forçar campos de slots desligados a `null`, depois `safeParse`.

### Componentes
| Arquivo | Responsabilidade |
|---|---|
| `_components/banner-presets.ts` | Config `PRESETS` (slots + layout por preset) |
| `_components/preset-cards.tsx` | Linha de 4 cards clicáveis (create + atalho no edit com confirm) |
| `_components/slot-section.tsx` | Wrapper de seção com Switch no header (controla `enabledSlots[key]`); render-prop pros campos |
| `_components/layout-picker.tsx` | 4 mini-diagramas radio → `layout` |
| `_components/cta-variant-picker.tsx` | 4 swatches → `ctaVariant` |
| `_components/countdown-field.tsx` | Input datetime-local (min = agora) → `countdownTarget` (Date\|null) |
| `_components/banner-form.tsx` | Orquestra: preset cards + layout picker + seções de slot + publicação + submit + preview |
| `_components/banner-live-preview.tsx` | **Upgrade**: posiciona conteúdo por `layout`, cor do CTA por `ctaVariant`, badge pill, countdown ao vivo, void-black+glow quando sem bg, régua vermelha sob o título; toggle desktop/mobile |
| `_components/image-upload-tile.tsx` | Inalterado (já tem `maxBytes`/guidelines do #176) |

Campos via `<LabeledField>` + `<FieldError>` + `useFormErrors`. Layout/ctaVariant/preset/countdown são controles custom — garantir `aria-invalid`/`data-error` quando aplicável (a maioria não tem erro de campo; `countdownTarget` tem).

### Listagem (`banner-card.tsx`)
Ajuste leve: indicar slots ativos do banner (ex: ícones badge/countdown quando presentes) e a variante/layout como meta discreta. Não é redesenho — o card media-card do #176 permanece.

## 8. Server actions (`actions.ts`)

`createBanner`/`updateBanner` passam a aceitar os novos campos (`layout`, `ctaVariant`, `badgeText`, `countdownTarget`) e os agora-nulláveis. O `INSERT`/`UPDATE` mapeia todos. Guard de 6 ativos, `reorderBanners`, `toggleBannerActive`, `deleteBanner` (cleanup de imagens) **inalterados**. `requireCapability("site.update_banners")` + `ActionResult` + `revalidatePath`/`revalidateTag` mantidos. `getPgError` no catch.

`countdownTarget` é `Date` no boundary do form; o Drizzle aceita `Date` em coluna `timestamptz`. Fetchers (`fetchBanners`/`fetchBanner`) inalterados (já retornam a linha inteira).

## 9. Migração / compatibilidade

- Push-only (ADR-0006): `bun db:sync`. Drizzle cria os 2 pgEnums, adiciona `badge_text`/`countdown_target`, e faz `ALTER COLUMN ... DROP NOT NULL` nas 4 colunas. Sem TTY-prompt (não há rename ambíguo nem drop).
- Linhas existentes: ganham `layout='split'`, `cta_variant='red'`, `badge_text=null`, `countdown_target=null`; colunas relaxadas mantêm valor. **Sem perda de dados.**
- Sync: ao mergear na main, o CI abre PR de schema no ecommerce (os enums + colunas + nullability). ecommerce#122 depende dele.

## 10. Fora de escopo (ecommerce, pós-sync)

Render do hero componível no storefront (slots/layouts/variantes, void-black, countdown ao vivo, mobile) — ecommerce#122; badge+countdown — #123; revalidação on-demand — #124. **Posição final do texto no hero** é decisão do #123 (o preview do dashboard é aproximação).

## 11. Verificação

- `bun check-types` + `bun check` (ultracite) + `bun --cwd apps/web test` (atualizar/expandir testes do `banner-schema`: conteúdo mínimo, altText condicional, CTA par, countdown futuro, lengths novos) verdes.
- `bun db:sync` aplica o delta; conferir colunas/enums no banco.
- Smoke visual: criar via cada preset, ligar/desligar slots, trocar layout/variante, badge, countdown, conferir preview refletindo tudo, validações (banner vazio, CTA só com label, altText sem alt), publicar/reordenar, máx 6 ativos.

## 12. Checklist (espelha #177)

- [ ] Schema delta (nullable + 2 pgEnums + `badgeText`/`countdownTarget`) + `bun db:sync`
- [ ] `banner-schema.ts` reescrito (campos nulláveis, enums, superRefine das regras cross-field, lengths)
- [ ] Server actions aceitam os novos campos
- [ ] Builder UI: preset cards, slot-section (switch), layout-picker, cta-variant-picker, countdown-field, banner-form reescrito
- [ ] `banner-live-preview` upgrade (layout/variante/badge/countdown/void-black/régua)
- [ ] `banner-card` indica slots/variante (ajuste leve)
- [ ] Testes do schema atualizados + `check-types` + `check` verdes + smoke visual

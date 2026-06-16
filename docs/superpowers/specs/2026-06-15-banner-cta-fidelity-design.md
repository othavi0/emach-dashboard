# Design — Fidelidade do CTA no preview de banner (#186)

> Status: **aprovado** (brainstorming 2026-06-15). Implementação autônoma agendada via cron (limite de uso ~97%, resume após reset).
> Issue: #186 `fix(banners): preview do CTA usa vermelho errado (#e60012) e diverge do EmachButton real`.

## Problema

O preview ao vivo do banner (`banner-live-preview.tsx`) e o seletor de variante (`cta-variant-picker.tsx`) desenham o CTA à mão e **divergem do `EmachButton` real** que o storefront (`emach-ecommerce`) renderiza no hero. Sintomas:

- Vermelho `#e60012` em vez do brand `#da291c` (Ferrari Red).
- Bordas sólidas `border-white` em vez de `/25` (dark) e `/70` (ghost).
- `rounded-sm font-bold` em vez de `rounded-[2px] font-semibold tracking-[0.04em]`.
- A mesma lógica está **duplicada** em dois arquivos (`CTA_CLASS` no preview, `SWATCH` no picker) — o issue só cita o preview, mas o picker tem o mesmo bug.

## Decisões (brainstorming)

1. **Escopo = A**: corrigir preview **e** picker, extraindo um mapa de classes CTA único (fim da duplicação). Hex hardcoded (sem portar tokens/fontes — isso fica pro refactor maior, ver Follow-up).
2. **Cantos = `rounded-[2px]`** (fiel ao `EmachButton` real de hoje; quadrado total foi descartado — seria divergir do real pro outro lado).
3. **Todos os vermelhos decorativos do preview** vão pra `#da291c` (não só o CTA e a régua que o issue lista): glow do placeholder e ponto de paginação também — consistência de marca, dentro do escopo A ("corrigir tudo no dashboard").
4. **Picker ganha fundo escuro nos swatches**: com o mapa fiel, `ghost` (bg transparente) e `dark` (borda `/25`) ficam invisíveis no fundo claro do card do dashboard. Cada swatch passa a renderizar sobre um chip escuro (representa o hero), pra as 4 variantes lerem corretamente.

## Mudanças por arquivo

### Novo: `apps/web/src/app/dashboard/site/banners/_components/cta-variant-class.ts`

```ts
import type { BannerCtaVariant } from "./banner-schema";

// Espelha CTA_VARIANT_MAP + EmachButton do emach-ecommerce (hero-carousel.tsx).
// Fonte de verdade real é o storefront; aqui é aproximação fiel via hex.
// Brand red = #da291c (Ferrari Red), near-black = #181818.
export const CTA_VARIANT_CLASS: Record<BannerCtaVariant, string> = {
  red: "bg-[#da291c] text-white",
  dark: "border border-white/25 bg-[#181818] text-white",
  white: "bg-white text-[#181818]",
  ghost: "border border-white/70 bg-transparent text-white",
};

// Forma + peso + tracking comuns do EmachButton real.
export const CTA_BASE =
  "rounded-[2px] font-sans font-semibold tracking-[0.04em]";
```

### `banner-live-preview.tsx`

- Remover o `CTA_CLASS` local; importar `CTA_VARIANT_CLASS` + `CTA_BASE`.
- Span do CTA (~linha 174): trocar `rounded-sm ... font-bold` por `CTA_BASE` + `CTA_VARIANT_CLASS[values.ctaVariant]`, mantendo o tamanho do contexto (`px-3 py-1.5 text-[11px]`).
- Régua sob o título (~linha 161): `bg-[#e60012]` → `bg-[#da291c]`.
- Glow do placeholder (~linha 123): `rgba(230,0,18,0.3)` → `rgba(218,41,28,0.3)` (= `#da291c`).
- Ponto de paginação (~linha 188): `bg-[#e60012]` → `bg-[#da291c]`.

### `cta-variant-picker.tsx`

- Remover o `SWATCH` local; importar `CTA_VARIANT_CLASS` + `CTA_BASE`.
- Span "Botão" do swatch: `CTA_BASE` + `CTA_VARIANT_CLASS[variant]`, mantendo tamanho do contexto (`px-3 py-1 text-[10px]`).
- Envolver o span num chip de fundo escuro (ex: `bg-[#181818]` ou o gradiente do hero) pra `ghost`/`dark` lerem no card claro do dashboard.

## Verificação

1. `bun check-types` verde.
2. `bun check` (ultracite) verde — sem `#e60012` remanescente nos dois arquivos.
3. **Smoke visual** (claude-in-chrome, server na :3006, browser "Notbook" logado): rota `/dashboard/site/banners` → criar/editar banner → conferir, lado a lado com a home real do storefront se possível:
   - CTA `red` em `#da291c` (não `#e60012`), cantos `rounded-[2px]`, peso semibold + tracking.
   - As 4 variantes do picker legíveis sobre o chip escuro.
   - Régua e ponto de paginação em `#da291c`.
4. `grep -rn "e60012\|230,0,18" _components/` retorna vazio.

## Acceptance criteria (issue #186)

- [ ] `CTA_VARIANT_CLASS` usa `#da291c`; `dark`=borda `/25`, `ghost`=borda `/70`.
- [ ] Span do CTA com `rounded-[2px]` + `font-semibold tracking-[0.04em]` (sem `font-bold`).
- [ ] Régua do título em `#da291c`.
- [ ] Picker (`cta-variant-picker.tsx`) usa o mesmo mapa — sem `#e60012`.
- [ ] Glow + ponto de paginação em `#da291c` (consistência de marca).
- [ ] Preview comparado lado a lado com a home real — CTA igual em cor/cantos/peso.

## Fora de escopo / Follow-up (refactor maior do builder — spec próprio depois)

Sinalizado pelo usuário, **não** entra no #186:

- Novos presets de layout (ex: ferramenta no centro + botão à direita).
- Controle de **tamanho da ferramenta** (imagem do produto) — umas maiores, outras menores.
- Controle de **tamanho do botão** (CTA).
- Fidelidade de fonte (Barlow / Barlow Condensed) → caminho dos tokens compartilhados (a "Ressalva" do issue).

**Dependência cross-repo:** presets e controles de tamanho são renderizados de verdade pelo **storefront**, não só salvos no schema do dashboard. Boa parte desse refactor exige return-issue no `emach-ecommerce` (ADR-0009) pra o `EmachButton`/hero honrarem os novos valores. O preview do dashboard é só aproximação.

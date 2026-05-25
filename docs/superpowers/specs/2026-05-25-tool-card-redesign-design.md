# Tool Card Redesign

**Data:** 2026-05-25
**Contexto:** Catálogo `/dashboard/tools` e visão geral de estoque `/dashboard/` — ambos usam `ToolCard`.

## Problema

Card atual tem quatro falhas críticas:

1. `font-serif` (Cormorant) no nome da ferramenta — banido em product chrome.
2. Badges (categoria + status) entre imagem e nome quebram o fluxo visual sem agregar.
3. Número de estoque a 28px laranja domina o card sem contexto — lê como hero metric.
4. Bloco de variantes é opcional: cards com variantes são mais altos que sem, quebrando o grid.
5. Card não é clicável — só o nome-link abre o detalhe.

## Decisões de design

### Estrutura do card (top → bottom)

```
┌────────────────────────────────────┐
│  [Serras Circulares]   [● Ativo]   │  ← chips sobrepostos na imagem
│         imagem produto             │    categoria: bottom-left absolute
│                                    │    status: top-right absolute
├────────────────────────────────────┤
│  Nome da ferramenta (sans, bold)   │  ← 2-line clamp, font-sans
│  SKU · tensão · fornecedor         │  ← 11px muted, 1-line clamp
│  ● Visível no site                 │  ← dot verde + texto 10px
│                                    │
│  [127V]  [220V]  [Bivolt]          │  ← chips de variante (min-height fixo)
├────────────────────────────────────┤
│  Estoque: 1498      [⎘] [✎] [✕]   │  ← label:valor inline + ações direita
└────────────────────────────────────┘
```

### Detalhes por seção

**Imagem**
- Aspect ratio 16/9, `object-cover`.
- Sem border interna (remover `border border-border` do wrapper da imagem).
- Hover: `group-hover:brightness-110` via CSS filter — sinaliza clicabilidade.
- Chips sobrepostos (absolute): categoria `bottom-2 left-2`, status `top-2 right-2`.
- Chip style: `backdrop-blur-sm bg-card/80 border border-border` — lê sobre qualquer foto.

**Badge de status**
- `active` → `● Ativo` verde.
- `out_of_stock` → `✕ Sem estoque` vermelho.
- `draft` → `Rascunho` outline neutro.
- `discontinued` → `Descontinuado` outline muted.
- Reorder badge (stock-overview variant): substitui status, permanece no mesmo position.

**Nome**
- `font-sans font-semibold text-[14px] leading-[1.3]` — remove `font-serif` completamente.

**Slot de variantes**
- Sempre presente no DOM: `min-h-[24px]`.
- Se `variantSummaries.length > 0`: renderiza chips (máximo 4 + overflow `+N`).
- Se vazio: slot fica invisível mas mantém altura — grid alinhado.

**Rodapé**
- Uma linha: `Estoque: {n}` (label muted 11px + valor bold 15px copper) + botões à direita.
- `totalStock === 0` → valor em `text-destructive`.
- Sem breakdown de filiais no card (vai para a página de detalhe).
- Sem label "ESTOQUE · N FILIAIS" (removido).

**Ações**
- Sempre visíveis: `⎘` (duplicar), `✎` (editar), `✕` (excluir).
- Todos com `onClick={e => { e.preventDefault(); e.stopPropagation() }}` — não disparam navegação do card.
- Botão `✕` com `border-destructive/40 text-destructive` para distinguir.

**Card clicável**
- `ToolCardActions` já usa `<Link>` internamente — wrap em `<Link>` externo criaria `<a>` dentro de `<a>` (HTML inválido).
- Solução: outer div mantém `<div>`, adiciona `onClick={() => router.push(...)}` + `cursor-pointer group`.
- O `<Link>` do nome permanece para acessibilidade (keyboard, screen reader).
- Os botões de ação ficam envoltos em `<div onClick={e => e.stopPropagation()}>` — clique neles não dispara `router.push` do card.
- Hover no card: `hover:border-border/60 hover:shadow-sm transition-[border-color,box-shadow]`.

## Arquivos afetados

| Arquivo | O que muda |
|---|---|
| `apps/web/src/app/dashboard/_components/tool-card.tsx` | Toda a estrutura: badges overlay, font, slot variantes, rodapé, card como Link |
| `apps/web/src/app/dashboard/_components/tool-card-grid.tsx` | Nenhuma mudança esperada |
| `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx` | Sem mudança — os `<Link>` internos ficam intactos; o `stopPropagation` é aplicado no wrapper em `tool-card.tsx` |

## O que não muda

- `ToolCardData` interface — sem alteração de dados.
- Grid layout (4 colunas xl, 3 lg, 2 sm, 1 default).
- Variant `stock-overview` — recebe as mesmas mudanças visuais; lógica `showReorderHeader` permanece.
- `ToolCardGrid` — nenhuma alteração.
- Paginação infinita (`ToolsInfinite`) — nenhuma alteração.

## Critérios de aceitação

- [ ] Grid sem variação de altura entre cards com e sem variantes.
- [ ] Clique em qualquer área do card (exceto botões) navega para `/dashboard/tools/{id}`.
- [ ] Botões de ação não disparam navegação.
- [ ] Nenhum `font-serif` no card.
- [ ] Badges de categoria e status visíveis sobre qualquer foto (backdrop-blur funciona).
- [ ] `Estoque: 0` em vermelho.
- [ ] Hover na imagem com `brightness-110`.

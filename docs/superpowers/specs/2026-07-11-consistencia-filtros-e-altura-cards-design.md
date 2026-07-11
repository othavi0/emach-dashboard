# Consistência de controles de filtro + altura de cards de pedido

> Design doc. Origem: auditoria visual da rota `/dashboard/orders?tab=late` (pedido do usuário, 2026-07-11), estendida ao `apps/web` inteiro.

## 1. Problema

Três sintomas relatados na tela de Pedidos (aba Atrasados), com suspeita de espalhamento pelo sistema:

1. **Altura irregular dos cards de pedido.** Num grid de 2 colunas, cards com menos peças ficam mais curtos e "flutuam" no topo da célula, deixando gap vazio sem padrão sob o rodapé.
2. **Combobox de Produto fora do padrão.** Fundo na mesma cor da página (parece "vazado") e altura maior que os controles vizinhos.
3. **(Percebido) Filial/Transportadora com altura diferente.** — **refutado por medição** (ver §2).

## 2. Diagnóstico (com evidência)

### Medição de pixel ao vivo (`localhost:3006`, getBoundingClientRect + getComputedStyle)

| Controle | Altura | Fundo computado |
|---|---|---|
| Buscar (Input) | 32px | `bg-input/30` ✓ |
| Período (DateRangePicker) | 32px | `bg-input/30` ✓ |
| **Produto (combobox)** | **36px** ❌ | **transparente** ❌ (mostra `bg-background` cru) |
| Filial (SelectTrigger) | 32px | `bg-input/30` ✓ |
| Transportadora (SelectTrigger) | 32px | `bg-input/30` ✓ |

**Filial e Transportadora já estão no padrão (32px + `bg-input/30`).** O sintoma 3 era uma ilusão relativa: o Produto sendo 4px mais alto e transparente no meio da fila faz os vizinhos corretos parecerem baixos. Corrigir o Produto (e seus clones) resolve a percepção.

### Causa raiz — cards

`apps/web/src/components/bulk/selectable-item.tsx:40,45` insere um `<div>` simples (sem `h-full`/`flex`) entre a célula do grid e o `<OrderCard>` (`<Link>`). O CSS Grid estica o `<div>` até a altura da linha, mas o Link filho fica na altura natural (topo), com gap embaixo. O `mt-auto` do footer (`order-card.tsx:132`) só funciona sob stretch — prova de que o autor **pretendia** cards esticados. É bug, não decisão.

### Causa raiz — combobox de Produto (e clones)

`apps/web/src/app/dashboard/orders/_components/product-filter-combobox.tsx:38`: trigger escrito à mão (`PopoverTrigger` + `render={<button>}`) com `h-9 ... bg-transparent ... px-3 py-2 text-sm` **sem** variante `dark:bg-input/30`. Como o app roda sempre em dark (`layout.tsx:97` `html.dark`), o `bg-transparent` sem `dark:` mostra o fundo cru da página.

### Escopo (auditoria multi-agente do `apps/web`)

O mesmo anti-pattern (trigger de combobox hand-written que copiou altura/cor divergentes) existe em **4 arquivos**:

| # | Arquivo:linha | Altura | Cor | Lógica |
|---|---|---|---|---|
| 1 | `orders/_components/product-filter-combobox.tsx:38` | `h-9` | `bg-transparent` s/ dark | single + clear |
| 2 | `stock/_components/supplier-combobox.tsx:44` | `h-9` | `bg-transparent` s/ dark | single + invalid + disabled |
| 3 | `promotions/_components/promotion-form-fields.tsx:130` | `h-10` | `bg-transparent` s/ dark | **multi** + invalid + disabled |
| 4 | `promotions/_components/promotions-filters.tsx:203` | `h-10` | `border-border bg-background` | single + clear (via URL param) |

Todos compartilham o mesmo esqueleto `Popover` + `PopoverTrigger`(botão hand-styled) + `PopoverContent`(`Command`/`CommandInput`/`CommandList`). **Só o trigger diverge**; a lógica interna (single/multi/clear/invalid) é legítima e específica de cada um.

## 3. Decisões (aprovadas pelo usuário)

- **Cards → Opção A+**: esticar por linha (conserta o stretch) **+** piso mínimo no bloco de itens (para card de 1 peça não ficar "pelado").
- **Comboboxes → trigger compartilhado**: extrair um trigger único que espelha `SelectTrigger`; os 4 call-sites passam a usá-lo. Corrige agora e impede uma 5ª cópia divergir. Preserva a UX botão-que-abre-popover (não migrar pro primitivo base-ui typeahead).

## 4. Mudanças

### 4.1 Altura de cards (A+)

1. **`components/bulk/selectable-item.tsx`** — adicionar `h-full` aos **dois** ramos do wrapper (`return` inativo linha 40 e ativo linha 45), para o `<div>` grid-item repassar a altura esticada ao filho. Se a cadeia `height:100%` se mostrar frágil, alternativa: `flex h-full flex-col` no wrapper + `flex-1` no card.
2. **`orders/_components/order-card.tsx`**:
   - Adicionar `h-full` à className do `<Link>` (linha 40-48) — o card preenche a célula esticada; o `mt-auto` do footer volta a ancorar no fundo.
   - Adicionar piso mínimo ao bloco de itens (linha 86): `min-h-[84px]` (≈ 2 linhas de item: 2×30px + gap 6px + padding pt-2/pb-2.5). **Tunar visualmente** para ~2 linhas.

Resultado: sem gap irregular no grid (stretch por linha); card curto ganha piso digno; cross-linha adapta ao conteúdo, sem número mágico grande.

### 4.2 Trigger de combobox compartilhado

1. **Novo componente** em `apps/web/src/components/` (nome sugerido: `combobox-trigger-button.tsx`), exportando:
   - `COMBOBOX_TRIGGER_CLASS` (constante) — classe canônica que **espelha `SelectTrigger`** (`packages/ui/src/components/select.tsx:124`), com `h-8` direto:
     ```
     flex h-8 w-full select-none items-center justify-between gap-1.5 whitespace-nowrap
     rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-xs outline-none transition-colors
     focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent
     disabled:cursor-not-allowed disabled:opacity-50
     aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20
     dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50
     ```
   - `ComboboxTriggerButton` — wrapper fino sobre `PopoverTrigger` (`render={<button type="button" />}`, `cn(COMBOBOX_TRIGGER_CLASS, className)`), repassando `id`/`disabled`/`aria-invalid`/`children`. O ícone/clear-trailing fica flexível (children ou prop) para acomodar as 4 variações.
2. **Refatorar os 4 call-sites** para usar `ComboboxTriggerButton`/`COMBOBOX_TRIGGER_CLASS`, **preservando** a lógica interna (single/multi/clear/invalid/disabled) e o corpo `Command`. Remover as classes hand-written divergentes (`h-9`/`h-10`, `px-3 py-2 text-sm`, `bg-transparent` sem dark, `border-border bg-background`).

Efeito: os 4 comboboxes ficam pixel-idênticos ao `SelectTrigger` (32px, `bg-input/30`, mesmo focus/hover/invalid).

## 5. Verificação

- **Estático:** `bun verify` (check-types + check ultracite + test) com cache limpo.
- **Perceptual + dados (smoke ao vivo em `localhost:3006`):**
  - `/dashboard/orders?tab=late` — medir pixel: Buscar/Período/**Produto**/Filial/Transportadora todos **32px** + `bg-input/30`; cards sem gap irregular (screenshot lado a lado com o "Atual").
  - `/dashboard/stock` (edição/entrada com supplier picker) — supplier combobox 32px + bg correto.
  - `/dashboard/promotions` (form novo + filtros avançados) — ambos os comboboxes 32px + bg correto; multi-select do form ainda funciona (badges).
- Card: confirmar que 1-item, 2-item e 3+item na mesma linha ficam alinhados e o footer ancora no fundo.

## 6. Fora de escopo

- **Não** migrar comboboxes pro primitivo `@base-ui/react` Combobox (typeahead) — mudaria a UX.
- **Não** tocar nos primitivos de `packages/ui/src/components/*` — eles definem o padrão (não divergem).
- **Não** alterar a lógica single/multi/clear de nenhum combobox — só o trigger visual.

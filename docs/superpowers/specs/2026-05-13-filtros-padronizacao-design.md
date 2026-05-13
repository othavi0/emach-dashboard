# Spec A — Padronização de DatePickers e botão "Limpar filtros"

**Data:** 2026-05-13
**Escopo:** base de padronização que precede redesigns B (customers index), D (orders list) e C+E (detalhes).
**Status:** design aprovado pelo user, aguardando revisão do spec antes do plano.

## Contexto

Dois inconsistências visíveis em filtros de listagem do dashboard:

1. `/dashboard/customers` usa `<Input type="date">` nativo enquanto `/dashboard/orders` usa o componente `<DatePicker>` (Popover + Calendar com locale pt-BR). Resultado: dois visuais diferentes para a mesma função, e o nativo não respeita o design system (cor, fonte, hover).
2. O botão "Limpar filtros" do `<FiltersBar>` aparece/desaparece conforme há filtro ativo, causando layout jump e ocultando uma ação importante para o user.

Não há outra ocorrência de `<Input type="date">` no app (grep confirma só em `customer-filters.tsx`).

## Decisões

### 1. DatePicker único

- Componente canônico: `@emach/ui/components/date-picker` (já existe em `packages/ui/src/components/date-picker.tsx`).
- Substituir os 2 campos de data em `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx` ("Cadastro de" e "Cadastro até") por `<DatePicker>`.
- O schema do customers continua usando strings `YYYY-MM-DD` no querystring (`createdFrom`, `createdTo`) — não muda contrato.
- A página `/dashboard/customers` também tem `lastOrderFrom`/`lastOrderTo` no schema mas não renderiza filtros para eles hoje; quando renderizar (em B), também usar `<DatePicker>`.

### 2. Helpers de data extraídos

- Hoje `parseDateParam` e `formatDateParam` vivem inline em `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`.
- Mover para `apps/web/src/lib/date-params.ts` com a mesma semântica:
  - `parseDateParam(value: string): Date | undefined` — interpreta `YYYY-MM-DD` no fuso local (concatenando `T00:00:00`).
  - `formatDateParam(date: Date | undefined): string` — devolve `YYYY-MM-DD` (ou `""` se undefined).
- `order-list-filters.tsx` e `customer-filters.tsx` passam a importar de lá.

### 3. Botão "Limpar filtros" sempre visível

- Editar `apps/web/src/components/filters-bar.tsx`:
  - Sempre renderizar o `<Button>` (sem conditional render).
  - `disabled={!hasActive}`.
  - Aparência atenuada vem do `disabled` nativo do shadcn Button (`opacity-50`, `pointer-events-none`, `cursor-not-allowed`).
  - Mantém `variant="ghost"`, `size="sm"`, label "Limpar filtros".
- Resultado: sem layout jump quando user adiciona/remove filtros; a ação fica sempre presente, sinalizando claramente que existe.

### 4. Documentação da convenção

Adicionar à seção "Convenções de UX em forms" de `apps/web/CLAUDE.md`:

```md
- **Filtros de período:** usar `<DatePicker>` de `@emach/ui/components/date-picker`. Nunca `<Input type="date">` nativo (não respeita design system).
- **Helpers de data em querystring:** `parseDateParam` / `formatDateParam` em `apps/web/src/lib/date-params.ts`. Strings sempre no formato `YYYY-MM-DD`, parseadas no fuso local.
- **`<FiltersBar>`:** sempre renderiza o botão "Limpar filtros". Quando `hasActive=false`, vem com `disabled` para sinalizar a ação sem causar layout jump.
```

## Não-objetivos

- Não muda contrato dos querystrings (`createdFrom`, `createdTo`, `from`, `to`, etc).
- Não muda comportamento de filtros além do botão "Limpar".
- Não adiciona range-picker (dois campos separados continuam — possível refinamento futuro em B/D).
- Não toca em outras telas (suppliers, tools, etc) — grep confirmou que não há outro `type="date"`.

## Arquivos tocados

| Arquivo | Mudança |
|---------|---------|
| `apps/web/src/lib/date-params.ts` | **novo** — exporta `parseDateParam`, `formatDateParam` |
| `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx` | troca 2 `<Input type="date">` por `<DatePicker>`; importa helpers |
| `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` | remove helpers locais, importa de `lib/date-params.ts` |
| `apps/web/src/components/filters-bar.tsx` | botão sempre renderizado com `disabled={!hasActive}` |
| `apps/web/CLAUDE.md` | adiciona 3 bullets de convenção |

## Verificação

1. `bun check-types` no workspace `apps/web`.
2. `bun fix` no escopo (hook PostToolUse já roda em Edit/Write, mas confirmar).
3. `bun dev:web` → smoke manual:
   - `/dashboard/customers`: abrir os 2 pickers, selecionar uma data, ver querystring `createdFrom=YYYY-MM-DD` aplicado. Limpar e ver botão acender/apagar (sempre visível).
   - `/dashboard/orders`: mesmo teste em "De"/"Até". `min={parseDateParam(from)}` continua bloqueando "Até" antes do "De".
   - Em ambas as telas, sem nenhum filtro: botão "Limpar filtros" presente, disabled, sem hover ativo.

## Próximos specs (referência)

- **Spec B** — Customers index redesign (KPIs header, info architecture, polish tabela).
- **Spec D** — Orders list redesign (preservar PendingList + ActivityFeed; remover botão "Voltar ao painel" do header).
- **Spec C+E** — Detalhes de cliente e pedido (tabs, painel de ações, timeline).

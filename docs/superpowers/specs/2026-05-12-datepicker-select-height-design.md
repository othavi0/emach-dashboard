# DatePicker pt-BR + Select max-height — Design

**Data:** 2026-05-12
**Escopo:** `packages/ui` + 2 call sites em `apps/web`
**Problema:** (1) Inputs `<input type="date">` exibem `mm/dd/yyyy` (locale do browser/SO), inadequado para usuários BR. (2) `SelectContent` cresce até altura disponível do viewport — em telas grandes lista de categorias/filiais fica gigante, perdendo contexto da página.

## Decisões

| Tópico | Decisão |
|---|---|
| Date picker | Popover + Calendar (react-day-picker já instalado), sem digitar. Locale `ptBR` de `date-fns`. |
| Formato display | `dd/MM/yyyy` |
| Range filter (orders) | 2 `<DatePicker>` independentes (mantém shape atual de URL params `from`/`to`) |
| Valor exposto | `Date \| undefined` via `onChange`. Parent decide serialização (hidden input ISO em form actions; URL param `yyyy-MM-dd` em filtros client). |
| Validação `end ≥ start` | Client (DatePicker `endDate` recebe `min={startDate}` → calendário desabilita dias anteriores) + server (Zod `refine` no action). |
| SelectContent max-height | `max-h-[min(18rem,var(--available-height))]` (~9 itens, match `CommandList`). |

## 1. Novo `<DatePicker>` em `packages/ui/src/components/date-picker.tsx`

### API

```tsx
interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;        // default: "DD/MM/AAAA"
  disabled?: boolean;
  min?: Date;
  max?: Date;
  align?: "start" | "end";     // popover align, default "start"
  id?: string;
  name?: string;               // se setado → renderiza hidden input ISO string p/ form actions
  className?: string;
}
```

### Estrutura

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" disabled={disabled} className="justify-start font-normal">
      <CalendarIcon className="mr-2 size-4" />
      {value ? format(value, "dd/MM/yyyy", { locale: ptBR }) : <span className="text-muted-foreground">{placeholder}</span>}
    </Button>
  </PopoverTrigger>
  <PopoverContent align={align} className="w-auto p-0">
    <Calendar
      mode="single"
      locale={ptBR}
      selected={value}
      onSelect={onChange}
      disabled={(d) => (min && d < min) || (max && d > max)}
      autoFocus
    />
  </PopoverContent>
  {name && <input type="hidden" name={name} value={value?.toISOString() ?? ""} />}
</Popover>
```

### Imports

- `format` de `date-fns`
- `ptBR` de `date-fns/locale`
- `Calendar` de `@emach/ui/components/calendar`
- `Popover`, `PopoverTrigger`, `PopoverContent` de `@emach/ui/components/popover`
- `Button` de `@emach/ui/components/button`
- `CalendarIcon` de `lucide-react`

Confirmar `date-fns` está em `packages/ui/package.json`. Senão adicionar (já é dep transitiva de `react-day-picker`).

### Acessibilidade

- `Button` herda focus-ring do design system (ring 2px copper).
- Calendar já tem keyboard nav nativa (react-day-picker).
- `aria-label` no botão derivado do `placeholder` ou prop opcional `aria-label`.

## 2. SelectContent — cap altura

**Arquivo:** `packages/ui/src/components/select.tsx:167`

```diff
- "... max-h-(--available-height) ..."
+ "... max-h-[min(18rem,var(--available-height))] ..."
```

Justificativa: `CommandList` (combobox) já está em `max-h-72` (=18rem). Padroniza UX entre Select e Combobox. Em viewports curtos, `min()` ainda permite o cálculo do Base UI achatar mais.

## 3. Migração de call sites

### 3.1 `apps/web/src/app/dashboard/promotions/_components/promotion-form.tsx`

Linhas 477 e 491. Hoje:

```tsx
<Input name="startsAt" type="date" defaultValue={...} />
<Input name="endsAt"   type="date" defaultValue={...} />
```

Vira (form usa `<form action={updatePromotion}>` — server action):

```tsx
"use client";
const [startsAt, setStartsAt] = useState<Date | undefined>(initial.startsAt);
const [endsAt,   setEndsAt]   = useState<Date | undefined>(initial.endsAt);

<DatePicker name="startsAt" value={startsAt} onChange={setStartsAt} />
<DatePicker name="endsAt"   value={endsAt}   onChange={setEndsAt} min={startsAt} />
```

Hidden input renderiza ISO; server parse com `z.string().datetime().transform((s) => new Date(s))`.

**Server-side validation** (em `promotions/schema.ts`):

```ts
.refine(
  (d) => !d.endsAt || !d.startsAt || d.endsAt >= d.startsAt,
  { message: "Data fim deve ser ≥ data início", path: ["endsAt"] }
)
```

### 3.2 `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`

Linhas 130-147. Já é client component com URL params (`from`/`to` em formato `yyyy-MM-dd`).

```tsx
const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
const toDate   = to   ? new Date(`${to}T00:00:00`)   : undefined;

<DatePicker
  id="orders-from"
  value={fromDate}
  onChange={(d) => setFrom(d ? format(d, "yyyy-MM-dd") : "")}
/>
<DatePicker
  id="orders-to"
  value={toDate}
  onChange={(d) => setTo(d ? format(d, "yyyy-MM-dd") : "")}
  min={fromDate}
/>
```

URL param shape inalterada → server unchanged.

## 4. Export em packages/ui

Adicionar `./components/date-picker` ao `packages/ui/package.json` exports map (mesmo padrão dos outros componentes).

## 5. Anti-patterns evitados

- Não tentar `lang="pt-BR"` em `<input type="date">` (não funciona confiável cross-browser).
- Não duplicar pattern manualmente em cada feature — DatePicker centralizado.
- Validação client+server (defesa em profundidade conforme convenção do repo: painel de erros topo do form lista issues Zod).

## 6. Plano de verificação

1. `bun check-types` — sem erros.
2. `bun fix` — formatação.
3. `bun dev:web`:
   - `/dashboard/promotions/new` → DatePickers mostram `DD/MM/AAAA`, abrem calendário pt-BR (jan/fev/mar...), seleção popula valor, endsAt < startsAt fica disabled.
   - `/dashboard/orders` → filtros `De`/`Até` idem, URL params permanecem `yyyy-MM-dd`.
   - `/dashboard/tools/new` → Select de categorias com >9 itens scrolla internamente em ~18rem.
   - `/dashboard/tools` filtros → idem para Select de fornecedor.
4. Submit promotion com `endsAt < startsAt` → painel de erros topo mostra "Data fim deve ser ≥ data início".

## 7. Fora de escopo

- Range picker único (`mode="range"`) — explicitamente recusado.
- Digitar data via teclado/máscara — explicitamente recusado.
- DatePicker com hora/timezone (datetime) — nenhum call site precisa hoje.
- Migrar Select para Combobox em locais com muitas opções — análise separada se UX exigir busca.

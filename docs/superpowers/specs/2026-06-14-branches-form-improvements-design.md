# Filiais — intervalo de almoço, campos obrigatórios e "Brasil todo" exclusivo

> Spec de design. Rota afetada: `/dashboard/branches/new` (e o drawer de edição `?edit=1`).
> Data: 2026-06-14.

## Contexto

Três melhorias na criação/edição de filiais, todas concentradas em:

- `packages/db/src/schema/inventory.ts` — tipo `BranchBusinessHoursPeriod` (jsonb)
- `apps/web/src/app/dashboard/branches/_components/branch-schema.ts` — validação Zod
- `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx` — UI dos campos
- `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx` — editor de faixas de CEP

Invariante de fundo: o banco é **compartilhado com o app ecommerce** (ADR-0004). `business_hours` é `jsonb` lido pelo site. Mudanças precisam ser retrocompatíveis e não mexer no ecommerce.

## Frente 1 — Intervalo de almoço nos horários

### Dados

Adicionar dois campos opcionais ao período (`packages/db/src/schema/inventory.ts`):

```ts
interface BranchBusinessHoursPeriod {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  breakStart: string | null; // novo — "fecha pro almoço às"
  breakEnd: string | null;    // novo — "reabre às"
}
```

`business_hours` é `jsonb` sem constraint → **sem migração destrutiva**. Filiais antigas vêm sem as chaves (= "sem intervalo"). Campos extras são ignorados pelo ecommerce se ele não os lê → retrocompatível.

### Validação (`branch-schema.ts`)

No `businessHoursPeriodSchema`:

- `breakStart` / `breakEnd` são `timeValueSchema` opcionais (string `HH:mm` ou null).
- Intervalo é **opcional**, mas par-completo: se um lado é preenchido, o outro vira obrigatório.
- Ordem exigida quando ambos preenchidos e `isOpen`: `opensAt < breakStart < breakEnd < closesAt`.
- A `transform` final zera `breakStart`/`breakEnd` quando `!isOpen` (espelha o tratamento de `opensAt`/`closesAt`).

### UI (`branch-form-fields.tsx`)

Apenas nas linhas **Dias de semana** e **Sábado** (não Feriados — feriado é só aberto/fechado). Quando o dia está aberto (`isOpen`), um controle discreto "+ intervalo" revela dois inputs `fecha às / reabre às`, no mesmo estilo dos inputs de abertura/fechamento (`sanitizeTime24h`, `tabular-nums`).

O grid atual (`grid-cols-[minmax(0,1fr)_auto_112px_112px]`) já está apertado → o intervalo provavelmente vai numa segunda linha do bloco do dia, com layout validado visualmente no `/dev-here 3007` antes de fechar. Erro do bloco continua no nível do grupo (`<FieldError>{errors.businessHours}</FieldError>`).

`defaultBusinessHours` ganha `breakStart: null, breakEnd: null` em cada período.

## Frente 2 — Campos obrigatórios

### Validação (`branch-schema.ts`)

Tornar obrigatórios: `phone`, `cep`, `street`, `streetNumber`, `neighborhood`, `city`, `state`.
`complement` segue opcional.

- `phone`: remover o `.optional()`/`.or(z.literal(""))`, manter a regex.
- `cep`: exigir os 8 dígitos (não mais opcional).
- `street`, `streetNumber`, `neighborhood`, `city`: `min(1, "… obrigatório")` mantendo os `max(...)`.
- `state`: UF obrigatória, manter `ufRegex`.
- **Remover** o `.refine(...)` condicional "Quando CEP é preenchido, rua/número/cidade/UF são obrigatórios" — vira redundante (tudo é incondicionalmente obrigatório agora).

`branchSchema` é compartilhado por criar e editar → cobre as duas telas (escopo: **criar e editar**).

### DB

Colunas seguem **`nullable`** no banco — obrigatoriedade fica só no Zod, **não** em `notNull`. Motivo: banco compartilhado + filiais legadas incompletas; `notNull` exigiria backfill e poderia quebrar o ecommerce.

### Consequência esperada

Abrir uma filial legada incompleta no drawer de edição e tentar salvar → acusa os campos faltantes até serem preenchidos. Comportamento desejado ("limpar a base"). Cada campo usa o padrão `<LabeledField required>` + `aria-invalid` + `<FieldError>` já vigente; `useFormErrors`/`focusFirstError` levam o foco ao primeiro inválido.

## Frente 3 — "Brasil todo" exclusivo

Puramente client-side em `cep-ranges-editor.tsx`. "Brasil todo" vira **modo exclusivo**:

- **Detecção do modo**: lista com exatamente 1 faixa igual ao `BRASIL_PRESET` (`from === "00000000" && to === "99999999"`).
- **Clicar "Brasil todo"** com qualquer faixa/estado na lista → **substitui tudo** pela única entrada Brasil (estados existentes saem).
- **Enquanto o modo está ativo** → "Adicionar faixa" e o select "Adicionar estado…" **somem** (não só desabilitados). Resta só a entrada "Brasil — atende todo o país" com botão remover.
- **Remover** a entrada Brasil → lista volta a vazia, botões reaparecem.
- Substituição é **direta**, sem dialog de confirmação (clicar no botão já é a intenção explícita).

Sem mudança de schema — `cepRanges` continua `Array<{from,to,label?}>`. A entrada Brasil já carrega `label: "Brasil"`.

## Fora de escopo

- Não mexer no app ecommerce. O dado de intervalo fica disponível no `jsonb`; renderizá-lo no site é tarefa do outro repo.
- Sem `notNull` no DB, sem migração versionada (push-only, ADR-0006).

## Verificação

- `bun check-types` + `bun check` (ultracite) antes de fechar.
- `bun dev:web` / `/dev-here 3007` — smoke visual de: linha de horário com intervalo (semana e sábado), submit do form com campos faltando (mensagens por campo), toggle "Brasil todo" substituindo estados e escondendo os botões, e remoção reabilitando.
- Editar uma filial legada incompleta e confirmar que o save é barrado até completar.

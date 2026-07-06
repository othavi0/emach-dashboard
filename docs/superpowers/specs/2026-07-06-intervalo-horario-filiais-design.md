# Intervalo de almoço nos horários das filiais

**Data:** 2026-07-06
**Status:** aprovado (brainstorming com o usuário)

## Contexto

As filiais têm horário de funcionamento em `branch.business_hours` (jsonb), mas os dados atuais registram só uma faixa contínua (ex: 08:00–18:00). Na vida real, todas as filiais fecham para almoço. A infraestrutura de intervalo **já existe** no código:

- `BranchBusinessHoursPeriod` (`packages/db/src/schema/inventory.ts:17`) já tem `breakStart`/`breakEnd`.
- O zod (`branch-schema.ts`) já valida o par início/fim e que o intervalo cai dentro do expediente.
- O form de criar/editar (`branch-form-fields.tsx`) já tem "Adicionar intervalo" (weekdays e saturday, via `BREAK_ROWS`).

Os gaps são exibição, defaults, dados e o storefront.

## Decisões (confirmadas com o usuário)

| Decisão | Valor |
| --- | --- |
| Intervalo do backfill (dias de semana) | 12:00–13:00 |
| Fechamento de weekdays | mantém 18:00 (o "8 até 17" da conversa era exemplo) |
| Sábado | sem intervalo (expediente 08:00–13:00 termina antes do almoço) |
| Balneário Camboriú (`business_hours = null`) | recebe o padrão completo |
| Default de filial nova | nasce com intervalo 12:00–13:00 em weekdays |
| Formato de exibição | dois turnos: `08:00–12:00 · 13:00–18:00` |

## Escopo

### 1. Exibição — `apps/web/src/lib/format/branch.ts`

`formatBusinessPeriod` passa a retornar dois turnos quando o período tem `breakStart` **e** `breakEnd`:

- Com intervalo: `"08:00–12:00 · 13:00–18:00"`
- Sem intervalo: `"08:00–18:00"` (comportamento atual, inalterado)
- Fechado/nulo: `"Fechado"` (inalterado)

Consumidor único: `branches/[id]/_components/overview-tab.tsx` — não muda. Testes novos em `apps/web/src/lib/format/branch.test.ts` cobrindo o caso com intervalo.

### 2. Default do form — `branches/_components/branch-schema.ts`

`defaultBusinessHours.weekdays` ganha `breakStart: "12:00"`, `breakEnd: "13:00"`. `saturday` e `holidays` inalterados.

Retoque de consistência em `branch-form-fields.tsx`: o handler do switch que religa um dia usa hoje `{ isOpen: true, opensAt: "08:00", closesAt: "18:00" }` hardcoded; passa a usar `defaultBusinessHours[row.key]` (com `isOpen: true`), para o dia religado voltar com o default correto — incluindo o intervalo em weekdays.

Atualizar `__tests__/branch-schema.test.ts` se algum teste asserta o default.

### 3. Backfill de dados (SQL direto no Supabase, sem código)

Sem mudança de schema — `business_hours` é jsonb.

- **Ribeirão Preto, Campinas, São Paulo:** `jsonb_set` em `weekdays` adicionando `breakStart: "12:00"`, `breakEnd: "13:00"`.
- **Balneário Camboriú:** `business_hours` completo = padrão novo (weekdays 08:00–18:00 com intervalo 12:00–13:00, sáb 08:00–13:00 sem intervalo, feriados fechado).

Verificação: `SELECT` pós-update conferindo os 4 registros + smoke visual em `/dashboard/branches/[id]` (overview mostrando dois turnos).

### 4. Issue no ecommerce — `othavi0/emach-ecommerce`

Criada **depois** do backfill, via `gh`. Em PT. Conteúdo:

- `branch.business_hours` agora vem populado com `breakStart`/`breakEnd` em `weekdays` (todas as filiais).
- O tipo `BranchBusinessHoursPeriod` já chega ao repo via CI sync do schema (ADR-0009) — sem ação de schema lá.
- A página de filial do storefront deve renderizar o formato dois turnos: `08:00–12:00 · 13:00–18:00`.
- Períodos sem intervalo (sábado) continuam faixa única.

## Fora de escopo

- Intervalo em `holidays` (dia fechado por padrão; `BREAK_ROWS` não o inclui).
- Horários por dia individual da semana (o modelo agrega weekdays/saturday/holidays — inalterado).
- Mudança em `docs/integration/admin-ecommerce.md` (o contrato não documenta business_hours hoje; a issue no ecommerce cobre a coordenação).

## Edge case documentado

Religar **Feriados** no switch do form usa o default da row (`isOpen: false` + horários nulos) com `isOpen: true` — o dia volta com horários vazios e o zod exige preencher abertura/fechamento no submit. Decisão consciente: feriado religado é raro e pede escolha explícita de horário.

## Erros e validação

Nada novo: o zod já valida par início/fim (`Preencha início e fim do intervalo`) e intervalo dentro do expediente (`Intervalo deve ficar dentro do expediente`). O form já tem UI de adicionar/remover intervalo.

## Testes

- Unit: `formatBusinessPeriod` com/sem intervalo; default do schema com intervalo.
- `bun verify` (check-types + check + test) antes de commit.
- Smoke visual: overview de uma filial com intervalo e do sábado sem intervalo.

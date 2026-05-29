# Horário de funcionamento de filiais

## Objetivo

Adicionar horário de funcionamento estruturado ao cadastro de filiais do dashboard. O telefone de contato já existe no schema e no formulário; portanto, o escopo novo é persistir e editar `businessHours` junto com os demais dados da filial.

## Modelo

Adicionar `branch.business_hours` como `jsonb` tipado no Drizzle:

```ts
{
  weekdays: { isOpen: true, opensAt: "08:00", closesAt: "18:00" },
  saturday: { isOpen: true, opensAt: "08:00", closesAt: "12:00" },
  holidays: { isOpen: false, opensAt: null, closesAt: null }
}
```

Domingo não é cadastrado e deve ser tratado como fechado. Cada categoria tem no máximo um período. Quando `isOpen` é `false`, os horários ficam vazios no formulário e persistem como `null`.

## Formulário e validação

O formulário de criação/edição de filial ganha a seção "Horário de funcionamento" com três linhas: "Dias de semana", "Sábado" e "Feriados". Cada linha permite marcar aberto/fechado e, quando aberta, exige `opensAt` e `closesAt` em `HH:mm`, com fechamento depois da abertura.

A validação fica em `branchSchema`, para manter create e edit consistentes. `normalizePayload` grava `businessHours` junto com `phone`, endereço, status e CEPs.

## Superfície de alteração

- `packages/db/src/schema/inventory.ts`: coluna e tipo do JSON.
- `apps/web/src/app/dashboard/branches/_components/branch-schema.ts`: schema Zod do horário.
- `apps/web/src/app/dashboard/branches/actions.ts`: normalização para insert/update.
- `apps/web/src/app/dashboard/branches/_components/branch-form.tsx`: default inicial.
- `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx`: inputs do horário.
- `apps/web/src/app/dashboard/branches/data.ts` e edição da filial: carregar `businessHours` no detalhe.

## Verificação

Rodar typecheck após a alteração. Como há mudança de schema Drizzle, aplicar no banco com `bun db:sync` antes de validar o fluxo em runtime.

# Design — Polish do form de filial (criar + drawer de editar)

> Data: 2026-06-01 · Escopo: `apps/web` · UI/UX puro — **sem mudança de schema**.

## Objetivo

Melhorar a UI/UX do formulário de filial, que aparece em dois contextos compartilhando o mesmo `BranchFormFields`:
- **Drawer "Editar filial"** (`branch-edit-sheet.tsx` via `EntityEditSheet`, estreito `sm:max-w-lg`).
- **Página "Nova filial"** (`new/page.tsx` via `branch-form.tsx`).

Aplicar boas práticas (placeholders, UF como select, máscaras já existentes), reorganizar campos em linhas agrupadas e arrumar o bloco de horário de funcionamento que aperta no drawer.

## Decisões (validadas no companion visual)

| Tema | Decisão |
|---|---|
| Layout dos campos | **Agrupado em linhas** (direção B): Nome+Status, CEP+Rua, Nº+Complemento, Cidade+UF na mesma linha. |
| Horário de funcionamento | **Switch + horas inline** (opção A): `Switch` substitui o select "Aberto/Fechado"; quando desligado, os campos de hora somem e aparece "Fechado". |
| UF | Input livre → **Select** com as 27 UFs. |
| Placeholders | Em todos os campos, com exemplos reais. |
| Telefone / CEP | Máscaras atuais mantidas (`phoneBrMask`, `cepMask` + auto-resolve ViaCEP). |
| Schema | **Inalterado** — sem CNPJ, sem novos campos. Validação Zod (`branch-schema.ts`) permanece. |

## Contexto verificado

- `BranchFormFields` (`branches/_components/branch-form-fields.tsx`) é o componente único compartilhado por create e edit. É o coração da mudança.
- `MaskedInput` repassa props do `Input` (incl. `placeholder`) — placeholders funcionam direto.
- `Switch` existe em `@emach/ui/components/switch`.
- Não há lista de UFs reutilizável no projeto — será criada.
- `new/page.tsx` usa um `<h1>` manual com `font-serif text-4xl` — destoa do padrão: o componente canônico `PageHeader` usa `font-serif text-2xl`. Correção = usar `PageHeader` (não trocar a fonte; o serif text-2xl é o padrão de títulos de página).
- Schema atual: telefone e UF são `string`; o Switch apenas controla `businessHours[period].isOpen`, que já existe. Nenhuma mudança de contrato.

## Componentes

### A — `BranchFormFields` (reorganização + boas práticas)

Reescrita do JSX mantendo a mesma interface de props (`branchId`, `disabled`, `onPatch`, `showTeamSection`, `values`) e o mesmo fluxo `onPatch`.

**Identidade:** linha com Nome (flex 2) + Status (flex 1). Placeholder do Nome: `Ex: Filial São Paulo — Paulista`. Hint do Status preservado.

**Contato:** Telefone (mantém `MaskedInput phoneBrMask`), placeholder `(11) 98765-4321`.

**Endereço** (linhas agrupadas via grid):
- CEP (flex 1, `CepInput` com ícone de loading já existente) + Rua (flex 2). Placeholder CEP `00000-000`, Rua `Preenchida pelo CEP`.
- Número (flex 1) + Complemento (flex 2). Placeholders `1578` / `Conj., sala…`.
- Bairro (linha cheia). Placeholder `Bela Vista`.
- Cidade (flex 2) + **UF Select** (flex 1).

Grids usam `grid grid-cols-[…]` que cabem no drawer (~460px úteis). Em viewport muito estreito (`max-sm`), colapsam para 1 coluna (`grid-cols-1 sm:grid-cols-[…]`). Sem layout de seções em 2 colunas — mantém um componente único DRY para os dois contextos.

**Horário de funcionamento:** cada linha vira grid `grid-cols-[1fr_auto_64px_64px]` com: label · `Switch` · hora abertura · hora fechamento. Quando `!isOpen`, ocultar os dois time inputs e renderizar `<span>Fechado</span>` (`text-muted-foreground italic`) ocupando as duas colunas. O `Switch` chama o mesmo `patchBusinessHours(key, value ? {isOpen:true, opensAt:"08:00", closesAt:"18:00"} : {isOpen:false, opensAt:null, closesAt:null})` que o select fazia. Hint "Domingos são tratados como fechado" mantido.

**Faixas de CEP / Equipe:** inalterados (Equipe só em `showTeamSection`).

**Divisores:** entre seções, `border-t border-border` com espaçamento consistente (`SectionHeader` mantido como rótulo uppercase).

### B — `UfSelect` (novo componente)

`apps/web/src/components/uf-select.tsx` — `Select` controlado com as 27 UFs + DF.

```tsx
"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@emach/ui/components/select";

const BR_UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"] as const;

interface Props { id?: string; value: string | undefined; onChange: (uf: string | undefined) => void; disabled?: boolean; }

export function UfSelect({ id, value, onChange, disabled }: Props) {
	return (
		<Select disabled={disabled} onValueChange={(v) => onChange(v || undefined)} value={value ?? ""}>
			<SelectTrigger id={id}><SelectValue placeholder="UF" /></SelectTrigger>
			<SelectContent>
				{BR_UFS.map((uf) => (<SelectItem key={uf} value={uf}>{uf}</SelectItem>))}
			</SelectContent>
		</Select>
	);
}
```

Substitui o `<Input maxLength={2} … onChange toUpperCase>` no `BranchFormFields`. Mantém `onPatch({ state })`. Reutilizável por outras features (clientes) no futuro.

### C — `new/page.tsx` (usar PageHeader)

Substituir o `<div>` com `<h1 font-serif text-4xl>` + `<p>` manuais pelo componente `PageHeader` (`@/components/page-header`) — `title="Nova filial"`, `description="Cadastre uma filial…"`. Alinha com todas as outras páginas (serif `text-2xl`) e remove o título oversized.

## O que NÃO muda

- `branch-schema.ts` (validação, contrato).
- `actions.ts` (`createBranch`/`updateBranch`).
- `EntityEditSheet` (header/footer fixos já corretos).
- `CepInput`, `CepRangesEditor`, `ResponsibleUserSelect`, máscaras.

## Verificação

- `bun check-types`.
- Smoke visual (dev `:3005`) via claude-in-chrome:
  - `/dashboard/branches/new`: título sem serif; campos agrupados em linhas; UF é select; placeholders visíveis; horário com switch; criar uma filial salva.
  - `/dashboard/branches/<id>?edit=1`: drawer com mesmo layout; linhas cabem sem overflow horizontal; switch de horário oculta/mostra horas; salvar atualiza.
  - Caso de erro: CEP preenchido sem rua/número → painel de erros aparece (validação intacta).

## Fora de escopo

- CNPJ / qualquer campo novo / mudança de schema.
- Faixas de CEP (editor mantido como está).
- Refactor de outras features que usem `MaskedInput`/`Select`.

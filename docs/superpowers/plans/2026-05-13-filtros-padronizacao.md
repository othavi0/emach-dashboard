# Filtros — Padronização DatePicker + Limpar sempre visível

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar todos os filtros de período do dashboard p/ usar o componente `<DatePicker>` e tornar o botão "Limpar filtros" sempre visível (disabled quando não há filtro ativo), documentando a convenção.

**Architecture:** Extrair helpers `parseDateParam`/`formatDateParam` (hoje duplicados inline em `order-list-filters.tsx`) para `apps/web/src/lib/date-params.ts`. Atualizar `customer-filters.tsx` p/ trocar `<Input type="date">` por `<DatePicker>` reaproveitando esses helpers. Atualizar `FiltersBar` p/ renderizar o botão sempre, controlado por `disabled={!hasActive}`. Documentar em `apps/web/CLAUDE.md`.

**Tech Stack:** Next 16 / React 19, `@emach/ui/components/date-picker` (shadcn + Base UI Popover + Calendar com locale `ptBR`), `@emach/ui/components/button` (shadcn — suporta `disabled` nativo).

Spec de referência: `docs/superpowers/specs/2026-05-13-filtros-padronizacao-design.md`.

Sem testes unitários: feature é puramente visual/comportamental sem lógica nova. Verificação = `bun check-types` + smoke manual via `bun dev:web`.

---

### Task 1: Extrair helpers de data p/ módulo compartilhado

**Files:**
- Create: `apps/web/src/lib/date-params.ts`

- [ ] **Step 1: Criar o módulo**

```ts
// apps/web/src/lib/date-params.ts
export function parseDateParam(value: string): Date | undefined {
	if (!value) {
		return;
	}
	const d = new Date(`${value}T00:00:00`);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDateParam(date: Date | undefined): string {
	if (!date) {
		return "";
	}
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/date-params.ts
git commit -m "feat(web): extrai helpers parseDateParam/formatDateParam"
```

---

### Task 2: Migrar `order-list-filters.tsx` p/ usar os helpers compartilhados

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`

- [ ] **Step 1: Remover funções locais e importar do módulo**

Localizar (linhas ~37-53) e remover:

```ts
function parseDateParam(value: string): Date | undefined { ... }
function formatDateParam(date: Date | undefined): string { ... }
```

Adicionar import junto aos demais imports `@/`:

```ts
import { formatDateParam, parseDateParam } from "@/lib/date-params";
```

Manter ordem alfabética dos imports (ultracite reordena automaticamente via hook).

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke manual**

Run: `bun dev:web`
Visitar `http://localhost:3001/dashboard/orders`.
Expected: campos "De" e "Até" continuam abrindo o popover do DatePicker, selecionar uma data continua aplicando `?from=YYYY-MM-DD` na URL, `min` em "Até" continua bloqueando datas antes de "De".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx
git commit -m "refactor(orders): reutiliza helpers compartilhados de data"
```

---

### Task 3: Tornar botão "Limpar filtros" sempre visível em `FiltersBar`

**Files:**
- Modify: `apps/web/src/components/filters-bar.tsx`

- [ ] **Step 1: Substituir conditional render por sempre-render com disabled**

Substituir o corpo do componente por:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import type { ReactNode } from "react";

interface FiltersBarProps {
	children: ReactNode;
	hasActive?: boolean;
	onClear?: () => void;
}

export function FiltersBar({ children, hasActive, onClear }: FiltersBarProps) {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			{children}
			<Button
				className="md:self-end"
				disabled={!hasActive}
				onClick={onClear}
				size="sm"
				type="button"
				variant="ghost"
			>
				Limpar filtros
			</Button>
		</div>
	);
}
```

Notas:
- `onClear` deixa de ser obrigatório-condicional na lógica de render; quando ausente, o `onClick={undefined}` é no-op. Se `hasActive=true` mas `onClear` ausente, o clique simplesmente não faz nada — não regrede comportamento, mas se quiser endurecer, todos os call-sites atuais já passam `onClear`.
- A aparência "disabled" vem do shadcn Button: `disabled:pointer-events-none disabled:opacity-50` (default da variant).

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 3: Smoke manual**

Run: `bun dev:web`
Visitar `http://localhost:3001/dashboard/orders` (já usa FiltersBar).
Expected:
- Sem filtros: botão "Limpar filtros" visível, atenuado (opacity-50), sem hover ativo, cursor `not-allowed`.
- Aplicar qualquer filtro (busca, data, filial): botão acende (cor normal, hover funciona); clique limpa querystring; botão volta ao estado disabled.
- Sem layout jump entre estados.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/filters-bar.tsx
git commit -m "feat(filters-bar): botão Limpar sempre visível, disabled sem filtros"
```

---

### Task 4: Migrar `customer-filters.tsx` para `<DatePicker>`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx`

- [ ] **Step 1: Trocar imports**

No topo do arquivo, adicionar:

```ts
import { DatePicker } from "@emach/ui/components/date-picker";
import { formatDateParam, parseDateParam } from "@/lib/date-params";
```

Manter os outros imports existentes.

- [ ] **Step 2: Substituir campo "Cadastro de"**

Localizar bloco (atualmente em ~164-177):

```tsx
<div className="flex flex-col gap-1 md:w-36">
	<label
		className="text-muted-foreground text-xs"
		htmlFor="customers-created-from"
	>
		Cadastro de
	</label>
	<Input
		defaultValue={filters.createdFrom ?? ""}
		id="customers-created-from"
		onChange={(e) => setParam("createdFrom", e.target.value || null)}
		type="date"
	/>
</div>
```

Substituir por:

```tsx
<div className="flex flex-col gap-1 md:w-40">
	<label
		className="text-muted-foreground text-xs"
		htmlFor="customers-created-from"
	>
		Cadastro de
	</label>
	<DatePicker
		id="customers-created-from"
		onChange={(d) =>
			setParam("createdFrom", formatDateParam(d) || null)
		}
		value={parseDateParam(filters.createdFrom ?? "")}
	/>
</div>
```

- [ ] **Step 3: Substituir campo "Cadastro até"**

Localizar bloco (atualmente em ~179-192):

```tsx
<div className="flex flex-col gap-1 md:w-36">
	<label
		className="text-muted-foreground text-xs"
		htmlFor="customers-created-to"
	>
		Cadastro até
	</label>
	<Input
		defaultValue={filters.createdTo ?? ""}
		id="customers-created-to"
		onChange={(e) => setParam("createdTo", e.target.value || null)}
		type="date"
	/>
</div>
```

Substituir por:

```tsx
<div className="flex flex-col gap-1 md:w-40">
	<label
		className="text-muted-foreground text-xs"
		htmlFor="customers-created-to"
	>
		Cadastro até
	</label>
	<DatePicker
		id="customers-created-to"
		min={parseDateParam(filters.createdFrom ?? "")}
		onChange={(d) =>
			setParam("createdTo", formatDateParam(d) || null)
		}
		value={parseDateParam(filters.createdTo ?? "")}
	/>
</div>
```

A largura passa de `md:w-36` (144px) para `md:w-40` (160px) para acomodar o botão do DatePicker (`CalendarIcon` + texto `dd/MM/yyyy`).

- [ ] **Step 4: Verificar tipos**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 5: Smoke manual**

Run: `bun dev:web`
Visitar `http://localhost:3001/dashboard/customers`.
Expected:
- Os 2 campos "Cadastro de" / "Cadastro até" agora renderizam o mesmo botão visual do DatePicker usado em `/dashboard/orders` (`CalendarIcon` + placeholder "Selecionar data").
- Clicar abre o Popover com Calendar pt-BR.
- Selecionar uma data fecha o popover, aplica `?createdFrom=YYYY-MM-DD` (ou `createdTo`) na URL e dispara o reload server-side.
- Em "Cadastro até", o calendar bloqueia datas anteriores à selecionada em "Cadastro de".
- Botão "Limpar filtros" visível sempre, disabled antes de aplicar nada.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-filters.tsx
git commit -m "feat(customers): usa DatePicker padronizado em filtros de cadastro"
```

---

### Task 5: Documentar a convenção em `apps/web/CLAUDE.md`

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Inserir bullets na seção "Convenções de UX em forms"**

Localizar a seção `## Convenções de UX em forms`. Adicionar logo após o bullet "Markdown na descrição" (último item da lista atual) os 3 bullets a seguir:

```md
- **Filtros de período:** sempre usar `<DatePicker>` de `@emach/ui/components/date-picker`. Nunca `<Input type="date">` nativo — quebra o design system (cor, fonte, hover) e não respeita o locale.
- **Helpers de data em querystring:** `parseDateParam` / `formatDateParam` em `apps/web/src/lib/date-params.ts`. Strings sempre `YYYY-MM-DD`, parseadas no fuso local (concatena `T00:00:00`).
- **`<FiltersBar>`:** sempre renderiza o botão "Limpar filtros". Quando `hasActive=false`, vem com `disabled` (`opacity-50`, `pointer-events-none`) — sinaliza a ação sem causar layout jump.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(web): documenta convenção de DatePicker e FiltersBar"
```

---

### Task 6: Verificação final integrada

- [ ] **Step 1: Type-check de todo o workspace web**

Run: `bun --cwd apps/web check-types`
Expected: zero erros.

- [ ] **Step 2: Lint/format**

Run: `bun fix`
Expected: nenhum diff manual; o hook PostToolUse já formatou cada Edit.

- [ ] **Step 3: Smoke run-time consolidado**

Run: `bun dev:web` (se ainda não estiver rodando)

Visitar em sequência:

1. `http://localhost:3001/dashboard/customers` (sem querystring)
   - DatePickers nos 2 campos de cadastro, ambos com placeholder "Selecionar data".
   - Botão "Limpar filtros" visível, disabled.

2. `http://localhost:3001/dashboard/customers?q=teste`
   - Botão "Limpar filtros" ativo (clicável); clicar volta para `/dashboard/customers` limpo.

3. `http://localhost:3001/dashboard/customers` → selecionar uma data em "Cadastro de"
   - URL recebe `?createdFrom=YYYY-MM-DD`.
   - Selecionar "Cadastro até" antes da data anterior: bloqueado pelo `min`.

4. `http://localhost:3001/dashboard/orders` (sem querystring)
   - Mesmo padrão visual nos DatePickers "De"/"Até".
   - Botão "Limpar filtros" visível, disabled.

5. `http://localhost:3001/dashboard/orders?tab=paid&q=2026`
   - Botão "Limpar filtros" ativo; clicar volta para `/dashboard/orders` limpo, mantendo o tab default "Todos".

6. Validar via DevTools que o botão Limpar tem `disabled` attribute quando inativo e que o cursor é `not-allowed`.

Expected: todos os passos passam sem erros visíveis no console; `nextjs_call <port> get_errors` (via MCP next-devtools) retorna vazio.

- [ ] **Step 4: (Opcional, se houver issue) Re-rodar tasks afetadas**

Sem novo commit — verificação final só consolida.

---

## Self-review do plano

- **Cobertura do spec:** seção 1 (DatePicker único) → Tasks 2/4; seção 2 (helpers) → Task 1; seção 3 (botão sempre visível) → Task 3; seção 4 (doc) → Task 5; seção 5 (verificação) → Task 6. Sem gaps.
- **Placeholders:** nenhum "TODO"/"TBD"/"add appropriate"; todo step com código ou comando explícito.
- **Consistência de tipos:** `parseDateParam`/`formatDateParam` definidas em Task 1 e usadas com a mesma assinatura em Tasks 2 e 4. `FiltersBarProps` em Task 3 mantém o mesmo contrato de antes (mesmo shape, só comportamento de render mudou).
- **Não-objetivos respeitados:** não introduz range-picker; não muda querystring; não toca outras telas (grep confirmado).

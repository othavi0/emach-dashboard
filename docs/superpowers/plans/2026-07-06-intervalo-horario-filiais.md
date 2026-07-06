# Intervalo de almoço nos horários das filiais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir e popular o intervalo de almoço (`breakStart`/`breakEnd`) nos horários de funcionamento das filiais, e abrir issue no ecommerce para adaptar o storefront.

**Architecture:** Zero mudança de schema — `branch.business_hours` é `jsonb` e o tipo `BranchBusinessHoursPeriod` já tem `breakStart`/`breakEnd`; o zod e o form já validam/editam intervalo. O trabalho é: (1) formatter de exibição passa a renderizar dois turnos, (2) default de filial nova nasce com intervalo, (3) backfill via SQL direto no Supabase, (4) issue no repo do ecommerce.

**Tech Stack:** Next 16 / React 19, vitest, Drizzle (jsonb), Supabase MCP (`execute_sql`), `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-07-06-intervalo-horario-filiais-design.md`

## Global Constraints

- Monorepo turbo/bun — CWD é a raiz `emach-dashboard`; usar paths absolutos nos comandos de arquivo.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read antes de re-tentar (hook PostToolUse roda `bun fix` e pode reformatar).
- Commits: Conventional Commits em PT, subject ≤50 chars. O lefthook roda `bun fix` + `git add -u` no commit.
- Proibido: `console.log`, `any`, `@ts-ignore`, `useMemo`/`useCallback` manuais.
- Antes do commit final de código: `bun verify` (check-types + check + test).
- Formato de exibição com intervalo: `08:00–12:00 · 13:00–18:00` (en-dash `–` entre horas, ` · ` entre turnos).
- Valores do backfill: intervalo `12:00`–`13:00` só em `weekdays`; sábado sem intervalo; fechamento de weekdays permanece `18:00`.
- Projeto Supabase: `wrxohbzepoyscsacjzvd` (emach-ferramentas).

---

### Task 1: Formatter dois turnos

**Files:**
- Modify: `apps/web/src/lib/format/branch.ts:34-41`
- Test: `apps/web/src/lib/format/branch.test.ts`

**Interfaces:**
- Consumes: tipo `BranchBusinessHoursPeriod` de `@emach/db/schema/inventory` (já importado no arquivo).
- Produces: `formatBusinessPeriod(p)` — mesma assinatura, novo comportamento: com `breakStart` E `breakEnd` presentes retorna `"${opensAt}–${breakStart} · ${breakEnd}–${closesAt}"`; sem intervalo, `"${opensAt}–${closesAt}"`; fechado/nulo, `"Fechado"`. Consumidor existente (`overview-tab.tsx`) não muda.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("formatBusinessPeriod", ...)` em `apps/web/src/lib/format/branch.test.ts` (depois do teste "formata período aberto"):

```ts
	it("formata período com intervalo em dois turnos", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: "12:00",
				breakEnd: "13:00",
			})
		).toBe("08:00–12:00 · 13:00–18:00");
	});
	it("ignora intervalo incompleto (só breakStart)", () => {
		expect(
			formatBusinessPeriod({
				isOpen: true,
				opensAt: "08:00",
				closesAt: "18:00",
				breakStart: "12:00",
				breakEnd: null,
			})
		).toBe("08:00–18:00");
	});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/lib/format/branch.test.ts`
Expected: FAIL — `formata período com intervalo em dois turnos` recebe `"08:00–18:00"` em vez de `"08:00–12:00 · 13:00–18:00"`.

- [ ] **Step 3: Implementar**

Em `apps/web/src/lib/format/branch.ts`, substituir o corpo de `formatBusinessPeriod`:

```ts
export function formatBusinessPeriod(
	p: BranchBusinessHoursPeriod | null | undefined
): string {
	if (!(p?.isOpen && p.opensAt && p.closesAt)) {
		return "Fechado";
	}
	if (p.breakStart && p.breakEnd) {
		return `${p.opensAt}–${p.breakStart} · ${p.breakEnd}–${p.closesAt}`;
	}
	return `${p.opensAt}–${p.closesAt}`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test src/lib/format/branch.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format/branch.ts apps/web/src/lib/format/branch.test.ts
git commit -m "feat: exibe intervalo em dois turnos na filial"
```

---

### Task 2: Default de filial nova com intervalo + switch reusa default

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-schema.ts:13-35`
- Modify: `apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx:23,302-320`
- Test: `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`

**Interfaces:**
- Consumes: `defaultBusinessHours: BranchBusinessHours` exportado de `./branch-schema` (já existe; passa a ter intervalo em `weekdays`).
- Produces: `defaultBusinessHours.weekdays` = `{ isOpen: true, opensAt: "08:00", closesAt: "18:00", breakStart: "12:00", breakEnd: "13:00" }`. O handler do Switch em `branch-form-fields.tsx` religa um dia com `{ ...defaultBusinessHours[row.key], isOpen: true }`.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts` (o arquivo já importa de `../branch-schema`; garantir que `defaultBusinessHours` está no import):

```ts
	it("default de weekdays nasce com intervalo 12:00–13:00", () => {
		expect(defaultBusinessHours.weekdays.breakStart).toBe("12:00");
		expect(defaultBusinessHours.weekdays.breakEnd).toBe("13:00");
		expect(defaultBusinessHours.saturday.breakStart).toBeNull();
	});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`
Expected: FAIL — `breakStart` é `null`.

- [ ] **Step 3: Implementar o default**

Em `branch-schema.ts`, no objeto `defaultBusinessHours`, trocar o bloco `weekdays`:

```ts
	weekdays: {
		isOpen: true,
		opensAt: "08:00",
		closesAt: "18:00",
		breakStart: "12:00",
		breakEnd: "13:00",
	},
```

(`saturday` e `holidays` inalterados.)

- [ ] **Step 4: Switch religa com o default da row**

Em `branch-form-fields.tsx`:

a) Trocar o import type por import com valor (linha 23):

```ts
import { type BranchFormValues, defaultBusinessHours } from "./branch-schema";
```

b) No handler `onCheckedChange` do `Switch` (~linha 306), trocar o branch `checked` hardcoded:

```tsx
										onCheckedChange={(checked) =>
											patchBusinessHours(
												row.key,
												checked
													? { ...defaultBusinessHours[row.key], isOpen: true }
													: {
															isOpen: false,
															opensAt: null,
															closesAt: null,
															breakStart: null,
															breakEnd: null,
														}
											)
										}
```

Nota: para `holidays` o default é `isOpen: false` com horários nulos — o spread + `isOpen: true` religa o dia com campos vazios, e o zod exige preencher abertura/fechamento no submit. Comportamento aceitável (feriado religado é caso raro e exige escolha consciente do horário).

- [ ] **Step 5: Rodar testes e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts`
Expected: PASS (suíte inteira do arquivo).

- [ ] **Step 6: Gate completo**

Run: `bun verify`
Expected: check-types OK, check (ultracite) OK, testes verdes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/branch-schema.ts apps/web/src/app/dashboard/branches/_components/branch-form-fields.tsx apps/web/src/app/dashboard/branches/_components/__tests__/branch-schema.test.ts
git commit -m "feat: filial nova nasce com intervalo padrão"
```

---

### Task 3: Backfill dos dados no Supabase

**Files:** nenhum (dados via SQL direto; sem migration — jsonb, push-only ADR-0006).

**Interfaces:**
- Consumes: projeto Supabase `wrxohbzepoyscsacjzvd`, tool MCP `mcp__supabase__execute_sql` (carregar via ToolSearch se deferred).
- Produces: 4 filiais com `business_hours.weekdays.breakStart/breakEnd = "12:00"/"13:00"`.

- [ ] **Step 1: Adicionar intervalo nas filiais que já têm horário**

Executar via `mcp__supabase__execute_sql` (project_id `wrxohbzepoyscsacjzvd`):

```sql
UPDATE branch
SET
  business_hours = jsonb_set(
    jsonb_set(business_hours, '{weekdays,breakStart}', '"12:00"'),
    '{weekdays,breakEnd}', '"13:00"'
  ),
  updated_at = now()
WHERE business_hours IS NOT NULL
  AND business_hours->'weekdays'->>'isOpen' = 'true'
  AND business_hours->'weekdays'->>'breakStart' IS NULL;
```

Expected: 3 linhas afetadas (Ribeirão Preto, Campinas, São Paulo).

- [ ] **Step 2: Popular a filial sem horário (Balneário Camboriú)**

```sql
UPDATE branch
SET
  business_hours = '{
    "weekdays": {"isOpen": true, "opensAt": "08:00", "closesAt": "18:00", "breakStart": "12:00", "breakEnd": "13:00"},
    "saturday": {"isOpen": true, "opensAt": "08:00", "closesAt": "13:00", "breakStart": null, "breakEnd": null},
    "holidays": {"isOpen": false, "opensAt": null, "closesAt": null, "breakStart": null, "breakEnd": null}
  }'::jsonb,
  updated_at = now()
WHERE business_hours IS NULL;
```

Expected: 1 linha afetada.

- [ ] **Step 3: Verificar**

```sql
SELECT name,
  business_hours->'weekdays'->>'breakStart' AS break_start,
  business_hours->'weekdays'->>'breakEnd' AS break_end,
  business_hours->'saturday'->>'breakStart' AS sat_break
FROM branch ORDER BY name;
```

Expected: 4 linhas, todas com `break_start = 12:00`, `break_end = 13:00`, `sat_break = null`.

- [ ] **Step 4: Smoke visual**

Com `bun dev:web` rodando, visitar `/dashboard/branches` → abrir uma filial → aba Visão geral deve mostrar `Dias de semana 08:00–12:00 · 13:00–18:00`, `Sábado 08:00–13:00`, `Feriados Fechado`. Abrir o drawer de edição (`?edit=1`) e conferir que o intervalo aparece preenchido nos inputs.

---

### Task 4: Issue no ecommerce

**Files:** nenhum (issue via `gh` no repo `othavi0/emach-ecommerce`). Executar SÓ depois da Task 3 (o dado já deve existir quando o dev do storefront olhar).

**Interfaces:**
- Consumes: `gh` CLI autenticado; formato de exibição definido na Task 1.
- Produces: issue aberta no `othavi0/emach-ecommerce`.

- [ ] **Step 1: Criar a issue**

```bash
gh issue create --repo othavi0/emach-ecommerce \
  --title "Filiais: exibir intervalo de almoço no horário de funcionamento" \
  --body "## Contexto

O dashboard admin passou a registrar o intervalo de almoço das filiais em \`branch.business_hours\` (jsonb). Os campos \`breakStart\`/\`breakEnd\` de cada período (\`weekdays\`/\`saturday\`/\`holidays\`) agora vêm populados — todas as filiais têm intervalo \`12:00\`–\`13:00\` em dias de semana; sábado segue sem intervalo.

O tipo \`BranchBusinessHoursPeriod\` já chega a este repo via CI sync do schema (ADR-0009) — **nenhuma ação de schema aqui**.

## O que adaptar

Onde o storefront exibe horário de funcionamento de filial, renderizar dois turnos quando \`breakStart\` e \`breakEnd\` estiverem presentes:

- Com intervalo: \`08:00–12:00 · 13:00–18:00\`
- Sem intervalo (ex.: sábado): \`08:00–13:00\`
- \`isOpen: false\` ou horários nulos: \`Fechado\`

Referência da implementação no dashboard: \`apps/web/src/lib/format/branch.ts\` (\`formatBusinessPeriod\`).

## Dados atuais (produção dev)

As 4 filiais (Ribeirão Preto, Campinas, São Paulo, Balneário Camboriú) já têm o intervalo populado no banco compartilhado."
```

Expected: URL da issue impressa no stdout.

- [ ] **Step 2: Reportar a URL da issue ao usuário**

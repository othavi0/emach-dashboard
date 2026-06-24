# Simplificação do editor de Zonas & Tabela (frete) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o campo "Nome" obrigatório das zonas de frete (derivando o nome da cobertura de CEP no servidor) e limpar a UX do editor de faixas de CEP présetadas.

**Architecture:** O nome da zona deixa de ser entrada do usuário e passa a ser derivado no servidor a partir dos `cepRanges` (helper puro `deriveZoneName`). A coluna `carrier_zone.name` (`notNull`, banco compartilhado com e-commerce) é preservada — sem migração. As faixas de CEP em modo `presetOnly` viram chips de cobertura não-editáveis; o modo livre (filiais) fica intocado.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45, Zod, Vitest (node env), Tailwind, base-ui (`@emach/ui`).

## Global Constraints

- **Idioma:** UI/copy em pt-BR; identificadores e mensagens de erro em EN quando aplicável.
- **Anti-patterns banidos:** sem `console.*` (usar `logger`), sem `: any`/`as any`/`@ts-ignore`, sem `useMemo`/`useCallback` manuais (React Compiler ativo), sem `React.forwardRef`.
- **Server actions:** todas começam com `await requireCapability(cap)`; retorno `ActionResult<T>`; validação Zod `safeParse`; erro de DB via `getPgError(e)`; `revalidatePath` após mutação. **Não remover** os guards existentes.
- **`carrier_zone.name` permanece `notNull` no DB — NÃO alterar schema do banco** (`packages/db/src/schema/shipping.ts`). Banco compartilhado (ADR-0009).
- **`CepRangesEditor` é compartilhado com filiais** — toda mudança nele fica gated por `presetOnly === true`.
- **Verificação:** `bun --cwd apps/web check-types` após cada task; `bun check` (ultracite) antes de commit; smoke visual obrigatório (check-types não pega regressão de UI/SSR).
- **Commits:** Conventional Commits em pt-BR, subject ≤50 chars.
- **IDs:** `crypto.randomUUID()` no caller (já é o padrão nas actions).

---

### Task 1: Helper `deriveZoneName` (puro, TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/shipping/_lib/derive-zone-name.ts`
- Test: `apps/web/src/app/dashboard/shipping/_lib/__tests__/derive-zone-name.test.ts`

**Interfaces:**
- Consumes: `BRASIL_PRESET`, `UF_CEP_PRESETS` de `@/app/dashboard/branches/_components/cep-presets`.
- Produces: `deriveZoneName(cepRanges: { from: string; to: string; label?: string }[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/dashboard/shipping/_lib/__tests__/derive-zone-name.test.ts
import { describe, expect, it } from "vitest";
import { deriveZoneName } from "../derive-zone-name";

describe("deriveZoneName", () => {
	it("Brasil todo → 'Brasil'", () => {
		expect(
			deriveZoneName([{ from: "00000000", to: "99999999", label: "Brasil" }])
		).toBe("Brasil");
	});

	it("um estado → nome completo", () => {
		expect(
			deriveZoneName([{ from: "90000000", to: "99999999" }])
		).toBe("Rio Grande do Sul");
	});

	it("estado multi-faixa (Amazonas, 2 faixas) → 1 nome", () => {
		expect(
			deriveZoneName([
				{ from: "69000000", to: "69299999" },
				{ from: "69400000", to: "69899999" },
			])
		).toBe("Amazonas");
	});

	it("2–3 estados → siglas unidas", () => {
		expect(
			deriveZoneName([
				{ from: "90000000", to: "99999999" }, // RS
				{ from: "88000000", to: "89999999" }, // SC
				{ from: "80000000", to: "87999999" }, // PR
			])
		).toBe("RS, SC, PR");
	});

	it("≥4 estados → 'N estados'", () => {
		expect(
			deriveZoneName([
				{ from: "90000000", to: "99999999" }, // RS
				{ from: "88000000", to: "89999999" }, // SC
				{ from: "80000000", to: "87999999" }, // PR
				{ from: "01000000", to: "19999999" }, // SP
			])
		).toBe("4 estados");
	});

	it("vazio ou faixa não-preset → 'Faixa personalizada'", () => {
		expect(deriveZoneName([])).toBe("Faixa personalizada");
		expect(deriveZoneName([{ from: "12345000", to: "12345999" }])).toBe(
			"Faixa personalizada"
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test derive-zone-name`
Expected: FAIL — `Cannot find module '../derive-zone-name'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/dashboard/shipping/_lib/derive-zone-name.ts
import {
	BRASIL_PRESET,
	UF_CEP_PRESETS,
} from "@/app/dashboard/branches/_components/cep-presets";

interface Range {
	from: string;
	to: string;
	label?: string;
}

function ufForRange(r: Range): string | null {
	const preset = UF_CEP_PRESETS.find((p) =>
		p.ranges.some((pr) => pr.from === r.from && pr.to === r.to)
	);
	return preset?.uf ?? null;
}

/** Nome legível da zona derivado da cobertura de CEP (sem entrada do usuário). */
export function deriveZoneName(cepRanges: Range[]): string {
	if (cepRanges.length === 0) {
		return "Faixa personalizada";
	}
	const isBrasil = cepRanges.some(
		(r) => r.from === BRASIL_PRESET.from && r.to === BRASIL_PRESET.to
	);
	if (isBrasil) {
		return "Brasil";
	}
	const ufs: string[] = [];
	for (const r of cepRanges) {
		const uf = ufForRange(r);
		if (uf && !ufs.includes(uf)) {
			ufs.push(uf);
		}
	}
	if (ufs.length === 0) {
		return "Faixa personalizada";
	}
	if (ufs.length === 1) {
		const preset = UF_CEP_PRESETS.find((p) => p.uf === ufs[0]);
		return preset?.name ?? (ufs[0] as string);
	}
	if (ufs.length <= 3) {
		return ufs.join(", ");
	}
	return `${ufs.length} estados`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test derive-zone-name`
Expected: PASS (6 testes).

- [ ] **Step 5: check-types + commit**

```bash
bun --cwd apps/web check-types
git add apps/web/src/app/dashboard/shipping/_lib/derive-zone-name.ts apps/web/src/app/dashboard/shipping/_lib/__tests__/derive-zone-name.test.ts
git commit -m "feat(frete): helper deriveZoneName a partir do CEP"
```

---

### Task 2: Derivar nome no servidor (actions.ts)

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (sites de write/metadata de zona: ~256, ~373, ~386, ~404)

**Interfaces:**
- Consumes: `deriveZoneName` (Task 1).
- Produces: nenhum símbolo novo; comportamento — o nome persistido em `carrier_zone.name` passa a vir de `deriveZoneName(cepRanges)`, ignorando qualquer nome enviado pelo form.

**Nota:** os schemas ainda têm `name` nesta task (removidos na Task 4/5). Aqui só paramos de usar `parsed.data.name`/`zone.name` na persistência. Após esta task, o nome digitado na UI é ignorado.

- [ ] **Step 1: Importar o helper**

No topo de `actions.ts`, adicionar junto aos imports locais:

```ts
import { deriveZoneName } from "./_lib/derive-zone-name";
```

- [ ] **Step 2: `createCarrierWithZones` — derivar no insert da zona**

Em `apps/web/src/app/dashboard/shipping/actions.ts:256`, trocar:

```ts
				name: zone.name,
```

por:

```ts
				name: deriveZoneName(zone.cepRanges),
```

- [ ] **Step 3: `upsertZone` — derivar no update e no insert + metadata**

Em `upsertZone`, logo após `const id = zoneId ?? crypto.randomUUID();`, adicionar:

```ts
		const zoneName = deriveZoneName(parsed.data.cepRanges);
```

No bloco `update(carrierZone).set({ ... })` (linha ~373), trocar `name: parsed.data.name,` por `name: zoneName,`.
No bloco `insert(carrierZone).values({ ... })` (linha ~386), trocar `name: parsed.data.name,` por `name: zoneName,`.
No `logUserActivity` (linha ~404), trocar `metadata: { carrierId, name: parsed.data.name },` por `metadata: { carrierId, name: zoneName },`.

- [ ] **Step 4: Verificar que nenhum `parsed.data.name`/`zone.name` de zona sobrou**

Run: `rg -n "zone\.name|parsed\.data\.name" apps/web/src/app/dashboard/shipping/actions.ts`
Expected: as únicas ocorrências de `parsed.data.name` restantes são de **transportadora** (`updateCarrier` linhas ~306/~329) — NÃO de zona. Nenhum `zone.name`.

- [ ] **Step 5: check-types + commit**

```bash
bun --cwd apps/web check-types
git add apps/web/src/app/dashboard/shipping/actions.ts
git commit -m "feat(frete): derivar nome da zona no servidor"
```

---

### Task 3: Faixas de CEP em modo preset viram chips (cep-ranges-editor)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx`

**Interfaces:**
- Consumes: `cepMask` (já importado), `removeRow`, `disabled`, `value` (já no componente).
- Produces: nenhum símbolo novo. Comportamento — quando `presetOnly`, cada faixa renderiza como chip não-editável com X = remover; sem input "Rótulo (opcional)" e sem campos De/Até. Modo livre inalterado.

- [ ] **Step 1: Adicionar o render de chip**

Em `cep-ranges-editor.tsx`, adicionar uma função `renderPresetChip` ao lado de `renderRow` (dentro do componente, após `renderRow`):

```tsx
	function renderPresetChip(row: CepRangeValue, idx: number) {
		return (
			<li
				className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
				key={`cep-${idx}-${row.from}`}
			>
				<span className="text-sm">
					{row.label ? (
						<span className="font-medium">{row.label} · </span>
					) : null}
					<span className="text-muted-foreground">
						{cepMask.format(row.from)}–{cepMask.format(row.to)}
					</span>
				</span>
				{disabled ? null : (
					<Button
						aria-label="Remover estado da cobertura"
						onClick={() => removeRow(idx)}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Trash2 className="size-4" />
					</Button>
				)}
			</li>
		);
	}
```

- [ ] **Step 2: Selecionar o render por modo**

Na lista renderizada (atual `<ul ...>{value.map(renderRow)}</ul>`), trocar por:

```tsx
				<ul className="flex flex-col gap-3">
					{value.map(presetOnly ? renderPresetChip : renderRow)}
				</ul>
```

- [ ] **Step 3: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: sem erros novos.

- [ ] **Step 4: Smoke visual (filiais intocadas)**

Iniciar dev (`bun dev:web`) e abrir uma **filial** em `/dashboard/branches/[id]` (modo livre): o editor de CEP continua com input "Rótulo", campos De/Até editáveis e "Adicionar faixa". Confirma que o modo livre NÃO mudou.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/branches/_components/cep-ranges-editor.tsx
git commit -m "feat(frete): faixas de CEP preset viram chips"
```

---

### Task 4: Remover "Nome" do schema e do editor de detalhe (zone-editor)

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/_components/zone-schema.ts` (linha ~21)
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zone-editor.tsx`

**Interfaces:**
- Consumes: `zone.name` já vem derivado do servidor via `getCarrierZones` (`data.ts`) → usado no header.
- Produces: `ZoneFormValues` perde a chave `name`. `zoneSchema` (e por extensão `zoneWithRatesSchema`) não exigem mais nome.

- [ ] **Step 1: Remover `name` de `zoneSchema`**

Em `zone-schema.ts`, remover a linha:

```ts
	name: z.string().trim().min(1, "Nome obrigatório").max(80),
```

(`zoneSchema` passa a começar direto por `cepRanges`.)

- [ ] **Step 2: Remover o estado e o campo de nome em `zone-editor.tsx`**

1. Remover a linha de estado (linha ~131):
```ts
	const [name, setName] = useState(zone?.name ?? "");
```
2. Em `handleSubmit`, remover `name,` do objeto `values`:
```ts
		const values: ZoneFormValues = {
			cepRanges,
			deliveryDays,
			minFreightAmount,
		};
```
3. No reset de sucesso (bloco `if (!zone) { ... }`), remover `setName("");`.
4. Remover o bloco `<LabeledField error={errors.name} ... label="Nome" required> ... </LabeledField>` inteiro (linhas ~227-242). O `<form>` passa a começar pelo bloco "Faixas de CEP".

(O `ZoneHeader` já recebe `zoneName={zone.name}` — passa a exibir o nome derivado automaticamente, sem mudança.)

- [ ] **Step 3: check-types**

Run: `bun --cwd apps/web check-types`
Expected: PASS. (Garante que `errors.name`/`parsed.data.name` de zona não são mais referenciados em lugar nenhum.)

- [ ] **Step 4: Smoke visual (detalhe)**

`bun dev:web` → abrir `/dashboard/shipping/carriers/[id]?tab=zonas`:
- Criar uma zona "Rio Grande do Sul" sem digitar nome → salva; o card aparece com título "Rio Grande do Sul".
- Editar: trocar pra "Brasil todo" e salvar → título vira "Brasil".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/_components/zone-schema.ts apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zone-editor.tsx
git commit -m "feat(frete): remover campo Nome da zona (detalhe)"
```

---

### Task 5: Remover "Nome" do wizard de criação (zone-fieldset)

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts` (`ZoneDraft`, linha ~82)
- Modify: `apps/web/src/app/dashboard/shipping/_components/carrier-wizard-steps.ts` (`EMPTY_ZONE`, linha ~38)
- Modify: `apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx` (linha ~51)

**Interfaces:**
- Consumes: nada novo.
- Produces: `ZoneDraft` perde `name`; `EMPTY_ZONE` perde `name`. `zone-fieldset` não renderiza mais campo de nome.

- [ ] **Step 1: Remover `name` de `ZoneDraft`**

Em `carrier-schema.ts`, na interface `ZoneDraft`, remover a linha `name: string;`.

- [ ] **Step 2: Remover `name` de `EMPTY_ZONE`**

Em `carrier-wizard-steps.ts`, no objeto `EMPTY_ZONE`, remover a linha `name: "",`.

- [ ] **Step 3: Remover o campo de nome em `zone-fieldset.tsx`**

Remover o bloco inteiro (linhas ~51-61):

```tsx
			<LabeledField id={`zone-${index}-name`} label="Nome da zona" required>
				{(field) => (
					<Input
						{...field}
						disabled={disabled}
						onChange={(e) => patch({ name: e.target.value })}
						placeholder="Ex: Sul"
						value={value.name}
					/>
				)}
			</LabeledField>
```

Se o import `Input` ficar sem uso após a remoção, removê-lo do topo do arquivo (verificar com check-types/lint).

- [ ] **Step 4: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: PASS. Confirmar que nenhum `value.name`/`patch({ name` de zona sobrou:
`rg -n "\.name|patch\(\{ name" apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx` → vazio.

- [ ] **Step 5: Smoke visual (wizard) + commit**

`bun dev:web` → `/dashboard/shipping/carriers/new`: no passo Zonas, não há mais campo "Nome da zona"; selecionar um estado e criar a transportadora → no detalhe, a zona aparece com o nome derivado.

```bash
git add apps/web/src/app/dashboard/shipping/_components/carrier-schema.ts apps/web/src/app/dashboard/shipping/_components/carrier-wizard-steps.ts apps/web/src/app/dashboard/shipping/_components/zone-fieldset.tsx
git commit -m "feat(frete): remover campo Nome da zona (wizard)"
```

---

### Task 6: Polish — divisória edge-to-edge + CTA "Nova zona"

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zone-editor.tsx` (Separator ~323; botão "Nova zona" ~147-159)

**Interfaces:**
- Consumes: nada novo (`Plus`, `Separator`, `Button` já importados).
- Produces: nenhum símbolo novo — só ajuste visual.

- [ ] **Step 1: Divisória edge-to-edge**

Trocar `<Separator className="my-4" />` por:

```tsx
				<Separator className="-mx-4 my-4 w-auto" />
```

(O card é `p-4`; `-mx-4` estende a divisória até as bordas, conforme regra edge-to-edge do `DESIGN.md`.)

- [ ] **Step 2: CTA "Nova zona" com destaque (add-card tracejado full-width)**

No branch de nova zona (quando `!(zone || expanded)`), trocar o `<Button size="sm" variant="outline">` por:

```tsx
			return (
				<Button
					className="h-auto w-full justify-center border-dashed py-6"
					onClick={() => {
						clearErrors();
						setExpanded(true);
					}}
					type="button"
					variant="outline"
				>
					<Plus className="size-4" /> Nova zona
				</Button>
			);
```

- [ ] **Step 3: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: PASS.

- [ ] **Step 4: Smoke visual**

`/dashboard/shipping/carriers/[id]?tab=zonas`: a divisória entre o form da zona e a tabela de peso encosta nas bordas do card; o "Nova zona" é um bloco tracejado largo no fim da lista, com destaque claro.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/shipping/carriers/[id]/_components/zone-editor.tsx
git commit -m "fix(frete): divisória edge-to-edge e CTA Nova zona"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suite completa**

Run: `bun --cwd apps/web check-types && bun check && bun --cwd apps/web test`
Expected: tudo verde (incluindo `derive-zone-name`).

- [ ] **Step 2: Smoke end-to-end (browser)**

Com `bun dev:web`:
1. **Wizard:** `/dashboard/shipping/carriers/new` → criar transportadora com 1 zona "Brasil todo" sem nome → sucesso.
2. **Detalhe:** abrir a transportadora, tab "Zonas & Tabela" → card "Brasil"; adicionar nova zona "Rio Grande do Sul" via add-card tracejado; remover um estado pelo X do chip; salvar.
3. **Cotação:** tab "Preview" → cotar um CEP de RS → retorna a zona certa (matching por CEP segue funcionando).
4. **Filiais (regressão):** `/dashboard/branches/[id]` → editor de CEP livre inalterado (rótulo, De/Até editáveis, "Adicionar faixa").

- [ ] **Step 3: Confirmar nenhum nome de zona órfão no código**

Run: `rg -rn "Nome da zona|Nome obrigatório.*zona|zone.*name.*min\(1" apps/web/src/app/dashboard/shipping`
Expected: vazio (nenhuma exigência de nome de zona remanescente).

---

## Follow-ups (fora deste plano — ver spec §Out-of-scope)

1. Auditoria cross-system da cobertura de CEP / "estados" (consumidores do `CepRangesEditor` e `cep-presets`) — abrir como tarefa de auditoria separada.
2. Dropar fisicamente `carrier_zone.name` (PR cross-repo, banco compartilhado).
3. Mover a CTA "Nova zona" para o header da tab (padrão entity-detail).

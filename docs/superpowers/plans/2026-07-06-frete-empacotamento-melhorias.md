# Melhorias no empacotamento de frete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o caminho multi-caixa do `packItems` (considerar todas as caixas ativas + emitir cada bin na menor caixa que serve), adicionar trava de orientação por produto, tornar as folgas de empacotamento configuráveis e alertar sobre produtos que não cabem em nenhuma caixa ativa.

**Architecture:** O motor puro `packages/db/src/queries/shipping-quote.ts` é a fonte de verdade (sincronizado ao ecommerce via CI — ADR-0009); tem um espelho client-safe em `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts` que DEVE ser mantido em paridade. Configurações vivem no singleton `store_settings`. UI de frete em `apps/web/src/app/dashboard/shipping/`, form de produto em `apps/web/src/app/dashboard/tools/`.

**Tech Stack:** TypeScript, Drizzle (push-only via `bun db:sync`), Next 16 (App Router, server actions), Zod, Vitest, Bun workspaces.

## Global Constraints

- CWD é a **raiz do monorepo**. Comandos: `bun --cwd packages/db test`, `bun --cwd apps/web test`, `bun check-types`, `bun check`.
- **Read cada arquivo antes de Edit** (`cat`/`sed` não contam para o harness). Hook PostToolUse roda `bun fix` após cada Write/Edit e pode reformatar — se um Edit falhar com `string not found`, re-Read antes de re-tentar.
- Proibido: `any`, `@ts-ignore`, `console.*` (usar `logger` de `apps/web/src/lib/logger.ts`), `key={index}`, barrel file novo.
- **Superfície de sync (ADR-0009):** arquivos em `packages/db/src/schema/` e `packages/db/src/queries/` não podem importar de fora dessa superfície. Campos novos em `QuoteItem` e parâmetros novos de `packItems` devem ser **opcionais** (o ecommerce consome cópia sincronizada e não pode quebrar type-check).
- **Espelho:** qualquer mudança de regra em `shipping-quote.ts` replica em `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts` + testes espelhados.
- Schema push-only: após editar `packages/db/src/schema/*.ts`, rodar `bun db:sync` (colunas novas com default são não-destrutivas — sem prompt TTY esperado; se pendurar em prompt, abortar e reportar).
- Commits: Conventional Commits em PT, subject ≤50 chars.
- Antes de cada commit: `bun check-types && bun check` + os testes do pacote tocado.

---

### Task 1: Motor — multi-caixa generalizado (todas as caixas + menor caixa por bin)

Corrige dois defeitos do `packItems`: (a) o caminho multi-caixa só testava a caixa de MAIOR volume, marcando como `outOfCatalog` item que cabia em outra caixa ativa de formato diferente; (b) todo bin era cotado com as dimensões da maior caixa, inflando o peso cubado. A nova forma: first-fit-decreasing onde cada bin conhece a **menor caixa que serve** para seu conjunto, recalculada a cada inserção. O atalho "menor caixa única para tudo" fica redundante (subconjunto de um conjunto viável é viável na mesma caixa, então o loop geral converge para 1 bin quando possível) e é removido.

**Files:**
- Modify: `packages/db/src/queries/shipping-quote.ts:104-188`
- Test: `packages/db/src/queries/__tests__/shipping-quote.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `packItems(items: QuoteItem[], boxes: QuoteBox[]): ShippingPackage[]` (assinatura inalterada nesta task). Helper interno `smallestFittingBox(units, boxesAsc): QuoteBox | undefined`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("packItems")` em `packages/db/src/queries/__tests__/shipping-quote.test.ts` (manter fixtures existentes):

```ts
	it("multi-caixa: item comprido usa a caixa 'tubo' mesmo não sendo a maior", () => {
		// Bug antigo: o multi-caixa só testava a caixa de MAIOR volume (cubo) e
		// marcava a vara como fora de catálogo, ignorando o tubo.
		const tubo: QuoteBox = {
			id: "tubo",
			internalLengthCm: 180,
			internalWidthCm: 15,
			internalHeightCm: 15,
			maxWeightKg: 10,
			tareWeightKg: 0.5,
		};
		const cubo: QuoteBox = {
			id: "cubo",
			internalLengthCm: 60,
			internalWidthCm: 60,
			internalHeightCm: 60,
			maxWeightKg: 30,
			tareWeightKg: 1,
		};
		const vara: QuoteItem = {
			lengthCm: 170,
			widthCm: 10,
			heightCm: 10,
			weightKg: 3,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const cubao: QuoteItem = {
			lengthCm: 50,
			widthCm: 50,
			heightCm: 50,
			weightKg: 20,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		const pkgs = packItems([vara, cubao], [tubo, cubo]);
		expect(pkgs).toHaveLength(2);
		expect(pkgs.every((p) => !p.outOfCatalog)).toBe(true);
		expect(pkgs.some((p) => p.lengthCm === 180)).toBe(true);
	});

	it("multi-caixa: bin residual pequeno sai na MENOR caixa, não na maior", () => {
		// Bug antigo: todo bin era emitido com as dims da maior caixa,
		// inflando o peso cubado do frete.
		const pesado: QuoteItem = {
			lengthCm: 60,
			widthCm: 50,
			heightCm: 40,
			weightKg: 70,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			qty: 1,
		};
		// pesado + furadeira não fecham em caixa única (88.8kg > 80 da box-xl).
		const pkgs = packItems([pesado, { ...FURADEIRA, qty: 1 }], BOXES);
		expect(pkgs).toHaveLength(2);
		const residual = pkgs.find((p) => p.lengthCm === 35);
		expect(residual).toBeDefined();
		expect(residual?.weightKg).toBeCloseTo(17.5, 3); // 15 + 2 + tara box-s 0.5
	});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `bun --cwd packages/db test`
Expected: os 2 testes novos FALHAM (`outOfCatalog` true no primeiro; `residual` undefined no segundo). Os 4 antigos passam.

- [ ] **Step 3: Reescrever o miolo de `packItems`**

Em `packages/db/src/queries/shipping-quote.ts`, adicionar após `emitPackage` o helper e o tipo de bin, e substituir TODO o trecho da linha 129 (`// Itens a consolidar...`) até o fim da função por:

```ts
// Menor caixa (por volume) em que o conjunto inteiro cabe.
function smallestFittingBox(
	units: QuoteItem[],
	boxesAsc: QuoteBox[]
): QuoteBox | undefined {
	return boxesAsc.find((box) => fitsSet(units, box));
}

interface PackBin {
	box: QuoteBox;
	units: QuoteItem[];
}
```

E o corpo (mantendo intactos a expansão de qty e o loop de `shipsInOwnBox`):

```ts
	// Itens a consolidar, maiores volumes primeiro (first-fit-decreasing).
	const rest = units
		.filter((x) => !x.shipsInOwnBox)
		.sort((a, b) => unitVolume(b) - unitVolume(a));
	if (rest.length === 0) {
		return packages;
	}

	const boxesAsc = [...boxes].sort((a, b) => boxVolume(a) - boxVolume(b));

	// Cada bin conhece a MENOR caixa que serve pro seu conjunto, recalculada a
	// cada inserção — consolida no menor número de caixas E cota cada uma pelo
	// menor tamanho possível. Quando tudo cabe junto, converge pra 1 bin
	// (subconjunto de conjunto viável é viável na mesma caixa).
	const bins: PackBin[] = [];
	for (const u of rest) {
		const alone = smallestFittingBox([u], boxesAsc);
		if (!alone) {
			// Não cabe em NENHUMA caixa ativa → "a combinar".
			packages.push({
				lengthCm: u.lengthCm,
				widthCm: u.widthCm,
				heightCm: u.heightCm,
				weightKg: dispatchWeight(u),
				outOfCatalog: true,
			});
			continue;
		}
		let placed = false;
		for (const bin of bins) {
			const candidate = smallestFittingBox([...bin.units, u], boxesAsc);
			if (candidate) {
				bin.units.push(u);
				bin.box = candidate;
				placed = true;
				break;
			}
		}
		if (!placed) {
			bins.push({ box: alone, units: [u] });
		}
	}
	for (const bin of bins) {
		packages.push(emitPackage(bin.units, bin.box));
	}

	return packages;
}
```

Remover: o bloco `const single = ...`, o bloco `const largest = ...` com o fallback de catálogo vazio (o caso "sem caixas" agora cai naturalmente em `alone === undefined` → tudo `outOfCatalog`), e o loop antigo de bins. Atualizar o comentário do topo do arquivo se ele citar a estratégia antiga.

- [ ] **Step 4: Rodar todos os testes do motor**

Run: `bun --cwd packages/db test`
Expected: PASS — 6 testes de `packItems` (os 4 antigos continuam passando sem alteração; conferido: "4 furadeiras" ainda consolida em 1 pacote box-xl de 69.8kg).

- [ ] **Step 5: Gates + commit**

Run: `bun check-types && bun check`
Expected: sem erros novos.

```bash
git add packages/db/src/queries/shipping-quote.ts packages/db/src/queries/__tests__/shipping-quote.test.ts
git commit -m "fix: multi-caixa considera todas as caixas ativas"
```

---

### Task 2: Motor — folgas configuráveis (`fillFactor` + `boxPaddingCm`)

O `FILL_FACTOR` (0.9) e a ausência de acréscimo externo por parede viram opções do `packItems`, com defaults idênticos ao comportamento atual (backward-compatible pro ecommerce). O espelho ganha o parâmetro de `fillFactor`.

**Files:**
- Modify: `packages/db/src/queries/shipping-quote.ts`
- Modify: `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts`
- Modify: `docs/integration/admin-ecommerce.md` (seção "Funções compartilhadas", ~linha 121)
- Test: `packages/db/src/queries/__tests__/shipping-quote.test.ts`
- Test: `apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts`

**Interfaces:**
- Consumes: `packItems` reescrito na Task 1 (`smallestFittingBox`, `PackBin`).
- Produces: `packItems(items, boxes, opts?: PackOptions)` com `export interface PackOptions { boxPaddingCm?: number; fillFactor?: number }`; espelho `fitsAnyActiveBox(item, boxes, fillFactor?: number)`. Tasks 3 e 5 dependem dessas assinaturas.

- [ ] **Step 1: Testes que falham (motor)**

Adicionar em `packages/db/src/queries/__tests__/shipping-quote.test.ts`:

```ts
	it("fillFactor menor força caixa maior (0.5 vs default 0.9)", () => {
		// Furadeira não-empilhável ocupa 31500 na box-s (0.9×36750=33075 ok;
		// 0.5×36750=18375 não) → com 0.5 sobe pra box-l.
		const strict = packItems([{ ...FURADEIRA, qty: 1 }], BOXES, {
			fillFactor: 0.5,
		});
		expect(strict[0]?.lengthCm).toBe(70);
		const relaxed = packItems([{ ...FURADEIRA, qty: 1 }], BOXES);
		expect(relaxed[0]?.lengthCm).toBe(35);
	});

	it("boxPaddingCm soma nas dims do pacote de catálogo, não no 'a combinar'", () => {
		const pkgs = packItems([{ ...FURADEIRA, qty: 1 }], BOXES, {
			boxPaddingCm: 2,
		});
		expect(pkgs[0]?.lengthCm).toBe(37);
		expect(pkgs[0]?.widthCm).toBe(37);
		expect(pkgs[0]?.heightCm).toBe(32);
	});
```

Run: `bun --cwd packages/db test` — Expected: FAIL (`packItems` não aceita 3º arg).

- [ ] **Step 2: Implementar `PackOptions` no motor**

Em `shipping-quote.ts`:

```ts
export interface PackOptions {
	/** Acréscimo externo por dimensão (cm) — parede/aba da caixa. Default 0. */
	boxPaddingCm?: number;
	/** Fração máxima do volume interno ocupável. Default 0.9. */
	fillFactor?: number;
}

const DEFAULT_FILL_FACTOR = 0.9;
```

Remover a const `FILL_FACTOR` antiga. Threading (todas mudanças mecânicas de assinatura):
- `fitsSet(units, box, fillFactor: number)` — usa `boxVolume(box) * fillFactor`.
- `smallestFittingBox(units, boxesAsc, fillFactor: number)`.
- `emitPackage(units, box, paddingCm: number)` — soma `paddingCm` em `lengthCm`/`widthCm`/`heightCm` do retorno. Pacotes `shipsInOwnBox` e `outOfCatalog` NÃO recebem padding (usam dims do produto).
- `packItems(items, boxes, opts?: PackOptions)` — resolve `const fillFactor = opts?.fillFactor ?? DEFAULT_FILL_FACTOR;` e `const paddingCm = opts?.boxPaddingCm ?? 0;` no topo e repassa.

Run: `bun --cwd packages/db test` — Expected: PASS (8 testes).

- [ ] **Step 3: Espelho — teste que falha**

Em `apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts`:

```ts
	it("fillFactor customizado aperta a régua (paridade com o motor)", () => {
		const naoEmpilhavel: FitCheckItem = { ...FURADEIRA, stackable: false };
		// occupied 35×30×30=31500; 0.9×36750 ok na box-s, 0.5×36750 não —
		// mas ainda cabe na box-l, então restringe para só a box-s:
		const boxS = BOXES[0] as (typeof BOXES)[number];
		expect(fitsAnyActiveBox(naoEmpilhavel, [boxS])).toBe(true);
		expect(fitsAnyActiveBox(naoEmpilhavel, [boxS], 0.5)).toBe(false);
	});
```

Run: `bun --cwd apps/web test fits-shipping-box` — Expected: FAIL (3º arg inexistente).

- [ ] **Step 4: Implementar no espelho**

Em `fits-shipping-box.ts`: `fitsShippingBox(item, box, fillFactor: number)` usa `boxVolume * fillFactor`; assinatura pública vira:

```ts
export function fitsAnyActiveBox(
	item: FitCheckItem,
	boxes: QuoteBox[],
	fillFactor: number = FILL_FACTOR
): boolean {
	return boxes.some((box) => fitsShippingBox(item, box, fillFactor));
}
```

Run: `bun --cwd apps/web test fits-shipping-box` — Expected: PASS.

- [ ] **Step 5: Documentar no contrato**

Em `docs/integration/admin-ecommerce.md`, na seção "Funções compartilhadas (`@emach/db/queries/shipping*`)", atualizar o exemplo para `packItems(items, boxes, opts?)` e registrar: `opts.fillFactor`/`opts.boxPaddingCm` são opcionais com defaults 0.9/0; o storefront deve passá-los a partir de `getShippingSettings` (campos chegam na Task 3).

- [ ] **Step 6: Gates + commit**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: sem erros; suíte web verde.

```bash
git add packages/db/src/queries/shipping-quote.ts packages/db/src/queries/__tests__/shipping-quote.test.ts apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts "apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts" docs/integration/admin-ecommerce.md
git commit -m "feat: folga e ocupação configuráveis no packItems"
```

---

### Task 3: `store_settings` — campos de empacotamento + UI de configuração

Persistir `fillFactor` e `boxPaddingCm` no singleton, expor no form de configurações de frete e usar o `fillFactor` configurado no aviso do form de produto.

**Files:**
- Modify: `packages/db/src/schema/store-settings.ts`
- Modify: `packages/db/src/queries/store-settings.ts`
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-schema.ts`
- Modify: `apps/web/src/app/dashboard/shipping/actions.ts` (`updateShippingSettings`)
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-settings-form.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/_components/shipping-preview-rail.tsx`
- Modify: `apps/web/src/app/dashboard/shipping/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-context.tsx`
- Modify: `apps/web/src/app/dashboard/tools/new/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx`
- Modify: `docs/integration/admin-ecommerce.md` (linha da tabela `store_settings`, ~linha 35)

**Interfaces:**
- Consumes: `PackOptions` da Task 2; `fitsAnyActiveBox(item, boxes, fillFactor?)` da Task 2.
- Produces: colunas `shipping_fill_factor` e `shipping_box_padding_cm`; `ShippingSettings` (query) ganha `fillFactor: number` e `boxPaddingCm: number`; `ToolFormContextValue` ganha `fillFactor: number`. Task 5 consome `getShippingSettings`.

- [ ] **Step 1: Colunas no schema**

Em `packages/db/src/schema/store-settings.ts`, após `shippingInsuranceCapAmount`:

```ts
		// Fração máxima do volume interno ocupável na consolidação (folga de
		// empacotamento). Consumido pelo storefront via getShippingSettings.
		shippingFillFactor: numeric("shipping_fill_factor", {
			precision: 3,
			scale: 2,
		})
			.notNull()
			.default("0.90"),
		// Acréscimo externo por dimensão (cm) nas caixas cotadas (parede/aba).
		shippingBoxPaddingCm: numeric("shipping_box_padding_cm", {
			precision: 10,
			scale: 2,
		})
			.notNull()
			.default("0"),
```

E nos checks da tabela:

```ts
		check(
			"fill_factor_range",
			sql`${table.shippingFillFactor} > 0 AND ${table.shippingFillFactor} <= 1`
		),
		check(
			"box_padding_non_negative",
			sql`${table.shippingBoxPaddingCm} >= 0`
		),
```

- [ ] **Step 2: Aplicar no banco**

Run: `bun db:sync`
Expected: `Changes applied` sem prompt (colunas novas com default). Se pedir confirmação interativa de rename/drop, abortar e reportar.

- [ ] **Step 3: Query compartilhada**

Em `packages/db/src/queries/store-settings.ts`, estender `ShippingSettings`, `DEFAULTS` e o select/`return` de `getShippingSettings`:

```ts
export interface ShippingSettings {
	boxPaddingCm: number;
	fillFactor: number;
	insuranceCapAmount: number;
	insurancePolicy: ShippingInsurancePolicy;
	originBranchId: string | null;
	originCep: string | null;
}

const DEFAULTS: ShippingSettings = {
	originBranchId: null,
	originCep: null,
	insurancePolicy: "none",
	insuranceCapAmount: 3000,
	fillFactor: 0.9,
	boxPaddingCm: 0,
};
```

No select: `fillFactor: storeSettings.shippingFillFactor, boxPaddingCm: storeSettings.shippingBoxPaddingCm`; no return: `fillFactor: Number(row.fillFactor), boxPaddingCm: Number(row.boxPaddingCm)`.

- [ ] **Step 4: Zod + action**

Em `shipping-schema.ts`, adicionar ao `shippingSettingsSchema`:

```ts
	fillFactorPct: z
		.number({ error: "Informe a ocupação máxima" })
		.int("Use um número inteiro")
		.min(50, "Mínimo 50%")
		.max(100, "Máximo 100%"),
	boxPaddingCm: z
		.number({ error: "Informe o acréscimo por dimensão" })
		.nonnegative("Não pode ser negativo")
		.max(10, "Máximo 10 cm"),
```

Em `actions.ts` (`updateShippingSettings`), estender o `payload`:

```ts
		shippingFillFactor: (parsed.data.fillFactorPct / 100).toFixed(2),
		shippingBoxPaddingCm: parsed.data.boxPaddingCm.toFixed(2),
```

- [ ] **Step 5: Form + preview rail + page**

`shipping-settings-form.tsx` — estender `ShippingSettingsFormProps.settings` com `fillFactorPct: number; boxPaddingCm: number`, adicionar os states (mesmo padrão do `capAmount`):

```ts
	const [fillFactorPct, setFillFactorPct] = useState(
		String(settings.fillFactorPct)
	);
	const [boxPaddingCm, setBoxPaddingCm] = useState(
		String(settings.boxPaddingCm)
	);
```

incluir nos `values` do submit (`fillFactorPct: Number(fillFactorPct), boxPaddingCm: Number(boxPaddingCm)`) e adicionar uma `section` nova (mesmo shell `rounded-md border ... p-6` das existentes) entre "Origem" e "Seguro":

```tsx
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Empacotamento</h2>
					<p className="text-muted-foreground text-sm">
						Folgas usadas na consolidação do carrinho em caixas. A ocupação
						máxima compensa o encaixe imperfeito dos itens; o acréscimo por
						dimensão cobre parede e aba da caixa no peso cubado.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<LabeledField
						error={errors.fillFactorPct}
						hint="Padrão 90%. Diminua se despachos reais não fecham na caixa cotada."
						id="fillFactorPct"
						label="Ocupação máxima da caixa (%)"
					>
						{(field) => (
							<Input
								{...field}
								inputMode="numeric"
								onChange={(e) => setFillFactorPct(e.target.value)}
								placeholder="90"
								value={fillFactorPct}
							/>
						)}
					</LabeledField>
					<LabeledField
						error={errors.boxPaddingCm}
						hint="Somado a cada dimensão externa da caixa na cotação. Padrão 0."
						id="boxPaddingCm"
						label="Acréscimo por dimensão (cm)"
					>
						{(field) => (
							<Input
								{...field}
								inputMode="decimal"
								onChange={(e) => setBoxPaddingCm(e.target.value)}
								placeholder="0"
								value={boxPaddingCm}
							/>
						)}
					</LabeledField>
				</div>
			</section>
```

`shipping-preview-rail.tsx` — props ganham `boxPaddingCm: number; fillFactorPct: number`; nova row antes de "Cotação":

```ts
		{
			label: "Empacotamento",
			value: `Até ${fillFactorPct}% de ocupação · +${boxPaddingCm} cm por dimensão`,
		},
```

`shipping/page.tsx` — repassar aos dois componentes: no `settings` do form `fillFactorPct: Math.round(Number(settings.shippingFillFactor) * 100), boxPaddingCm: Number(settings.shippingBoxPaddingCm)`; no rail `fillFactorPct={...}` e `boxPaddingCm={...}` com as mesmas expressões.

- [ ] **Step 6: Aviso do form de produto usa o fillFactor configurado**

- `tool-form-context.tsx`: adicionar `fillFactor: number;` em `ToolFormContextValue`.
- `tools/new/page.tsx`: adicionar `getShippingSettings(db)` ao `Promise.all` existente (import `{ getShippingSettings } from "@emach/db/queries/store-settings"`), capturar como `shippingSettings` e passar `fillFactor: shippingSettings.fillFactor` no `value` do `ToolFormProvider`.
- `tools/[id]/edit/page.tsx`: mesma mudança no `Promise.all` que já busca `activeBoxes` (~linha 130) e no `value` do provider (~linha 207).
- `logistics-fields.tsx`: `const { activeBoxes, fillFactor } = useToolFormContext();` e passar `fillFactor` como 3º arg do `fitsAnyActiveBox`.

- [ ] **Step 7: Doc do contrato**

Em `docs/integration/admin-ecommerce.md`, linha da tabela `store_settings`: acrescentar os campos de empacotamento (`shipping_fill_factor`, `shipping_box_padding_cm`) e a instrução de repassá-los ao `packItems` via `opts`.

- [ ] **Step 8: Gates + smoke + commit**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: verde.

Smoke run-time (tsc não pega SQL/colunas): `bun dev:web`, visitar `/dashboard/shipping?tab=config` (form salva e recarrega os valores novos) e `/dashboard/tools/new` (passo de logística renderiza sem erro). Erros via `nextjs_call <port> get_errors` se necessário.

```bash
git add packages/db/src/schema/store-settings.ts packages/db/src/queries/store-settings.ts apps/web/src/app/dashboard/shipping apps/web/src/app/dashboard/tools docs/integration/admin-ecommerce.md
git commit -m "feat: folgas de empacotamento em store_settings"
```

---

### Task 4: Trava de orientação — "este lado para cima" (`uprightOnly`)

Produto com `uprightOnly` não pode ser deitado: a altura é fixa e só as duas dimensões horizontais podem trocar entre si no encaixe. Campo opcional em `QuoteItem` (ecommerce não quebra; `undefined` = comportamento atual).

**Files:**
- Modify: `packages/db/src/schema/tools.ts` (tabela `tool`)
- Modify: `packages/db/src/queries/shipping-quote.ts`
- Modify: `apps/web/src/app/dashboard/tools/_lib/fits-shipping-box.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts`
- Modify: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` (`normalizeToolPayload`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx` (mapeamento row → form, ~linha 97)
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/logistics-fields.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx` (MetaRow "Envio", ~linha 131)
- Modify: `docs/integration/admin-ecommerce.md`
- Test: `packages/db/src/queries/__tests__/shipping-quote.test.ts`
- Test: `apps/web/src/app/dashboard/tools/_lib/__tests__/fits-shipping-box.test.ts`

**Interfaces:**
- Consumes: motor com `PackOptions` (Task 2).
- Produces: coluna `tool.upright_only` (boolean, notNull, default false); `QuoteItem.uprightOnly?: boolean`; `FitCheckItem.uprightOnly?: boolean`; campo `uprightOnly` no `ToolFormValues`. Task 5 passa `uprightOnly` no fit-check do relatório.

- [ ] **Step 1: Testes que falham (motor)**

```ts
	it("uprightOnly: altura fixa não deita — exige caixa mais alta", () => {
		// 20×20×58 em pé: box-l (H 50) não serve; box-xl (H 60) sim.
		// Sem a trava, deitaria e caberia na box-l.
		const emPe: QuoteItem = {
			lengthCm: 20,
			widthCm: 20,
			heightCm: 58,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
			shipsInOwnBox: false,
			uprightOnly: true,
			qty: 1,
		};
		expect(packItems([emPe], BOXES)[0]?.lengthCm).toBe(90); // box-xl
		expect(
			packItems([{ ...emPe, uprightOnly: false }], BOXES)[0]?.lengthCm
		).toBe(70); // box-l, deitado
	});
```

Run: `bun --cwd packages/db test` — Expected: FAIL (campo não existe / trava não aplicada).

- [ ] **Step 2: Motor**

Em `shipping-quote.ts` — `QuoteItem` ganha `uprightOnly?: boolean;`. `fitsByDims` vira:

```ts
function fitsByDims(item: QuoteItem, box: QuoteBox): boolean {
	if (item.uprightOnly) {
		// Altura fixa: só as horizontais podem trocar entre si.
		if (item.heightCm > box.internalHeightCm) {
			return false;
		}
		const iMax = Math.max(item.lengthCm, item.widthCm);
		const iMin = Math.min(item.lengthCm, item.widthCm);
		const bMax = Math.max(box.internalLengthCm, box.internalWidthCm);
		const bMin = Math.min(box.internalLengthCm, box.internalWidthCm);
		return iMax <= bMax && iMin <= bMin;
	}
	const i = sortedDesc(item.lengthCm, item.widthCm, item.heightCm);
	const b = sortedDesc(
		box.internalLengthCm,
		box.internalWidthCm,
		box.internalHeightCm
	);
	return i[0] <= b[0] && i[1] <= b[1] && i[2] <= b[2];
}
```

E `footprint` (a base de um item em pé é comprimento×largura reais, não os dois maiores eixos):

```ts
function footprint(u: QuoteItem): number {
	if (u.uprightOnly) {
		return u.lengthCm * u.widthCm;
	}
	const s = sortedDesc(u.lengthCm, u.widthCm, u.heightCm);
	return s[0] * s[1];
}
```

Run: `bun --cwd packages/db test` — Expected: PASS.

- [ ] **Step 3: Espelho (teste + implementação)**

Teste em `fits-shipping-box.test.ts`:

```ts
	it("uprightOnly não deita: 20×20×58 falha na box-l, passa sem a trava", () => {
		const emPe: FitCheckItem = {
			lengthCm: 20,
			widthCm: 20,
			heightCm: 58,
			weightKg: 10,
			packagingWeightKg: 0,
			stackable: true,
			uprightOnly: true,
		};
		const boxL = BOXES[1] as (typeof BOXES)[number];
		expect(fitsAnyActiveBox(emPe, [boxL])).toBe(false);
		expect(fitsAnyActiveBox({ ...emPe, uprightOnly: false }, [boxL])).toBe(true);
	});
```

Run (antes): FAIL. Em `fits-shipping-box.ts`: `FitCheckItem` ganha `uprightOnly?: boolean;`; replicar em `fitsShippingBox` o branch de dims do motor E o footprint em pé no cálculo de `occupied` (paridade exata com `fitsByDims`/`footprint`). Run: `bun --cwd apps/web test fits-shipping-box` — Expected: PASS.

- [ ] **Step 4: Coluna no schema + sync**

Em `packages/db/src/schema/tools.ts`, após `shipsInOwnBox`:

```ts
		// Não pode ser deitado no encaixe ("este lado para cima") — a altura é fixa.
		uprightOnly: boolean("upright_only").notNull().default(false),
```

Run: `bun db:sync` — Expected: `Changes applied` sem prompt.

- [ ] **Step 5: Form de produto (schema → state → payload → UI → detalhe)**

- `tool-schema.ts` (~linha 130): `uprightOnly: z.boolean().default(false),` ao lado de `shipsInOwnBox`.
- `tool-form-state.ts`: `uprightOnly: false,` em `EMPTY_TOOL_VALUES` (o tipo vem do schema).
- `tool-query-helpers.ts` (`normalizeToolPayload`): `uprightOnly: input.uprightOnly,` após `shipsInOwnBox`.
- `tools/[id]/edit/page.tsx` (~linha 99): `uprightOnly: row.uprightOnly,` no mapeamento.
- `logistics-fields.tsx`: (a) passar `uprightOnly: values.uprightOnly` no objeto do `fitsAnyActiveBox`; (b) novo switch após o de "Empilhável", mesmo shell:

```tsx
				<div className="flex items-center gap-3">
					<Switch
						checked={values.uprightOnly}
						disabled={disabled}
						id="uprightOnly"
						onCheckedChange={(checked) => onPatch({ uprightOnly: checked })}
					/>
					<label
						className="flex cursor-pointer items-center gap-1.5 text-sm"
						htmlFor="uprightOnly"
					>
						Este lado para cima
						<HelpTooltip text="Não pode ser deitado na caixa (ex.: compressor com óleo). A altura é fixa no encaixe; só gira na horizontal." />
					</label>
				</div>
```

- `overview-tab.tsx` (MetaRow "Envio", ~linha 131): acrescentar `{tool.uprightOnly ? " · este lado para cima" : ""}` após o sufixo de empilhável.

- [ ] **Step 6: Doc do contrato**

Em `docs/integration/admin-ecommerce.md` (seção de frete): registrar `tool.upright_only` como insumo físico novo e `QuoteItem.uprightOnly` opcional (default `false`) — o storefront deve mapeá-lo ao montar os itens da cotação.

- [ ] **Step 7: Gates + smoke + commit**

Run: `bun check-types && bun check && bun --cwd apps/web test && bun --cwd packages/db test`
Expected: verde.

Smoke: `/dashboard/tools/new` mostra o switch novo; salvar um tool com a trava e conferir o sufixo no detalhe (aba Visão geral).

```bash
git add packages/db/src/schema/tools.ts packages/db/src/queries/shipping-quote.ts packages/db/src/queries/__tests__/shipping-quote.test.ts apps/web/src/app/dashboard/tools docs/integration/admin-ecommerce.md
git commit -m "feat: trava de orientação no envio da ferramenta"
```

---

### Task 5: Relatório "produtos sem caixa" na tela de frete

Fecha o ponto cego operacional: mudar/desativar caixa pode silenciosamente jogar produtos ativos em "Frete a combinar". A aba Caixas passa a listar esses produtos.

**Files:**
- Modify: `apps/web/src/app/dashboard/shipping/data.ts`
- Modify: `apps/web/src/app/dashboard/shipping/_components/boxes-tab.tsx`

**Interfaces:**
- Consumes: `fitsAnyActiveBox(item, boxes, fillFactor)` (Tasks 2/4), `getActiveBoxes` de `@emach/db/queries/shipping`, `getShippingSettings` de `@emach/db/queries/store-settings` (Task 3), coluna `uprightOnly` (Task 4).
- Produces: `getToolsWithoutBox(): Promise<ToolWithoutBox[]>` em `shipping/data.ts`.

- [ ] **Step 1: Data function**

Em `apps/web/src/app/dashboard/shipping/data.ts` (arquivo já é `server-only`), adicionar:

```ts
import { getActiveBoxes } from "@emach/db/queries/shipping";
import { getShippingSettings } from "@emach/db/queries/store-settings";
import { tool } from "@emach/db/schema/tools";
import { and, asc as ascOrder, eq } from "drizzle-orm";
import { fitsAnyActiveBox } from "@/app/dashboard/tools/_lib/fits-shipping-box";

export interface ToolWithoutBox {
	heightCm: string;
	id: string;
	lengthCm: string;
	name: string;
	weightKg: string;
	widthCm: string;
}

/** Produtos ativos que consolidam em caixa mas não cabem em NENHUMA caixa
 * ativa — na loja saem como "Frete a combinar". Mesma régua do checkout. */
export async function getToolsWithoutBox(): Promise<ToolWithoutBox[]> {
	const [activeBoxes, settings, rows] = await Promise.all([
		getActiveBoxes(db),
		getShippingSettings(db),
		db
			.select({
				id: tool.id,
				name: tool.name,
				weightKg: tool.weightKg,
				lengthCm: tool.lengthCm,
				widthCm: tool.widthCm,
				heightCm: tool.heightCm,
				packagingWeightKg: tool.packagingWeightKg,
				stackable: tool.stackable,
				uprightOnly: tool.uprightOnly,
			})
			.from(tool)
			.where(and(eq(tool.status, "active"), eq(tool.shipsInOwnBox, false)))
			.orderBy(ascOrder(tool.name)),
	]);

	return rows
		.filter(
			(r) =>
				!fitsAnyActiveBox(
					{
						lengthCm: Number(r.lengthCm),
						widthCm: Number(r.widthCm),
						heightCm: Number(r.heightCm),
						weightKg: Number(r.weightKg),
						packagingWeightKg: Number(r.packagingWeightKg),
						stackable: r.stackable,
						uprightOnly: r.uprightOnly,
					},
					activeBoxes,
					settings.fillFactor
				)
		)
		.map(({ id, name, weightKg, lengthCm, widthCm, heightCm }) => ({
			id,
			name,
			weightKg,
			lengthCm,
			widthCm,
			heightCm,
		}));
}
```

Nota: o import de `asc` já existe no arquivo — reutilizar (ajustar o alias acima para o que o arquivo já usa; NÃO duplicar import). `db` também já é importado.

- [ ] **Step 2: UI na aba Caixas**

Em `boxes-tab.tsx`: buscar em paralelo (`const [boxes, toolsWithoutBox] = await Promise.all([getBoxes(), getToolsWithoutBox()]);`) e renderizar o alerta entre o header e o grid, só quando houver itens (imports: `TriangleAlert` de `lucide-react`, `formatMeasure` de `@/lib/format/number`, `Link` já importado):

```tsx
			{toolsWithoutBox.length > 0 && (
				<div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4">
					<p className="flex items-center gap-2 font-medium text-sm">
						<TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
						{toolsWithoutBox.length === 1
							? "1 produto ativo não cabe em nenhuma caixa ativa"
							: `${toolsWithoutBox.length} produtos ativos não cabem em nenhuma caixa ativa`}
					</p>
					<p className="text-muted-foreground text-xs">
						Na loja eles aparecem como "Frete a combinar". Cadastre uma caixa
						maior, reative uma existente ou marque o produto como "viaja na
						própria embalagem".
					</p>
					<ul className="flex flex-col gap-1">
						{toolsWithoutBox.slice(0, 10).map((t) => (
							<li key={t.id}>
								<Link
									className="text-sm underline-offset-2 hover:underline"
									href={`/dashboard/tools/${t.id}`}
								>
									{t.name}
								</Link>{" "}
								<span className="text-muted-foreground text-xs">
									{formatMeasure(t.lengthCm)} × {formatMeasure(t.widthCm)} ×{" "}
									{formatMeasure(t.heightCm)} cm · {formatMeasure(t.weightKg)} kg
								</span>
							</li>
						))}
					</ul>
					{toolsWithoutBox.length > 10 && (
						<p className="text-muted-foreground text-xs">
							…e mais {toolsWithoutBox.length - 10}.
						</p>
					)}
				</div>
			)}
```

- [ ] **Step 3: Gates + smoke + commit**

Run: `bun check-types && bun check && bun --cwd apps/web test`
Expected: verde.

Smoke run-time (obrigatório — query nova em SSR): `bun dev:web`, visitar `/dashboard/shipping`. Verificar os dois estados: com todos os produtos cabendo (sem alerta) e, desativando temporariamente as caixas maiores via UI, o alerta aparece com links funcionais; reativar depois. Como as actions de caixa já fazem `revalidatePath("/dashboard/shipping")`, o alerta atualiza ao salvar.

```bash
git add apps/web/src/app/dashboard/shipping/data.ts apps/web/src/app/dashboard/shipping/_components/boxes-tab.tsx
git commit -m "feat: alerta de produtos sem caixa na tela frete"
```

---

## Verificação final (após a última task)

- `bun verify` (check-types + ultracite + testes web) e `bun --cwd packages/db test`.
- Smoke integrado: criar tool 20×20×58 com "Este lado para cima", conferir aviso/ausência de aviso no form conforme caixas ativas; conferir a linha "Empacotamento" no preview rail de `/dashboard/shipping?tab=config`.
- Lembrete de coordenação: as mudanças em `packages/db/src/{schema,queries}` geram PR automático no repo ecommerce (ADR-0009); os campos novos são opcionais/default e não quebram o storefront, mas o ganho só se materializa lá quando o checkout passar `uprightOnly` e as opções de `PackOptions`.

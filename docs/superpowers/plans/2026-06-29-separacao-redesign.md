# Redesign visual — Separação · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinhar a seção `/dashboard/separacao` (fila + execução) ao design system, eliminando o teal estrutural, as bordas pesadas, o agrupamento quebrado, o botão voltar fora de padrão e a barra de progresso invisível.

**Architecture:** Mudança puramente visual/UX em componentes client existentes. Sem tocar em `data.ts`/`actions.ts`/`schema.ts`/`_lib`. Tokens do design system (`DESIGN.md`), coral como acento da seção, teal só em badge de status.

**Tech Stack:** Next 16 / React 19, Tailwind v4 (tokens em `packages/ui/src/styles/globals.css`), lucide-react, componentes `@emach/ui`.

## Global Constraints

- **Verificação é visual, não TDD unitário.** Mudança de classes Tailwind não tem teste unitário sensato. Cada task fecha com: `bun check-types` + `bun check` (ultracite) verdes **e** smoke visual na rota afetada (`/dashboard/separacao` e/ou `/dashboard/separacao/[orderId]`). Não inventar testes de cor.
- Coral (`primary`) é o acento da seção; **teal (`info`) só em badge de status** "Em separação"/"Separando". Nunca `ring-info`/`bg-info` estrutural ou em barra de progresso.
- Proibido em repouso: `border-2`, `bg-surface-deep` como surface de card.
- Espaçamento na escala base-4px (`gap-1..8`, `py-2.5`). Ícones lucide com `aria-hidden`. Botões/ações alinhados à direita (`flex justify-end`).
- AAA + `prefers-reduced-motion`. Anti-patterns P0/P1 da raiz do `CLAUDE.md` valem (sem `console.*`, sem `: any`, sem `key={index}`).
- **Read antes de Edit** (cat/sed não contam pro harness). Se Edit falhar com `string not found`, re-Read antes de re-tentar — o hook `bun fix` PostToolUse reordena classes e pode quebrar `old_string`.

---

## File Structure

| Arquivo | Responsabilidade após o redesign |
|---|---|
| `resume-banner.tsx` | Banner de retomada — faixa coral discreta |
| `scan-input.tsx` | Campo de leitura com cara de input (border-input) |
| `picking-order-card.tsx` | Card da fila — barra de progresso coral |
| `picking-execution.tsx` | Tela de execução — header (serif + saída à direita + barra larga), painel unificado scan+foco, faixa de feedback, coluna de itens |

Ordem: Tasks 1–3 são arquivos isolados (paralelizáveis). Tasks 4–6 mexem **todas em `picking-execution.tsx`** — devem ser **sequenciais** (mesmo arquivo). Task 7 fecha.

---

### Task 1: Banner de retomada — faixa coral discreta

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx`

**Interfaces:** sem mudança de props (`ResumeBannerProps { activePicking }`).

- [ ] **Step 1: Substituir o JSX retornado** (linhas 22–47) por:

```tsx
	return (
		<div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
				<PlayIcon aria-hidden className="size-5" />
			</div>

			<div className="min-w-0 flex-1">
				<p className="font-semibold text-sm">
					Você tem uma separação em andamento
				</p>
				<p className="text-muted-foreground text-xs">
					Pedido {activePicking.number} · {activePicking.clientName} ·{" "}
					{activePicking.pickedUnits} de {activePicking.totalUnits} unidades
				</p>
				<div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
					<div className="h-full bg-primary" style={{ width: `${pct}%` }} />
				</div>
			</div>

			<Button asChild>
				<Link href={`/dashboard/separacao/${activePicking.orderId}`}>
					Retomar
				</Link>
			</Button>
		</div>
	);
```

- [ ] **Step 2: Adicionar o import do Button** no topo (após o import do PlayIcon):

```tsx
import { Button } from "@emach/ui/components/button";
```

Resultado: removidos `bg-surface-deep`, `ring-2 ring-info`, `bg-info` (ícone/barra/botão) e o `<Link>` raw estilizado. Ícone em `bg-primary/12`, barra coral, botão `<Button>` (coral default).

- [ ] **Step 3: Verificar** — `bun check-types && bun check`. Esperado: sem novos erros.
- [ ] **Step 4: Smoke visual** — `/dashboard/separacao` (com uma separação em andamento ativa): o banner não tem mais o anel teal; ícone/barra/botão coral; surface de card.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx
git commit -m "feat(separacao): banner de retomada em faixa coral discreta"
```

---

### Task 2: Card da fila — barra de progresso coral

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx:118-123`

**Interfaces:** sem mudança de props.

- [ ] **Step 1: Trocar o fill da barra de progresso** (linha ~120) de `bg-info` para `bg-primary`:

```tsx
					<div className="h-1.5 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full bg-primary"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
```

O badge "Separando" em `bg-info/15 text-info` (linha 43) **permanece** — uso correto de teal em badge de status.

- [ ] **Step 2: Verificar** — `bun check-types && bun check`.
- [ ] **Step 3: Smoke visual** — `/dashboard/separacao`, aba "Em separação": a barra do card é coral, não teal.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx
git commit -m "fix(separacao): barra de progresso do card em coral"
```

---

### Task 3: Campo de scan com cara de input

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx:29-52`

**Interfaces:** sem mudança de props (`ScanInputProps { disabled?, onScan }`).

Hoje o wrapper usa `border-2 border-primary bg-surface-deep` (pesado e escuro). Trocar por um campo real: `border-input` 1px, surface contrastante com o painel (`bg-background`), sem `border-2`/`surface-deep`. O coral fica só no ícone e no focus-within.

- [ ] **Step 1: Substituir o JSX** (linhas 29–53) por:

```tsx
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
				<BarcodeIcon
					aria-hidden
					className="size-[22px] shrink-0 text-primary"
				/>
				<Input
					aria-label="Escanear código de barras"
					autoFocus
					className="flex-1 border-0 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
					disabled={disabled}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Bipe o código de barras…"
					ref={ref}
					type="text"
					value={value}
				/>
			</div>
			<p className="pl-0.5 text-[12px] text-muted-foreground">
				Foco automático no campo · o leitor digita o código e dá Enter sozinho
			</p>
		</div>
	);
```

Mudanças: `border-2 border-primary` → `border border-input`; `bg-surface-deep` → `bg-background`; `rounded-xl` → `rounded-lg`; adicionado `focus-within:` ring coral (o foco real ganha o coral, não o repouso).

- [ ] **Step 2: Verificar** — `bun check-types && bun check`.
- [ ] **Step 3: Smoke visual** — `/dashboard/separacao/[orderId]`: o campo lê como input (borda clara 1px), não mais um bloco coral escuro; ao focar, ganha ring coral.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/scan-input.tsx
git commit -m "feat(separacao): campo de scan com aparência de input"
```

---

### Task 4: Execução — header (serif + saída à direita + barra larga)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx:600-653` (header), e a remoção do botão "Cancelar separação" do rodapé da coluna direita (linhas 727–736, movido para cá).

**Interfaces:** usa `summary`, `doneCount`, `localItems`, `progressPct`, `setIsCancelOpen`, `isCanceling` (já existentes no componente).

Nota honesta: `picking: OrderPicking` não carrega número do pedido/cliente (diferente do `ResumeBanner`), então o título fica "Separação em andamento" em serif. Incluir número/cliente no título seria extensão que exige passar campos do `data.ts` — **fora do escopo visual**.

- [ ] **Step 1: Substituir o bloco "Barra da operação"** (linhas 602–653, do comentário `{/* Barra da operação */}` até o `</div>` que fecha a barra) por um card de header completo:

```tsx
			{/* Header da operação */}
			<div className="rounded-xl border border-border bg-card p-5">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="font-serif text-2xl font-medium tracking-tight">
							Separação em andamento
						</h1>
						<p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
							<span>{picking.pickerName}</span>
							{picking.branchId && (
								<>
									<span aria-hidden className="size-1 rounded-full bg-border" />
									<span className="flex items-center gap-1">
										<MapPinIcon aria-hidden className="size-3 shrink-0" />
										Filial
									</span>
								</>
							)}
						</p>
					</div>

					<div className="flex shrink-0 items-center gap-3">
						<span className="inline-flex items-center gap-1 rounded-md bg-info/15 px-2.5 py-1 font-semibold text-[11px] text-info">
							Em separação
						</span>
						<Button asChild size="sm" variant="outline">
							<Link href="/dashboard/separacao">
								<ArrowLeftIcon aria-hidden className="size-4" />
								Voltar à fila
							</Link>
						</Button>
						<Button
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
							disabled={isCanceling}
							onClick={() => setIsCancelOpen(true)}
							size="sm"
							variant="ghost"
						>
							<BanIcon aria-hidden className="size-3.5 shrink-0" />
							Cancelar
						</Button>
					</div>
				</div>

				<div className="mt-4 flex items-center gap-3">
					<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-input">
						<div
							className="h-full bg-primary transition-[width]"
							style={{ width: `${progressPct}%` }}
						/>
					</div>
					<span className="shrink-0 text-[13px] tabular-nums">
						<span className="font-semibold text-foreground">
							{summary.pickedUnits}
						</span>{" "}
						<span className="text-muted-foreground">
							/ {summary.totalUnits} un · {doneCount} de {localItems.length} itens
						</span>
					</span>
				</div>
			</div>
```

Mudanças: removido o `<Link>` voltar à esquerda; título em `font-serif` (era sans bold); saída "Voltar à fila" + "Cancelar" como ações à direita; barra **larga** (`h-2.5`, `flex-1`, track `bg-input` visível) abaixo do título; número sempre visível. O header é um card `bg-card` fechado (não mais `bg-sidebar` `rounded-t-xl border-b-0`).

- [ ] **Step 2: Remover o botão "Cancelar separação" do rodapé da coluna direita** (linhas 727–736 do original, o `<Button ... variant="ghost">` com `BanIcon` "Cancelar separação"). Apagar esse bloco inteiro — o cancelar agora vive no header.

- [ ] **Step 3: Ajustar o palco para não tentar colar no header** — na linha do grid (era 656), trocar `rounded-b-xl` por `rounded-xl` e adicionar `mt-4` (o header e o palco agora são dois cards independentes, separados por respiro):

```tsx
			{/* Palco — 2 colunas */}
			<div className="mt-4 grid grid-cols-[1.45fr_1fr] overflow-hidden rounded-xl border border-border max-[900px]:grid-cols-1">
```

- [ ] **Step 4: Verificar** — `bun check-types && bun check`. (Conferir que `ArrowLeftIcon`, `BanIcon`, `MapPinIcon` seguem importados — estão.)
- [ ] **Step 5: Smoke visual** — `/dashboard/separacao/[orderId]`: sem voltar à esquerda; título em serif; "Voltar à fila" + "Cancelar" à direita; barra de progresso larga e visível abaixo do título mesmo em 0%; header e palco como dois blocos com respiro entre eles.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "feat(separacao): header em serif com saída à direita e barra de progresso larga"
```

---

### Task 5: Execução — painel unificado (scan + foco) + faixa de feedback

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` — coluna esquerda (linhas ~657-677), `FocusCard` (196–285), remoção de `FeedbackLegend` (287–350) e `getFocusLabel` se ficar órfão.

**Interfaces:** `FocusCard` continua recebendo `{ item, feedback, isReporting, onReportOpen }`.

Objetivo: scan-input + item em foco viram **um painel só**; a faixa de feedback (ícone+label) vai pro **topo** do painel; os 3 cards de `FeedbackLegend` saem; `FocusCard` perde o `border-2` e a faixa interna; botão "Item não encontrado" vai pra direita.

- [ ] **Step 1: Adicionar o map de feedback e o componente `FeedbackStrip`** no topo do arquivo, logo após os helpers de cor (após `getFocusBarColor`, ~linha 149). O map é top-level (não recriar por render):

```tsx
const FEEDBACK_STRIP_META = {
	accepted: { label: "Aceito", cls: "bg-success/14 text-success" },
	already_complete: { label: "Já completo", cls: "bg-warning/14 text-warning" },
	not_in_order: { label: "Fora do pedido", cls: "bg-destructive/14 text-destructive" },
} as const;

function FeedbackStrip({ feedback }: { feedback: FeedbackKind }) {
	if (!feedback) {
		return null;
	}
	const meta = FEEDBACK_STRIP_META[feedback];
	return (
		<div
			className={`flex items-center gap-2 px-5 py-2.5 font-semibold text-[13px] ${meta.cls}`}
		>
			{feedback === "accepted" && (
				<CheckIcon aria-hidden className="size-4" strokeWidth={2.6} />
			)}
			{feedback === "already_complete" && (
				<TriangleAlertIcon aria-hidden className="size-4" />
			)}
			{feedback === "not_in_order" && (
				<XIcon aria-hidden className="size-4" strokeWidth={2.6} />
			)}
			{meta.label}
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `FocusCard`** (linhas 196–285) sem o container `border-2` e sem a faixa de label interna (linhas 219–235); botão à direita:

```tsx
function FocusCard({
	item,
	feedback,
	isReporting,
	onReportOpen,
}: FocusCardProps) {
	const countColor = getFocusCountColor(feedback);
	const barColor = getFocusBarColor(feedback);
	const progress = Math.round(
		(item.qtyPicked / Math.max(item.qtyExpected, 1)) * 100
	);

	return (
		<div className="flex gap-4">
			<div className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
				<ImageIcon aria-hidden className="size-9" strokeWidth={1.5} />
			</div>

			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<p className="font-semibold text-[18px] leading-tight">{item.name}</p>

				<div className="flex flex-wrap items-center gap-2">
					{item.voltage && (
						<span className="rounded-[5px] bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
							{item.voltage}
						</span>
					)}
					{item.barcode && (
						<span className="font-mono text-[11px] text-muted-foreground">
							{item.barcode}
						</span>
					)}
				</div>

				<div className="mt-0.5 flex items-baseline gap-2">
					<span
						className={`font-semibold text-[34px] tabular-nums leading-none ${countColor}`}
					>
						{item.qtyPicked}
					</span>
					<span className="text-[13px] text-muted-foreground">
						de {item.qtyExpected}{" "}
						{item.qtyExpected === 1 ? "unidade" : "unidades"}
						{item.qtyPicked < item.qtyExpected &&
							` · falta ${item.qtyExpected - item.qtyPicked}`}
					</span>
				</div>

				<div className="h-2 overflow-hidden rounded-full bg-muted">
					<div
						className={`h-full transition-[width] ${barColor}`}
						style={{ width: `${progress}%` }}
					/>
				</div>

				<div className="flex justify-end">
					<Button
						className="mt-1 w-fit"
						disabled={item.notFound || isReporting}
						onClick={() => onReportOpen(item.id)}
						size="sm"
						variant="outline"
					>
						Item não encontrado
					</Button>
				</div>
			</div>
		</div>
	);
}
```

Removidos: o wrapper `border-2 ... ${getFocusBorder(feedback)}`, o `<span>` de label (accent/label), e a constraint `max-w-[300px]` da barra (agora ocupa a largura do painel). Botão envolto em `flex justify-end`.

- [ ] **Step 3: Deletar o componente `FeedbackLegend`** inteiro (interface `FeedbackLegendProps` + função, linhas 287–350).

- [ ] **Step 4: Reescrever a coluna ESQUERDA** (linhas 657–677) como painel unificado:

```tsx
				{/* ESQUERDA — painel unificado */}
				<div className="border-border border-r p-5 max-[900px]:border-r-0 max-[900px]:border-b">
					<div className="overflow-hidden rounded-xl border border-border bg-card">
						<FeedbackStrip feedback={feedback} />
						<div className="p-5">
							<ScanInput disabled={scanDisabled} onScan={handleScan} />
						</div>
						<div className="h-px bg-border" />
						<div className="p-5">
							{focusedItem ? (
								<FocusCard
									feedback={feedback}
									isReporting={isReporting}
									item={focusedItem}
									onReportOpen={handleReportOpen}
								/>
							) : (
								<div className="flex items-center justify-center rounded-lg border border-border border-dashed p-8">
									<p className="text-[13px] text-muted-foreground">
										Todos os itens foram conferidos
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
```

Removidos: o `gap-5` que separava os blocos, a `<FeedbackLegend>`, e o `bg-surface-deep` do empty state.

- [ ] **Step 5: Remover funções órfãs** — após deletar a faixa interna do FocusCard e a FeedbackLegend, `getFocusBorder`, `getFocusAccent` e `getFocusLabel` podem ficar sem uso. Rodar `bun check` (ultracite acusa `noUnusedVariables`) e **deletar as que ficarem órfãs**. `getFocusCountColor` e `getFocusBarColor` continuam em uso (FocusCard).

- [ ] **Step 6: Verificar** — `bun check-types && bun check`. Esperado: sem erros, sem warnings de variável não-usada.
- [ ] **Step 7: Smoke visual** — `/dashboard/separacao/[orderId]`: campo de scan + item em foco num painel só (divisória entre eles, sem gap solto); ao bipar, faixa "Aceito"/"Já completo"/"Fora do pedido" aparece no topo do painel; sem os 3 cards de legenda; botão "Item não encontrado" à direita.
- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "feat(separacao): unifica scan + item em foco com faixa de feedback inline"
```

---

### Task 6: Execução — realce coral sutil no item ativo da coluna

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` — `ChecklistItemRow` (linhas ~362-367).

- [ ] **Step 1: Trocar o realce do item ativo** (linha ~364-366) de `border-primary/40 bg-muted` por tint coral + ring interno (sem deslocar o layout):

```tsx
		<div
			className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
				state === "cur"
					? "bg-primary/8 ring-1 ring-inset ring-primary/40"
					: ""
			}`}
		>
```

(Remove a `border` base `border-transparent` — o ring interno não desloca, então não precisa reservar a borda.)

- [ ] **Step 2: Verificar** — `bun check-types && bun check`.
- [ ] **Step 3: Smoke visual** — `/dashboard/separacao/[orderId]`: o item ativo na coluna direita tem realce coral sutil (tint + ring fino), não a borda forte de antes.
- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "feat(separacao): realce coral sutil no item ativo da coluna"
```

---

### Task 7: Consistência + verificação final

**Files:**
- Review: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`, `start-picking.tsx`

- [ ] **Step 1: Grep por tokens proibidos na seção** — confirmar que sobrou só teal em badge de status:

```bash
rg -n "ring-info|bg-info|surface-deep|border-2" apps/web/src/app/dashboard/separacao/
```

Esperado: nenhum `ring-info`; `bg-info` só em badge (`bg-info/15 text-info` em `picking-order-card.tsx:43` e `picking-execution.tsx` header); nenhum `border-2`; nenhum `bg-surface-deep`.

- [ ] **Step 2: Revisar `picking-queue.tsx` e `start-picking.tsx`** — se houver `bg-info`/`bg-surface-deep`/`border-2` ou espaçamento fora da escala, ajustar para tokens/escala do sistema; se já estiverem consistentes, não tocar.

- [ ] **Step 3: Verificação completa** — `bun verify` (check-types + check + test). Esperado: verde.

- [ ] **Step 4: Smoke visual final** das duas rotas com `bun dev:web`:
  - `/dashboard/separacao` — banner coral, cards com barra coral.
  - `/dashboard/separacao/[orderId]` — header serif + saída à direita + barra larga; painel de scan unificado com input de cara de campo, feedback em faixa; coluna de itens com realce coral sutil.

- [ ] **Step 5: Commit final (se houver ajuste em queue/start)**

```bash
git add apps/web/src/app/dashboard/separacao/_components/
git commit -m "chore(separacao): consistência de tokens e verificação final"
```

---

## Self-Review (cobertura do spec)

- §3.1 banner coral → Task 1 ✓
- §3.2 scan input cara de campo → Task 3; painel unificado + feedback inline (sem legenda) + botão à direita → Task 5 ✓
- §3.3 header serif + saída à direita + barra larga → Task 4 ✓
- §3.4 agrupamento (header card fechado + palco separado) → Task 4 step 3; item ativo realce sutil → Task 6 ✓
- §3.5 barras coral consistentes → Task 1 (banner), Task 2 (card), Task 4 (header), Task 5 (FocusCard já coral via `getFocusBarColor`) ✓
- §4 princípios (escala, ícones lucide, Button/Badge, botões à direita, AAA) → constraints globais + aplicados nas tasks ✓
- Critério de aceite (sem ring-info/border-2/surface-deep; barra visível; título serif; peça única; feedback inline) → Task 7 grep + smoke ✓

Divergência consciente do spec: barras de progresso permanecem **manuais** (div+div) em vez do componente `<Progress>` — o `Progress` de `@emach/ui` fixa o track em `bg-muted` e não expõe override, e o código existente já usa barras manuais; manter o padrão e clarear o track (`bg-input`) atende o critério "visível em 0%".

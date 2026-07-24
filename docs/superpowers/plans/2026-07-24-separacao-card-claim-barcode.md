# Separação: card = claim, barcode oculto, paste no bip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicar no card (ou deep-link) claima a separação sem tela intermediária; barcode some da UI de execução; colar no bip valida na hora.

**Architecture:** Abordagem A da spec — mutação só via `startPicking` (server action). Na fila, o card da tab A separar deixa de ser `Link` e vira o mesmo claim do CTA. Na rota, `AutoClaimPicking` (client) substitui `StartPicking` e dispara claim no mount. Barcode deixa de renderizar em `FocusCard`/`ChecklistItemRow`; `ScanInput` passa a submeter no `onPaste`.

**Tech Stack:** Next 16 App Router (RSC + client components + server actions), vitest (env node, `renderToStaticMarkup` onde couber), React 19 + React Compiler.

**Spec:** `docs/superpowers/specs/2026-07-24-separacao-card-claim-barcode-design.md`

## Global Constraints

- Banco Supabase é ÚNICO e COMPARTILHADO (dev=prod). NUNCA seed/truncate/reset. Write pontual de linha pra smoke é OK; reverter ao terminar.
- CWD é a RAIZ do monorepo — nunca `cd apps/web`; caminhos absolutos nos comandos.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com "string not found", re-Read o arquivo.
- Proibido: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`, `key={index}` sem justificativa, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Copy de UI em PT-BR. Commits: Conventional Commits em PT, subject ≤50 chars, ZERO atribuição de AI.
- Gate por task: testes do arquivo tocado + `bun check-types --force` se tipos mudarem. Gate final: `bun verify`.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read antes de re-tentar.
- **Não** alterar `startPicking` / match de barcode no server / schema. Só UI + shell de claim.

## File map

| Arquivo | Responsabilidade |
| --- | --- |
| `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx` | Campo de bip: Enter + paste |
| `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` | UI de execução — esconder barcode |
| `apps/web/src/app/dashboard/separacao/_components/auto-claim-picking.tsx` | **Novo** — claim no mount ou bloqueio |
| `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx` | **Removido** |
| `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx` | Wire `AutoClaimPicking` |
| `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx` | Card A separar = claim |

---

### Task 1: ScanInput — paste submete

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx`
- Test (create): `apps/web/src/app/dashboard/separacao/_components/__tests__/scan-input-paste.test.ts`

**Interfaces:**
- Consumes: props existentes `{ disabled?: boolean; onScan: (code: string) => void }`
- Produces: export puro `normalizeScanCode(raw: string): string` (trim) usado pelo paste/Enter e testado sem DOM

- [ ] **Step 1: Escrever o teste do normalizer (falha até exportar)**

Criar `apps/web/src/app/dashboard/separacao/_components/__tests__/scan-input-paste.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { normalizeScanCode } from "../scan-input";

describe("normalizeScanCode (paste/Enter do bip)", () => {
	it("trima espaços e quebras de linha de clipboard", () => {
		expect(normalizeScanCode("  7891234567890\n")).toBe("7891234567890");
	});

	it("string só de whitespace vira vazio", () => {
		expect(normalizeScanCode("   \t  ")).toBe("");
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run (raiz do monorepo):

```bash
bun --cwd apps/web test src/app/dashboard/separacao/_components/__tests__/scan-input-paste.test.ts
```

Expected: FAIL (export `normalizeScanCode` inexistente).

- [ ] **Step 3: Implementar normalizer + onPaste no ScanInput**

Reescrever `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx` para:

```tsx
"use client";

import { Input } from "@emach/ui/components/input";
import { BarcodeIcon } from "lucide-react";
import { useRef, useState } from "react";

interface ScanInputProps {
	disabled?: boolean;
	onScan: (code: string) => void;
}

/** Trim do código lido (Enter ou paste). Exportado para teste unitário. */
export function normalizeScanCode(raw: string): string {
	return raw.trim();
}

export function ScanInput({ disabled, onScan }: ScanInputProps) {
	const [value, setValue] = useState("");
	const ref = useRef<HTMLInputElement>(null);

	function submit(raw: string) {
		const code = normalizeScanCode(raw);
		if (!code) {
			return;
		}
		setValue("");
		onScan(code);
		requestAnimationFrame(() => ref.current?.focus());
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key !== "Enter") {
			return;
		}
		submit(value);
	}

	function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
		e.preventDefault();
		const raw = e.clipboardData.getData("text");
		submit(raw);
	}

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
					onPaste={handlePaste}
					placeholder="Bipe o código de barras…"
					ref={ref}
					type="text"
					value={value}
				/>
			</div>
			<p className="pl-0.5 text-[12px] text-muted-foreground">
				Foco automático · leitor dá Enter sozinho · colar também valida na
				hora
			</p>
		</div>
	);
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

```bash
bun --cwd apps/web test src/app/dashboard/separacao/_components/__tests__/scan-input-paste.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/scan-input.tsx \
  apps/web/src/app/dashboard/separacao/_components/__tests__/scan-input-paste.test.ts
git commit -m "$(cat <<'EOF'
feat: colar no bip valida na hora

EOF
)"
```

---

### Task 2: Esconder barcode na UI de execução

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`
- Test (create): `apps/web/src/app/dashboard/separacao/_components/__tests__/picking-item-secondary-line.test.ts`

**Interfaces:**
- Consumes: `LocalItem` com `voltage` / `barcode` (barcode continua no estado; só deixa de renderizar)
- Produces: export puro `pickingItemSecondaryLine(item: { voltage: string | null; notFound: boolean }): string | null` — linha secundária da checklist **sem** barcode

- [ ] **Step 1: Teste da linha secundária (falha)**

Criar `apps/web/src/app/dashboard/separacao/_components/__tests__/picking-item-secondary-line.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { pickingItemSecondaryLine } from "../picking-execution";

describe("pickingItemSecondaryLine (sem barcode na UI)", () => {
	it("exceção → copy fixo", () => {
		expect(
			pickingItemSecondaryLine({ voltage: "220V", notFound: true })
		).toBe("Falta reportada · em exceção");
	});

	it("com tensão e sem exceção → só tensão", () => {
		expect(
			pickingItemSecondaryLine({ voltage: "110V", notFound: false })
		).toBe("110V");
	});

	it("sem tensão e sem exceção → null (omite a linha)", () => {
		expect(
			pickingItemSecondaryLine({ voltage: null, notFound: false })
		).toBeNull();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
bun --cwd apps/web test src/app/dashboard/separacao/_components/__tests__/picking-item-secondary-line.test.ts
```

Expected: FAIL (export inexistente).

- [ ] **Step 3: Implementar helper + limpar JSX**

Em `picking-execution.tsx`:

1. Adicionar export (perto dos helpers puros, antes dos sub-componentes):

```ts
/** Linha secundária da checklist — nunca expõe barcode (anti-cola visual). */
export function pickingItemSecondaryLine(item: {
	notFound: boolean;
	voltage: string | null;
}): string | null {
	if (item.notFound) {
		return "Falta reportada · em exceção";
	}
	if (item.voltage) {
		return item.voltage;
	}
	return null;
}
```

2. Em `FocusCard`, **remover** o bloco:

```tsx
{item.barcode && (
  <span className="font-mono text-[11px] text-muted-foreground">
    {item.barcode}
  </span>
)}
```

Manter o chip de `voltage` se existir.

3. Em `ChecklistItemRow`, substituir o trecho da linha secundária por:

```tsx
<div className="min-w-0 flex-1">
  <p className="truncate font-medium text-[13px]">{item.name}</p>
  {(() => {
    const secondary = pickingItemSecondaryLine(item);
    if (!secondary) {
      return null;
    }
    return (
      <p
        className={`text-[11px] ${
          item.notFound ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {secondary}
      </p>
    );
  })()}
</div>
```

(Ou extrair a className de cor para o helper se preferir — não obrigatório.)

**Não** remover `barcode` de `LocalItem` / `toLocalItem` / match server.

- [ ] **Step 4: Rodar teste + greps de sanidade**

```bash
bun --cwd apps/web test src/app/dashboard/separacao/_components/__tests__/picking-item-secondary-line.test.ts
rg -n 'item\.barcode' apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
```

Expected: PASS no teste. `rg` pode ainda achar `barcode` em `toLocalItem` / tipo — **não** deve achar render JSX com `{item.barcode`. Confirme manualmente: nenhuma ocorrência em JSX de FocusCard/Checklist.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx \
  apps/web/src/app/dashboard/separacao/_components/__tests__/picking-item-secondary-line.test.ts
git commit -m "$(cat <<'EOF'
fix: esconde barcode na UI de separação

EOF
)"
```

---

### Task 3: AutoClaimPicking + page; remover StartPicking

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_components/auto-claim-picking.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`
- Delete: `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx`
- Test: smoke + `rg` garantindo zero imports de `StartPicking`

**Interfaces:**
- Consumes: `startPicking(orderId)` de `../actions`; `exceptionResumeDenial` já usado na page
- Produces:
  - `AutoClaimPicking({ orderId: string; canStart: boolean; exceptionContext?: { pickerName: string; reason: string | null } | null })`

- [ ] **Step 1: Criar `auto-claim-picking.tsx`**

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { notify } from "@/lib/notify";
import { startPicking } from "../actions";

export interface PickingExceptionContext {
	pickerName: string;
	reason: string | null;
}

interface AutoClaimPickingProps {
	canStart: boolean;
	exceptionContext?: PickingExceptionContext | null;
	orderId: string;
}

/**
 * Substitui a tela legada "Iniciar separação": claima no mount (1×) e deixa o
 * RSC re-renderizar em PickingExecution. Bloqueio de posse de exceção só
 * mostra mensagem — sem botão e sem loop.
 */
export function AutoClaimPicking({
	canStart,
	exceptionContext,
	orderId,
}: AutoClaimPickingProps) {
	const router = useRouter();
	const firedRef = useRef(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!canStart || firedRef.current) {
			return;
		}
		firedRef.current = true;

		void (async () => {
			const result = await startPicking(orderId);
			if (result.ok) {
				router.refresh();
				return;
			}
			setError(result.error);
			notify.error(result.error);
		})();
	}, [canStart, orderId, router]);

	if (!canStart) {
		return (
			<div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
				{exceptionContext && (
					<div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
						<p className="font-medium text-warning">
							Separação anterior terminou com exceção
						</p>
						<p className="mt-1 text-muted-foreground">
							{exceptionContext.reason ?? "Item não encontrado"} — por{" "}
							{exceptionContext.pickerName}. Para reembolsar, use o detalhe do
							pedido.
						</p>
					</div>
				)}
				<p className="text-muted-foreground text-sm">
					Somente {exceptionContext?.pickerName ?? "o operador original"} ou um
					admin pode reabrir esta separação.
				</p>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
				<p className="text-destructive text-sm">{error}</p>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
			</div>
		);
	}

	return (
		<div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
			<p className="font-medium text-sm">
				{exceptionContext
					? "Reabrindo separação…"
					: "Iniciando separação…"}
			</p>
			{exceptionContext && (
				<p className="max-w-md text-center text-muted-foreground text-sm">
					Exceção anterior:{" "}
					{exceptionContext.reason ?? "Item não encontrado"} — por{" "}
					{exceptionContext.pickerName}.
				</p>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Wire na page e remover StartPicking**

Em `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`:

1. Trocar import:

```ts
// remover
import { StartPicking } from "../_components/start-picking";
// adicionar
import { AutoClaimPicking } from "../_components/auto-claim-picking";
```

2. No return final (quando não há execução/readonly), substituir:

```tsx
return (
  <AutoClaimPicking
    canStart={canStart}
    exceptionContext={exceptionContext}
    orderId={orderId}
  />
);
```

3. Deletar o arquivo `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx`.

4. Garantir zero referências:

```bash
rg -n 'StartPicking|start-picking' apps/web/src
```

Expected: sem matches (exceto se aparecer em docs — docs fora de `apps/web/src` ok).

- [ ] **Step 3: check-types**

```bash
bun check-types --force
```

Expected: PASS (ou só erros pré-existentes fora de separacao).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/auto-claim-picking.tsx \
  apps/web/src/app/dashboard/separacao/[orderId]/page.tsx
git rm apps/web/src/app/dashboard/separacao/_components/start-picking.tsx
git commit -m "$(cat <<'EOF'
feat: auto-claim na rota de separação

EOF
)"
```

---

### Task 4: Card da fila A separar = claim

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`

**Interfaces:**
- Consumes: `startPicking`, `queueCardCta`, props atuais do card
- Produces: mesmo componente; em `tab === "a_separar"` o root **não** é `Link` — é `div role="button"` com `handleStart`; outras tabs mantêm `Link`

- [ ] **Step 1: Re-Read do card e extrair o shell**

Ler `picking-order-card.tsx` inteiro. O `handleStart` já existe (linhas ~127–138). Objetivo: em A separar, o **corpo inteiro** do card chama `handleStart` (não só o CTA).

- [ ] **Step 2: Implementar root condicional**

Substituir o `return` do `PickingOrderCard` por estrutura equivalente a:

```tsx
const cardClassName = `group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isForeign ? "opacity-60" : ""}`;

const body = (
  <>
    {/* header, meta, stale, exception, progress, footer métricas — INALTERADOS */}
    {/* CTA: em a_separar, só visual (sem role=button aninhado); nas outras tabs, igual */}
    {cta && (
      <div className="border-border border-t bg-sidebar px-4 py-3">
        {tab === "a_separar" ? (
          <div
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_KIND_CLASS[cta.kind]} ${isStarting ? "opacity-70" : ""}`}
            // role="none": o root do card já é o interativo
            role="none"
          >
            {isStarting ? "Iniciando…" : cta.label}
            <ArrowRightIcon aria-hidden className="size-4" />
          </div>
        ) : (
          <div
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_KIND_CLASS[cta.kind]}`}
            role="none"
          >
            {cta.label}
          </div>
        )}
      </div>
    )}
  </>
);

if (tab === "a_separar") {
  return (
    // biome-ignore lint/a11y/useSemanticElements: card clicável (DESIGN.md §4)
    <div
      aria-disabled={isStarting}
      className={`${cardClassName} cursor-pointer aria-disabled:cursor-not-allowed aria-disabled:opacity-70`}
      onClick={() => {
        handleStart();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleStart();
        }
      }}
      role="button"
      tabIndex={0}
    >
      {body}
    </div>
  );
}

return (
  <Link className={cardClassName} href={`/dashboard/separacao/${row.orderId}`}>
    {body}
  </Link>
);
```

Notas de implementação:

- Remover o antigo CTA com `role="button"` aninhado em A separar (evita botão dentro de botão).
- `handleStart` já no-ops se `isStarting`.
- Bulk: `SelectableItem` com `active` usa capture + `preventDefault` — clique no card em modo seleção **não** deve chegar a navegar; com `div role=button` o capture do parent ainda roda primeiro e chama `onToggle` — **não** chamar `handleStart` se o evento foi cancelado? Na prática o capture do `SelectableItem` faz `stopPropagation`, então o bubble do `onClick` do card **não** dispara. Confirmar: capture no parent roda antes do target; `stopPropagation` no capture impede listeners no target?  
  **HTML:** listeners no target ainda rodam na fase target se o capture do ancestor não chamar `stopPropagation` antes... Actually: capture phase goes root→target, then target, then bubble. If SelectableItem's capture calls `stopPropagation`, the event never reaches the target's listeners. Good — bulk mode safe.
- Comentário no topo do card: atualizar o bloco que diz "Card-Link continua navegando pro fallback" — agora A separar claima no card.

- [ ] **Step 3: Grep + check-types**

```bash
rg -n 'href=\{`/dashboard/separacao/\$\{row.orderId\}`' apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx
bun check-types --force
```

Expected: o `href` do `Link` só aparece no ramo `tab !== "a_separar"`. Types PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx
git commit -m "$(cat <<'EOF'
feat: card A separar claima como Separar

EOF
)"
```

---

### Task 5: Gate final + smoke

**Files:** nenhum novo — verificação.

- [ ] **Step 1: Suite de testes de separacao + verify**

```bash
bun --cwd apps/web test src/app/dashboard/separacao
bun verify
```

Expected: PASS nos testes de separacao; `bun verify` PASS (check-types + check + test monorepo).

- [ ] **Step 2: Smoke manual** (dev server se disponível)

Com app em alguma porta (ex. 3006):

1. `/dashboard/separacao` tab **A separar** → clique no **corpo** do card → deve ir direto à execução (sem "Iniciar separação"), claim ok.
2. Mesmo pedido se já em progresso próprio → retoma execução.
3. Deep-link `/dashboard/separacao/{id}` de pedido a separar → flash "Iniciando…" → execução.
4. Exceção alheia com role user → bloqueio, sem loop.
5. Execução: **nenhum** barcode visível no foco nem na lista; colar código no bip → feedback de scan; Enter ainda funciona.

- [ ] **Step 3: Commit de docs se o plan foi atualizado com checkboxes** (opcional)

Se o executor marcou checkboxes no plan:

```bash
git add docs/superpowers/plans/2026-07-24-separacao-card-claim-barcode.md
git commit -m "$(cat <<'EOF'
docs: marca plan card-claim barcode concluído

EOF
)"
```

Só se houver diff real no plan.

---

## Self-review (autor do plan)

| Spec § | Task |
| --- | --- |
| 1 Fila card = claim | Task 4 |
| 2 AutoClaim + remove StartPicking | Task 3 |
| 3 Barcode oculto | Task 2 |
| 4 Paste no ScanInput | Task 1 |
| Aceite 1–7 | Task 5 smoke |
| Fora de escopo (strip payload, debounce, server GET claim) | respeitado — nenhum task toca |

Placeholders: nenhum. Assinaturas `AutoClaimPicking` / `normalizeScanCode` / `pickingItemSecondaryLine` consistentes entre tasks. `startPicking` inalterado.

# Etiqueta de Envio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o documento "Dados de envio" na "Etiqueta de envio" (2 por folha A4, barcode de CEP, sem valores) e corrigir o fluxo de rastreio (código opcional no envio, editável depois).

**Architecture:** O route handler `/dashboard/orders/shipping-doc` (GET → PDF via `@react-pdf/renderer`) permanece; muda o documento renderizado (pareamento 2-por-página em lógica pura + barcode PNG via `bwip-js` gerado no route e injetado por prop) e os rótulos de UI. Na coluna de ação do pedido, o botão "Salvar" avulso sai e um card "Rastreio" novo aparece pós-envio usando a server action `updateTrackingCode` existente (sem mudança server-side — verificado: não há guard de status).

**Tech Stack:** Next 16 (route handler nodejs), `@react-pdf/renderer`, `bwip-js@^4.11`, React 19 client components, vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-etiqueta-envio-design.md` (mockups aprovados em `.superpowers/brainstorm/2497307-1785954471/content/etiqueta-final.html` e `acao-pedido.html`).

## Global Constraints

- CWD é a RAIZ do monorepo — nunca `cd apps/web`; paths absolutos nos comandos.
- Banco Supabase é ÚNICO e COMPARTILHADO (dev = prod) — este plano NÃO toca schema nem dados; nenhum `db:push`/seed.
- Proibido: `console.*` (usar `logger`), `any`/`@ts-ignore`, `key={index}` sem justificativa, `forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Copy pt-BR; commits Conventional Commits em PT, subject ≤50 chars, SEM atribuição de AI.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar por `old_string`, re-ler o arquivo.
- Gate por task: `bun check-types && bun check` no mínimo; testes da área tocada.
- `try`/`finally` e `throw` no corpo de `try` fazem o React Compiler bailar — cleanup no fim do try + duplicado no catch (ver apps/web/CLAUDE.md §React Compiler).

---

### Task 1: Renomeação de UI (D1)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/picking-status-card.tsx:222` (label "Dados de envio")
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-view.tsx:242` (label bulk)
- Modify: `apps/web/src/app/dashboard/orders/shipping-doc/route.ts:52` (filename)

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: nada consumido por outras tasks (labels).

- [ ] **Step 1: Trocar o label no PickedSummary**

Em `picking-status-card.tsx`, no componente `PickedSummary`, trocar o texto do link (mantendo href/target):

```tsx
					Emitir etiqueta
```

(era `Dados de envio`; o link `/dashboard/orders/shipping-doc?ids=${orderId}` e `target="_blank"` não mudam)

- [ ] **Step 2: Trocar o label da bulk action**

Em `orders-view.tsx`, no bloco `if (tabKey === "picked" ...)`:

```tsx
			label: `Emitir etiquetas (${sel.selectedIds.length})`,
```

- [ ] **Step 3: Trocar o filename do PDF na route**

Em `route.ts`:

```ts
				"Content-Disposition": `inline; filename="etiqueta-envio-${generatedAt.getTime()}.pdf"`,
```

(o tag `logger.info("shipping_doc.pdf", ...)` NÃO muda — identificador interno)

- [ ] **Step 4: Verificar que não sobrou "Dados de envio" clicável**

Run: `rg -n "Dados de envio" apps/web/src`
Expected: restam apenas ocorrências dentro de `shipping-doc/_lib/` (título do documento, morre na Task 5) e comentários. Nenhum label de botão/ação.

- [ ] **Step 5: Gate + commit**

Run: `bun check-types && bun check`
Expected: verde.

```bash
git add apps/web/src/app/dashboard/orders/[id]/_components/picking-status-card.tsx apps/web/src/app/dashboard/orders/_components/orders-view.tsx apps/web/src/app/dashboard/orders/shipping-doc/route.ts
git commit -m "feat: renomeia dados de envio p/ etiqueta de envio"
```

---

### Task 2: Helper de barcode Code 128 (bwip-js)

**Files:**
- Modify: `apps/web/package.json` (dependência `bwip-js`)
- Create: `apps/web/src/app/dashboard/orders/shipping-doc/_lib/barcode.ts`
- Test: `apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/barcode.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `cepBarcodeDataUri(cep: string | null): Promise<string | null>` — data URI `data:image/png;base64,…` de um Code 128 com os 8 dígitos do CEP; `null` se o CEP for ausente/inválido. Consumido pela Task 6 (route).

- [ ] **Step 1: Instalar a dependência**

Run: `bun --cwd apps/web add bwip-js@^4.11.2`
Expected: adicionada em `apps/web/package.json` dependencies.

- [ ] **Step 2: Escrever o teste que falha**

`__tests__/barcode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cepBarcodeDataUri } from "../barcode";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("cepBarcodeDataUri", () => {
	it("gera PNG data URI para CEP válido (com ou sem máscara)", async () => {
		const uri = await cepBarcodeDataUri("80050-450");
		expect(uri).toMatch(/^data:image\/png;base64,/);
		const decoded = Buffer.from(
			(uri as string).replace("data:image/png;base64,", ""),
			"base64"
		);
		expect(decoded.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
	});

	it("devolve null para CEP ausente ou inválido", async () => {
		expect(await cepBarcodeDataUri(null)).toBeNull();
		expect(await cepBarcodeDataUri("")).toBeNull();
		expect(await cepBarcodeDataUri("1234")).toBeNull();
	});
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/barcode.test.ts`
Expected: FAIL (módulo `../barcode` não existe).

- [ ] **Step 4: Implementar**

`barcode.ts`:

```ts
import bwipjs from "bwip-js/node";

const CEP_DIGITS = /^\d{8}$/;

/**
 * Code 128 do CEP (padrão de triagem dos Correios) como PNG data URI para o
 * <Image> do react-pdf. Null quando não há CEP utilizável — a etiqueta sai sem
 * barcode, nunca com barcode de dado errado.
 */
export async function cepBarcodeDataUri(
	cep: string | null
): Promise<string | null> {
	const digits = (cep ?? "").replace(/\D/g, "");
	if (!CEP_DIGITS.test(digits)) {
		return null;
	}
	const png = await bwipjs.toBuffer({
		bcid: "code128",
		text: digits,
		scale: 3,
		height: 8,
		includetext: false,
	});
	return `data:image/png;base64,${png.toString("base64")}`;
}
```

Nota: import `bwip-js/node` (export map do pacote); se o TS reclamar do subpath, usar `import bwipjs from "bwip-js"` — em runtime nodejs resolve o build node. Conferir tipos com check-types.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/barcode.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: Gate + commit**

Run: `bun check-types && bun check`

```bash
git add apps/web/package.json bun.lock apps/web/src/app/dashboard/orders/shipping-doc/_lib/barcode.ts apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/barcode.test.ts
git commit -m "feat: barcode code128 de cep p/ etiqueta"
```

---

### Task 3: Lógica pura — pareamento e linhas da etiqueta

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/shipping-doc/_lib/shipping-doc-logic.ts`
- Test (modify): `apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/shipping-doc-logic.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (consumidos pela Task 5):
  - `interface ShippingDocItem { name: string; quantity: number; sku: string | null; voltage: string | null }` (⚠️ `unitPrice`/`lineTotal` REMOVIDOS)
  - `MAX_ITEMS_PER_HALF = 8`
  - `type LabelSheet = { kind: "pair"; top: ShippingDocOrder; bottom: ShippingDocOrder | null } | { kind: "full"; order: ShippingDocOrder }`
  - `paginateLabels(orders: ShippingDocOrder[]): LabelSheet[]`
  - `labelRecipientLines(r: ShippingDocRecipient): { street: string | null; locality: string | null; cep: string | null }` — `locality` = "Bairro · Cidade/UF", `cep` formatado `00000-000`
  - `senderInline(s: ShippingDocSender): string | null` — endereço da filial em linha única com `·`
  - `itemsSummary(items: ShippingDocItem[]): string` — `"4 itens · 5 un."` (singular correto: `"1 item · 1 un."`)
- Removidos (sem consumidores após Task 5): `contentDeclarationTotals`, `ContentDeclarationTotals`, `formatBRL`, `maskDocument`, `displayPhone`, `formatCarrierService`, `NO_CARRIER_LABEL`, `senderAddressLines`, `recipientAddressLines`. CPF/telefone saem da etiqueta (mockup aprovado; DANFE acompanha a caixa — LGPD a favor).

- [ ] **Step 1: Confirmar que os removidos não têm consumidor externo**

Run: `rg -n "maskDocument|displayPhone|formatCarrierService|NO_CARRIER_LABEL|contentDeclarationTotals|formatBRL|senderAddressLines|recipientAddressLines" apps/web/src --glob '!*shipping-doc*'`
Expected: nenhuma ocorrência (tudo é local da feature). Se aparecer consumidor, manter essa função e ajustar o plano da remoção.

- [ ] **Step 2: Escrever os testes que falham**

Substituir em `shipping-doc-logic.test.ts` os describes de `contentDeclarationTotals`/`maskDocument`/`formatCarrierService`/`senderAddressLines`/`recipientAddressLines` (removidos) por:

```ts
import { describe, expect, it } from "vitest";
import {
	itemsSummary,
	labelRecipientLines,
	paginateLabels,
	senderInline,
	type ShippingDocItem,
	type ShippingDocOrder,
} from "../shipping-doc-logic";

function makeItem(n: number): ShippingDocItem {
	return { name: `Item ${n}`, quantity: 1, sku: null, voltage: null };
}

function makeOrder(id: string, itemCount: number): ShippingDocOrder {
	return {
		id,
		number: `EM-${id}`,
		items: Array.from({ length: itemCount }, (_, i) => makeItem(i)),
		recipient: {
			city: "Curitiba",
			complement: "apt 02",
			document: null,
			name: "Othavio Quiliao",
			neighborhood: "Cristo Rei",
			number: "106",
			phone: null,
			state: "PR",
			street: "Rua Oyapock",
			zipCode: "80050450",
		},
		sender: {
			cep: "88336310",
			city: "Balneário Camboriú",
			complement: "Loja Pinheiro",
			name: "Balneário Camboriú",
			neighborhood: "Nova Esperança",
			phone: null,
			state: "SC",
			street: "Rua Pascoal Moreira Cabral Leme",
			streetNumber: "64",
		},
		shippingMethod: "PAC",
		shippingServiceCode: null,
	};
}

describe("paginateLabels", () => {
	it("pareia pedidos pequenos 2 por folha, ímpar deixa bottom null", () => {
		const sheets = paginateLabels([
			makeOrder("a", 2),
			makeOrder("b", 3),
			makeOrder("c", 1),
		]);
		expect(sheets).toHaveLength(2);
		expect(sheets[0]).toMatchObject({ kind: "pair" });
		expect(sheets[1]).toMatchObject({ kind: "pair", bottom: null });
	});

	it("pedido com mais de 8 itens ganha folha exclusiva, preservando ordem", () => {
		const sheets = paginateLabels([
			makeOrder("a", 2),
			makeOrder("big", 9),
			makeOrder("c", 1),
		]);
		expect(sheets.map((s) => s.kind)).toEqual(["full", "pair"]);
		const pair = sheets[1];
		if (pair?.kind !== "pair") {
			throw new Error("esperava pair");
		}
		expect(pair.top.id).toBe("a");
		expect(pair.bottom?.id).toBe("c");
	});

	it("lista vazia devolve zero folhas", () => {
		expect(paginateLabels([])).toEqual([]);
	});
});

describe("labelRecipientLines", () => {
	it("monta street, locality e cep formatado", () => {
		const lines = labelRecipientLines(makeOrder("a", 1).recipient);
		expect(lines.street).toBe("Rua Oyapock, 106 — apt 02");
		expect(lines.locality).toBe("Cristo Rei · Curitiba/PR");
		expect(lines.cep).toBe("80050-450");
	});

	it("degrada com campos ausentes sem 'undefined'", () => {
		const lines = labelRecipientLines({
			city: null,
			complement: null,
			document: null,
			name: null,
			neighborhood: null,
			number: null,
			phone: null,
			state: "PR",
			street: null,
			zipCode: null,
		});
		expect(lines.street).toBeNull();
		expect(lines.locality).toBe("PR");
		expect(lines.cep).toBeNull();
	});
});

describe("senderInline", () => {
	it("linha única com separador ·", () => {
		expect(senderInline(makeOrder("a", 1).sender)).toBe(
			"Rua Pascoal Moreira Cabral Leme, 64 — Loja Pinheiro · Nova Esperança · Balneário Camboriú/SC · CEP 88336-310"
		);
	});

	it("null quando não há nenhum campo", () => {
		expect(
			senderInline({
				cep: null,
				city: null,
				complement: null,
				name: null,
				neighborhood: null,
				phone: null,
				state: null,
				street: null,
				streetNumber: null,
			})
		).toBeNull();
	});
});

describe("itemsSummary", () => {
	it("plural e soma de unidades", () => {
		const items = [
			{ name: "A", quantity: 2, sku: null, voltage: null },
			{ name: "B", quantity: 3, sku: null, voltage: null },
		];
		expect(itemsSummary(items)).toBe("2 itens · 5 un.");
	});
	it("singular", () => {
		expect(itemsSummary([{ name: "A", quantity: 1, sku: null, voltage: null }])).toBe(
			"1 item · 1 un."
		);
	});
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/shipping-doc-logic.test.ts`
Expected: FAIL (funções não existem; imports antigos quebrados).

- [ ] **Step 4: Implementar em shipping-doc-logic.ts**

Manter `ShippingDocSender`, `ShippingDocRecipient`, `ShippingDocOrder` (sem os campos de preço em items), `streetLine`/`cityStateLine` privadas. Substituir o resto por:

```ts
export interface ShippingDocItem {
	name: string;
	quantity: number;
	sku: string | null;
	voltage: string | null;
}

/** Régua da metade: acima disso o pedido ganha folha exclusiva (spec D2). */
export const MAX_ITEMS_PER_HALF = 8;

export type LabelSheet =
	| { kind: "pair"; top: ShippingDocOrder; bottom: ShippingDocOrder | null }
	| { kind: "full"; order: ShippingDocOrder };

/**
 * 2 etiquetas por A4: pedidos com até MAX_ITEMS_PER_HALF itens pareiam em
 * ordem; maiores saem primeiro em folha exclusiva. Lote ímpar deixa a última
 * metade em branco (bottom null).
 */
export function paginateLabels(orders: ShippingDocOrder[]): LabelSheet[] {
	const sheets: LabelSheet[] = [];
	const halves: ShippingDocOrder[] = [];
	for (const order of orders) {
		if (order.items.length > MAX_ITEMS_PER_HALF) {
			sheets.push({ kind: "full", order });
		} else {
			halves.push(order);
		}
	}
	for (let i = 0; i < halves.length; i += 2) {
		const top = halves[i];
		if (!top) {
			break;
		}
		sheets.push({ kind: "pair", top, bottom: halves[i + 1] ?? null });
	}
	return sheets;
}

export function labelRecipientLines(r: ShippingDocRecipient): {
	cep: string | null;
	locality: string | null;
	street: string | null;
} {
	const cep = formatCep(r.zipCode);
	return {
		cep: cep || null,
		locality:
			[r.neighborhood, cityStateLine(r.city, r.state)]
				.filter(Boolean)
				.join(" · ") || null,
		street: streetLine(r.street, r.number, r.complement),
	};
}

/** Endereço da filial em linha única — remetente compacto da etiqueta. */
export function senderInline(s: ShippingDocSender): string | null {
	const cep = formatCep(s.cep);
	const line = [
		streetLine(s.street, s.streetNumber, s.complement),
		s.neighborhood,
		cityStateLine(s.city, s.state),
		cep ? `CEP ${cep}` : null,
	]
		.filter(Boolean)
		.join(" · ");
	return line || null;
}

export function itemsSummary(items: ShippingDocItem[]): string {
	const units = items.reduce((sum, i) => sum + i.quantity, 0);
	const itemWord = items.length === 1 ? "item" : "itens";
	return `${items.length} ${itemWord} · ${units} un.`;
}
```

Remover: `contentDeclarationTotals`, `ContentDeclarationTotals`, `formatBRL`, `maskDocument`, `displayPhone`, `formatCarrierService`, `NO_CARRIER_LABEL`, `senderAddressLines`, `recipientAddressLines` e o import de `normalizeDocument`/`formatPhone` que ficarem órfãos. (`formatCep` de `@/lib/format/branch` continua.)

⚠️ Isso quebra `shipping-doc.tsx` (Task 5 conserta) e `document.test.tsx` momentaneamente — a suíte inteira só precisa estar verde no fim da Task 5; nesta task rode só o arquivo de teste da lógica.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/shipping-doc-logic.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit (parcial consciente)**

```bash
git add apps/web/src/app/dashboard/orders/shipping-doc/_lib/shipping-doc-logic.ts apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/shipping-doc-logic.test.ts
git commit -m "feat: pareamento e linhas da etiqueta de envio"
```

(check-types ainda falha em shipping-doc.tsx — esperado; Tasks 3–5 são uma sequência; NÃO rodar `bun verify` aqui.)

---

### Task 4: data.ts — itens com sku/voltage, sem preços

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/shipping-doc/_lib/data.ts`

**Interfaces:**
- Consumes: `ShippingDocItem` novo (Task 3).
- Produces: `fetchShippingDocOrders` inalterada na assinatura; itens agora `{name, quantity, sku, voltage}`.

- [ ] **Step 1: Atualizar o LATERAL de itens**

```sql
			LEFT JOIN LATERAL (
				SELECT COALESCE(jsonb_agg(jsonb_build_object(
					'name', oi.name,
					'quantity', oi.quantity,
					'sku', oi.sku,
					'voltage', oi.voltage
				) ORDER BY oi.name ASC), '[]'::jsonb) AS items
				FROM order_item oi
				WHERE oi.order_id = o.id
			) li ON true
```

- [ ] **Step 2: Atualizar o mapper**

```ts
		items: (r.items ?? []).map((item) => ({
			name: item.name,
			quantity: Number(item.quantity),
			sku: item.sku ?? null,
			voltage: item.voltage ?? null,
		})),
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/shipping-doc/_lib/data.ts
git commit -m "feat: itens da etiqueta com sku e voltagem"
```

(smoke run-time do SQL acontece na Task 6 — `check-types` não pega SQL inválido)

---

### Task 5: Documento novo — 2 etiquetas por folha

**Files:**
- Rewrite: `apps/web/src/app/dashboard/orders/shipping-doc/_lib/shipping-doc.tsx`
- Test (rewrite): `apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/document.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`paginateLabels`, `LabelSheet`, `labelRecipientLines`, `senderInline`, `itemsSummary`, `MAX_ITEMS_PER_HALF`).
- Produces (consumidos pela Task 6):
  - `ShippingDocDocument({ orders, cepBarcodes }: { orders: ShippingDocOrder[]; cepBarcodes: Record<string, string> })` — `cepBarcodes` mapeia `order.id` → PNG data URI (ausência = etiqueta sem barcode).
  - `EmptyShippingDocDocument()` — sem props (rodapé com data/hora morreu).

- [ ] **Step 1: Reescrever os testes**

`document.test.tsx` (substituir o conteúdo; fixtures sem preços, com sku/voltage):

```tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { registerPdfFonts } from "../../../picking-list/_lib/fonts";
import { EmptyShippingDocDocument, ShippingDocDocument } from "../shipping-doc";
import type { ShippingDocOrder } from "../shipping-doc-logic";

function order(id: string, itemCount: number): ShippingDocOrder {
	return {
		id,
		number: `EM-TEST-91${id}`,
		items: Array.from({ length: itemCount }, (_, i) => ({
			name: `Desempenadeira Elétrica ${i}`,
			quantity: 1,
			sku: `SKU-${i}`,
			voltage: i % 2 === 0 ? "127V" : "220V",
		})),
		recipient: {
			city: "Curitiba",
			complement: "apt 02",
			document: null,
			name: "Othavio Quiliao",
			neighborhood: "Cristo Rei",
			number: "106",
			phone: null,
			state: "PR",
			street: "Rua Oyapock",
			zipCode: "80050450",
		},
		sender: {
			cep: "88336310",
			city: "Balneário Camboriú",
			complement: null,
			name: "Balneário Camboriú",
			neighborhood: "Nova Esperança",
			phone: null,
			state: "SC",
			street: "Rua Pascoal Moreira Cabral Leme",
			streetNumber: "64",
		},
		shippingMethod: "PAC",
		shippingServiceCode: null,
	};
}

const EMPTY_RECIPIENT = {
	city: null,
	complement: null,
	document: null,
	name: null,
	neighborhood: null,
	number: null,
	phone: null,
	state: null,
	street: null,
	zipCode: null,
};

// PNG 1x1 transparente válido — evita depender do bwip-js no teste do documento.
const TINY_PNG =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("ShippingDocDocument", () => {
	it("renderiza PDF válido com 3 pedidos pequenos (2 folhas) e barcode", async () => {
		registerPdfFonts();
		const orders = [order("01", 2), order("02", 4), order("03", 1)];
		const buf = await renderToBuffer(
			<ShippingDocDocument
				cepBarcodes={{ "01": TINY_PNG, "02": TINY_PNG, "03": TINY_PNG }}
				orders={orders}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buf.length).toBeGreaterThan(2000);
	});

	it("pedido grande (9 itens) e campos ausentes renderizam sem quebrar", async () => {
		registerPdfFonts();
		const big = order("04", 9);
		const bare: ShippingDocOrder = {
			...order("05", 1),
			recipient: EMPTY_RECIPIENT,
			sender: {
				cep: null,
				city: null,
				complement: null,
				name: null,
				neighborhood: null,
				phone: null,
				state: null,
				street: null,
				streetNumber: null,
			},
		};
		const buf = await renderToBuffer(
			<ShippingDocDocument cepBarcodes={{}} orders={[big, bare]} />
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});

	it("renderiza documento vazio", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(<EmptyShippingDocDocument />);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/document.test.tsx`
Expected: FAIL (props novas não existem no componente atual).

- [ ] **Step 3: Reescrever shipping-doc.tsx**

Estrutura completa (substitui o arquivo; paleta INK/GRAY/LIGHT/HAIRLINE preservada; sem `Wordmark`, sem rodapé, sem valores, sem serviço):

```tsx
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
	itemsSummary,
	labelRecipientLines,
	type LabelSheet,
	paginateLabels,
	senderInline,
	type ShippingDocOrder,
} from "./shipping-doc-logic";

const INK = "#1c1a17";
const GRAY = "#4a463f";
const LIGHT = "#8a857c";
const HAIRLINE = "#e2ddd6";

const styles = StyleSheet.create({
	page: {
		color: INK,
		fontFamily: "Barlow",
		fontSize: 9,
		paddingHorizontal: 34,
		paddingVertical: 26,
	},
	half: { height: "50%" },
	halfTop: { paddingBottom: 14 },
	halfBottom: { paddingTop: 14 },
	cutRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 6,
	},
	cutLine: {
		borderTopColor: "#b3ada3",
		borderTopStyle: "dashed",
		borderTopWidth: 1,
		flex: 1,
	},
	cutLabel: { color: LIGHT, fontSize: 5.5, letterSpacing: 1.2 },
	head: {
		alignItems: "baseline",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	docTitle: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
		letterSpacing: 0.8,
	},
	orderNum: { fontFamily: "IBM Plex Mono", fontSize: 10, fontWeight: 600 },
	rule: { borderTopColor: INK, borderTopWidth: 2, marginTop: 6 },
	cols: { flex: 1, flexDirection: "row", gap: 16, marginTop: 10 },
	colItems: { width: "47%" },
	colAddr: { flexDirection: "column", width: "53%" },
	micro: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	itemsHead: {
		borderBottomColor: INK,
		borderBottomWidth: 1,
		flexDirection: "row",
		marginTop: 4,
		paddingBottom: 3,
	},
	itemRow: {
		alignItems: "flex-start",
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.6,
		flexDirection: "row",
		paddingVertical: 4,
	},
	qty: {
		fontFamily: "IBM Plex Mono",
		fontSize: 8.5,
		fontWeight: 600,
		width: 24,
	},
	itemName: { flex: 1, fontSize: 8, fontWeight: 500, lineHeight: 1.3 },
	itemSku: { color: LIGHT, fontFamily: "IBM Plex Mono", fontSize: 6 },
	senderBox: {
		borderColor: HAIRLINE,
		borderRadius: 3,
		borderWidth: 0.8,
		padding: 8,
	},
	senderName: { fontSize: 8, fontWeight: 600 },
	senderAddr: { color: GRAY, fontSize: 7, lineHeight: 1.45, marginTop: 1 },
	destBox: {
		borderColor: INK,
		borderRadius: 3,
		borderWidth: 1.3,
		flex: 1,
		flexDirection: "column",
		marginTop: 8,
		overflow: "hidden",
	},
	destBand: {
		backgroundColor: INK,
		color: "#ffffff",
		fontSize: 6.5,
		fontWeight: 600,
		letterSpacing: 1.8,
		paddingHorizontal: 9,
		paddingVertical: 3.5,
		textTransform: "uppercase",
	},
	destBody: { flex: 1, flexDirection: "column", padding: 9 },
	destName: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
	},
	addrLine: { color: GRAY, fontSize: 8.5, lineHeight: 1.5, marginTop: 3 },
	cepInline: { color: INK, fontFamily: "IBM Plex Mono", fontWeight: 600 },
	cepBlock: { marginTop: "auto" },
	cepOver: {
		fontFamily: "IBM Plex Mono",
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: 3,
		textAlign: "center",
	},
	cepBarcode: { height: 26, marginTop: 2, width: "100%" },
	emptyWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
	emptyText: { color: GRAY, fontSize: 11 },
});

function ItemsColumn({ order }: { order: ShippingDocOrder }) {
	return (
		<View style={styles.colItems}>
			<Text style={styles.micro}>{`Conferência · ${itemsSummary(order.items)}`}</Text>
			<View style={styles.itemsHead}>
				<Text style={[styles.micro, { width: 24 }]}>Qtd</Text>
				<Text style={[styles.micro, { flex: 1 }]}>Item</Text>
			</View>
			{order.items.map((item, index) => (
				<View key={`${item.sku ?? item.name}-${index}`} style={styles.itemRow} wrap={false}>
					<Text style={styles.qty}>{`${item.quantity}×`}</Text>
					<View style={{ flex: 1 }}>
						<Text style={styles.itemName}>
							{item.voltage ? `${item.name} · ${item.voltage}` : item.name}
						</Text>
						{item.sku ? <Text style={styles.itemSku}>{item.sku}</Text> : null}
					</View>
				</View>
			))}
		</View>
	);
}

function AddressColumn({
	barcode,
	order,
}: {
	barcode: string | undefined;
	order: ShippingDocOrder;
}) {
	const sender = senderInline(order.sender);
	const lines = labelRecipientLines(order.recipient);
	return (
		<View style={styles.colAddr}>
			<View style={styles.senderBox}>
				<Text style={styles.micro}>Remetente</Text>
				<Text style={styles.senderName}>
					{order.sender.name ? `EMACH · ${order.sender.name}` : "EMACH"}
				</Text>
				{sender ? <Text style={styles.senderAddr}>{sender}</Text> : null}
			</View>
			<View style={styles.destBox}>
				<Text style={styles.destBand}>Destinatário</Text>
				<View style={styles.destBody}>
					<Text style={styles.destName}>{order.recipient.name ?? "—"}</Text>
					{lines.street ? <Text style={styles.addrLine}>{lines.street}</Text> : null}
					{lines.locality || lines.cep ? (
						<Text style={styles.addrLine}>
							{lines.locality}
							{lines.locality && lines.cep ? " · " : ""}
							{lines.cep ? <Text style={styles.cepInline}>{`CEP ${lines.cep}`}</Text> : null}
						</Text>
					) : null}
					{lines.cep && barcode ? (
						<View style={styles.cepBlock}>
							<Text style={styles.cepOver}>{lines.cep}</Text>
							{/* biome-ignore lint/performance/noImgElement: Image do react-pdf, não DOM */}
							<Image src={barcode} style={styles.cepBarcode} />
						</View>
					) : null}
				</View>
			</View>
		</View>
	);
}

function Label({
	barcode,
	order,
}: {
	barcode: string | undefined;
	order: ShippingDocOrder;
}) {
	return (
		<>
			<View style={styles.head}>
				<Text style={styles.docTitle}>ETIQUETA DE ENVIO</Text>
				<Text style={styles.orderNum}>{order.number}</Text>
			</View>
			<View style={styles.rule} />
			<View style={styles.cols}>
				<ItemsColumn order={order} />
				<AddressColumn barcode={barcode} order={order} />
			</View>
		</>
	);
}

function CutLine() {
	return (
		<View style={styles.cutRow}>
			<View style={styles.cutLine} />
			<Text style={styles.cutLabel}>CORTE AQUI</Text>
			<View style={styles.cutLine} />
		</View>
	);
}

function SheetPage({
	cepBarcodes,
	sheet,
}: {
	cepBarcodes: Record<string, string>;
	sheet: LabelSheet;
}) {
	if (sheet.kind === "full") {
		return (
			<Page size="A4" style={styles.page}>
				<Label barcode={cepBarcodes[sheet.order.id]} order={sheet.order} />
			</Page>
		);
	}
	return (
		<Page size="A4" style={styles.page}>
			<View style={[styles.half, styles.halfTop]}>
				<Label barcode={cepBarcodes[sheet.top.id]} order={sheet.top} />
			</View>
			<CutLine />
			<View style={[styles.half, styles.halfBottom]}>
				{sheet.bottom ? (
					<Label barcode={cepBarcodes[sheet.bottom.id]} order={sheet.bottom} />
				) : null}
			</View>
		</Page>
	);
}

export interface ShippingDocDocumentProps {
	cepBarcodes: Record<string, string>;
	orders: ShippingDocOrder[];
}

/**
 * Etiqueta de envio (spec 2026-08-05): A4 retrato com DUAS etiquetas por folha
 * (linha de corte no meio); pedido com mais de MAX_ITEMS_PER_HALF itens ganha
 * folha exclusiva. Sem valores (DANFE acompanha a caixa), sem barcode de
 * rastreio (postagem no balcão) — o barcode é o CEP, padrão de triagem.
 */
export function ShippingDocDocument({
	cepBarcodes,
	orders,
}: ShippingDocDocumentProps) {
	const sheets = paginateLabels(orders);
	return (
		<Document title="Etiqueta de envio">
			{sheets.map((sheet) => (
				<SheetPage
					cepBarcodes={cepBarcodes}
					key={sheet.kind === "full" ? sheet.order.id : sheet.top.id}
					sheet={sheet}
				/>
			))}
		</Document>
	);
}

/** 200 com documento vazio: não vaza existência de pedidos fora do escopo (spec #319). */
export function EmptyShippingDocDocument() {
	return (
		<Document title="Etiqueta de envio">
			<Page size="A4" style={styles.page}>
				<View style={styles.emptyWrap}>
					<Text style={styles.emptyText}>Nenhum pedido no escopo deste documento.</Text>
				</View>
			</Page>
		</Document>
	);
}
```

Notas de implementação:
- Se `borderTopStyle: "dashed"` não renderizar no react-pdf da versão do repo,
  fallback: `borderTopWidth: 1, borderTopColor: "#b3ada3"` sólido — conferir
  no PDF do smoke (Task 6).
- O comentário biome-ignore no `<Image>` só é necessário se o lint acusar
  `noImgElement` (é componente do react-pdf, não `<img>` DOM) — remover se não
  acusar.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/shipping-doc/_lib/__tests__/document.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Gate + commit**

Run: `bun check-types && bun check && bun --cwd apps/web test src/app/dashboard/orders/shipping-doc`
Expected: tudo verde (route.ts ainda passa `generatedAt`/`operatorName`? NÃO — route quebra o check-types aqui se as props mudaram. Se quebrar, seguir DIRETO para a Task 6 e commitar as duas juntas; alternativa aceita: um único commit ao fim da Task 6.)

```bash
git add apps/web/src/app/dashboard/orders/shipping-doc/_lib/shipping-doc.tsx apps/web/src/app/dashboard/orders/shipping-doc/_lib/__tests__/document.test.tsx
git commit -m "feat: etiqueta de envio 2 por folha com barcode"
```

---

### Task 6: Route — barcode async + integração

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/shipping-doc/route.ts`

**Interfaces:**
- Consumes: `cepBarcodeDataUri` (Task 2), `ShippingDocDocument`/`EmptyShippingDocDocument` novos (Task 5).
- Produces: endpoint final (sem consumidores de código).

- [ ] **Step 1: Atualizar o GET**

Substituir o miolo (imports: adicionar `cepBarcodeDataUri`; remover `operatorName`):

```ts
			registerPdfFonts();
			const generatedAt = new Date();

			const barcodeEntries = await Promise.all(
				orders.map(async (o) => {
					const uri = await cepBarcodeDataUri(o.recipient.zipCode);
					return uri ? ([o.id, uri] as const) : null;
				})
			);
			const cepBarcodes = Object.fromEntries(
				barcodeEntries.filter((e): e is readonly [string, string] => e !== null)
			);

			const doc =
				orders.length === 0
					? createElement(EmptyShippingDocDocument)
					: createElement(ShippingDocDocument, { cepBarcodes, orders });
```

(`generatedAt` continua existindo só para o filename `etiqueta-envio-${generatedAt.getTime()}.pdf` da Task 1; `session` continua para o log.)

- [ ] **Step 2: Gate**

Run: `bun check-types && bun check && bun --cwd apps/web test src/app/dashboard/orders/shipping-doc`
Expected: verde.

- [ ] **Step 3: Smoke run-time (SQL + PDF real)**

Com `bun dev:web` rodando (porta da sessão), abrir logado:
- `/dashboard/orders/shipping-doc?ids=<id de 2 pedidos EM-TEST-91NN>` → 1 folha com 2 etiquetas, barcode presente, sem preços, título ETIQUETA DE ENVIO.
- `/dashboard/orders/shipping-doc?tab=picked` → os 5 EM-TEST em 3 folhas.
Expected: PDF renderiza; conferir dados reais (CEP 80050-450, SKUs, quantidades) contra o pedido.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/shipping-doc/route.ts
git commit -m "feat: route da etiqueta com barcode de cep"
```

---

### Task 7: Fluxo de rastreio — coluna de ação

**Files:**
- Create: `apps/web/src/app/dashboard/orders/[id]/_lib/tracking-card-state.ts`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/tracking-card.tsx`
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx`
- Test: `apps/web/src/app/dashboard/orders/[id]/_lib/__tests__/tracking-card-state.test.ts`

**Interfaces:**
- Consumes: `updateTrackingCode` (action existente, `orders/actions.ts:780`).
- Produces: `showTrackingCard(status: OrderStatus): boolean`; componente `TrackingCard({ canUpdateStatus, orderId, trackingCode })` (a visibilidade por status fica no caller, via `showTrackingCard`).

- [ ] **Step 1: Teste da lógica pura (falhando)**

`__tests__/tracking-card-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { showTrackingCard } from "../tracking-card-state";

describe("showTrackingCard", () => {
	it("aparece pós-envio", () => {
		expect(showTrackingCard("shipped")).toBe(true);
		expect(showTrackingCard("delivered")).toBe(true);
	});
	it("não aparece antes do envio nem em exceção", () => {
		for (const s of [
			"pending_payment",
			"paid",
			"preparing",
			"canceled",
			"refunded",
			"returned",
			"payment_failed",
		] as const) {
			expect(showTrackingCard(s)).toBe(false);
		}
	});
});
```

Run: `bun --cwd apps/web test src/app/dashboard/orders/\[id\]/_lib/__tests__/tracking-card-state.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar a lógica pura**

`_lib/tracking-card-state.ts`:

```ts
import type { OrderStatus } from "@emach/db/schema/orders";

/**
 * Card Rastreio só existe pós-envio (spec D3): a operação posta no balcão e o
 * código chega depois. Estados de exceção (canceled/refunded/returned) não
 * rastreiam.
 */
export function showTrackingCard(status: OrderStatus): boolean {
	return status === "shipped" || status === "delivered";
}
```

Run: mesmo comando do Step 1. Expected: PASS.

- [ ] **Step 3: Criar o TrackingCard**

`_components/tracking-card.tsx`:

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import { TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_BADGE_CAPS } from "@/components/status-visual";
import { notify } from "@/lib/notify";
import { updateTrackingCode } from "../../actions";

interface TrackingCardProps {
	canUpdateStatus: boolean;
	orderId: string;
	trackingCode: string | null;
}

/**
 * Rastreio pós-envio (spec D3): a operação posta no balcão dos Correios e o
 * código chega DEPOIS do "Marcar como Enviado". Sem código → pendente (warning)
 * com input direto; com código → leitura + "Corrigir". Auditado via
 * tracking_set (updateTrackingCode).
 */
export function TrackingCard({
	canUpdateStatus,
	orderId,
	trackingCode,
}: TrackingCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(trackingCode ?? "");
	const hasCode = Boolean(trackingCode);
	const showInput = !hasCode || editing;

	function handleSave() {
		const code = draft.trim();
		if (!code) {
			notify.error("Informe um código de rastreio");
			return;
		}
		startTransition(async () => {
			const result = await updateTrackingCode({ orderId, trackingCode: code });
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			notify.success("Rastreio atualizado");
			setEditing(false);
			router.refresh();
		});
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Rastreio</CardTitle>
				{!hasCode && (
					<Badge className={STATUS_BADGE_CAPS} variant="warning">
						<TriangleAlertIcon aria-hidden />
						Pendente
					</Badge>
				)}
			</CardHeader>
			<CardContent className="space-y-3">
				{!hasCode && (
					<p className="text-muted-foreground text-xs">
						Pedido despachado sem código de rastreio. Registre assim que os
						Correios devolverem o comprovante.
					</p>
				)}
				{showInput && canUpdateStatus ? (
					<div className="flex gap-2">
						<Input
							onChange={(event) => setDraft(event.target.value)}
							placeholder="Ex: NL123456789BR"
							value={draft}
						/>
						<Button
							disabled={isPending || !draft.trim()}
							onClick={handleSave}
							variant="secondary"
						>
							{isPending ? (
								<>
									<Spinner /> Salvando…
								</>
							) : (
								"Salvar"
							)}
						</Button>
						{editing && (
							<Button
								disabled={isPending}
								onClick={() => {
									setEditing(false);
									setDraft(trackingCode ?? "");
								}}
								variant="ghost"
							>
								Cancelar
							</Button>
						)}
					</div>
				) : (
					<div className="flex items-center justify-between gap-2">
						<span className="font-mono text-sm">{trackingCode}</span>
						{canUpdateStatus && (
							<Button
								onClick={() => setEditing(true)}
								size="sm"
								variant="ghost"
							>
								Corrigir
							</Button>
						)}
					</div>
				)}
				{!(showInput || canUpdateStatus) && null}
			</CardContent>
		</Card>
	);
}
```

Nota: quando `!canUpdateStatus` e sem código, o card mostra só o texto de
pendência (input escondido) — leitura para quem não tem a capability.

- [ ] **Step 4: Atualizar OrderActionColumn**

Em `order-action-column.tsx`:

1. Remover `runTrackingUpdate` (função helper), `handleTrackingUpdate`, a prop
   `onTrackingUpdate` de `PrimaryActionContentProps`/`PrimaryActionContent` e o
   import de `updateTrackingCode`.
2. No bloco `order.status === "preparing"` do `PrimaryActionContent`, substituir
   o `<div className="flex gap-2">` (Input + Botão Salvar) por:

```tsx
				{order.status === "preparing" && (
					<div className="space-y-1">
						<label
							className="text-muted-foreground text-xs"
							htmlFor="tracking-code"
						>
							Código de rastreio · opcional
						</label>
						<Input
							id="tracking-code"
							onChange={(event) => setTrackingCode(event.target.value)}
							placeholder="Ex: NL123456789BR"
							value={trackingCode}
						/>
						<p className="text-muted-foreground text-xs">
							Sem código? Envia assim mesmo e registra depois.
						</p>
					</div>
				)}
```

3. Inserir o card entre `<PickingStatusCard …/>` e o card "Próxima ação":

```tsx
			{/* ── Rastreio (pós-envio) ── */}
			{showTrackingCard(order.status) && (
				<TrackingCard
					canUpdateStatus={canUpdateStatus}
					orderId={order.id}
					trackingCode={order.shippingTrackingCode}
				/>
			)}
```

com imports (de `_components/` para `_lib/` irmão é um nível):

```tsx
import { showTrackingCard } from "../_lib/tracking-card-state";
import { TrackingCard } from "./tracking-card";
```

4. `OrderDetail` já expõe `shippingTrackingCode`? Conferir em `orders/data.ts`
   (tipo `OrderDetail`). Se o campo não existir no tipo, adicioná-lo ao select
   do detail (ele existe na tabela; o input atual já usa
   `order.shippingTrackingCode` na linha 380 — então existe; nada a fazer).

- [ ] **Step 5: Gate completo**

Run: `bun check-types && bun check && bun --cwd apps/web test src/app/dashboard/orders`
Expected: verde (inclui ship-gating e bulk existentes).

- [ ] **Step 6: Smoke visual (3 estados)**

Com dev server logado:
1. Pedido `preparing` picked (EM-TEST-91NN): campo "Código de rastreio · opcional" sem botão Salvar; "Marcar como Enviado" presente.
2. Marcar um EM-TEST como Enviado SEM código → card "Rastreio · Pendente" aparece com input; salvar um código nele → vira leitura com "Corrigir"; timeline mostra o evento de rastreio.
3. Conferir que em `paid` o card Rastreio NÃO aparece.
(Reverter depois? Não — os pedidos são de teste, o estado shipped é aceitável; o unseed apaga tudo.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/\[id\]/_lib/tracking-card-state.ts apps/web/src/app/dashboard/orders/\[id\]/_lib/__tests__/tracking-card-state.test.ts apps/web/src/app/dashboard/orders/\[id\]/_components/tracking-card.tsx apps/web/src/app/dashboard/orders/\[id\]/_components/order-action-column.tsx
git commit -m "feat: rastreio opcional no envio e editável depois"
```

---

### Task 8: Gate final integrado

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa + lint + types**

Run: `bun verify`
Expected: verde (check-types && check && test).

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: verde — gate obrigatório do repo para mudanças em área de server actions/rotas.

- [ ] **Step 3: Prova perceptual final**

- PDF `?tab=picked` aberto no browser: screenshot lado a lado com o mockup
  aprovado (`.superpowers/brainstorm/2497307-1785954471/content/etiqueta-final.html`).
- Coluna de ação nos 3 estados: screenshots.
- Dados: conferir na etiqueta do EM-TEST-9105 os 4 itens/5 un., CEP 80050-450 e
  remetente da filial contra o banco.

- [ ] **Step 4: Reportar**

Reportar ao dono com as evidências (funcional + perceptual + dados). Nenhum
push sem pedido explícito.

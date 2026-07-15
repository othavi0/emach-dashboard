# Lista de Separação em PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar picking list em PDF (coleta consolidada + conferência por pedido agrupada por transportadora) nos dois disparos — pós-bulk em Pedidos e na fila de Separação — mais rename "Separado"→"Pronto para enviar" e 2 fixes do fluxo de picking.

**Architecture:** Lógica pura de agrupamento em `_lib` testada isoladamente; documento declarativo via `@react-pdf/renderer` renderizado server-side num route handler GET (padrão `customers/export/route.ts`) com capability + branch-scoping fail-closed; UI pluga por `window.open` + toast fallback e pelo kit bulk existente.

**Tech Stack:** Next 16 App Router, React 19, `@react-pdf/renderer@^4.5`, Drizzle raw SQL, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-07-15-picking-list-pdf-design.md` (decisões 1-13).

## Global Constraints

- ⛔ **Supabase é ÚNICO e COMPARTILHADO (dev = prod = ecommerce). NUNCA rodar seed/truncate/drop/db:push/reset.** Nenhuma task deste plano toca schema.
- CWD é a RAIZ do monorepo (turbo/bun) — nunca `cd apps/web`; usar `--cwd` ou paths absolutos.
- Proibido: `console.*` (usar `logger` de `@/lib/logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo), barrel files.
- Toasts sempre via `notify` (`@/lib/notify`), nunca `toast.*` direto.
- Datas de exibição sempre via `src/lib/format/datetime.ts` (fuso fixo América/São Paulo).
- Server actions/handlers: catch com `logger.error` + mensagem amigável; erro Pg via `getPgError`; nunca vazar `error.message` de banco.
- Commits: Conventional Commits em PT, subject ≤50 chars, **zero atribuição de AI**.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com `string not found`, re-Read o arquivo.
- Labels de UI em PT-BR.
- Após `git pull`/retorno de outro agente, Reads anteriores estão mortos — re-Read antes de Edit.

---

### Task 1: Lógica pura do picking list

**Files:**
- Create: `apps/web/src/app/dashboard/orders/picking-list/_lib/picking-list-logic.ts`
- Test: `apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/picking-list-logic.test.ts`

**Interfaces:**
- Consumes: `formatDayTime` de `@/lib/format/datetime`.
- Produces (Tasks 2-3 dependem): tipos `PickingListItem`, `PickingListOrder`, `CollectLine`, `CarrierGroup`, `PickingListStats`; funções `consolidateItems(orders): CollectLine[]`, `groupByCarrier(orders): CarrierGroup[]`, `shouldIncludeCollect(orders): boolean`, `pickingListStats(orders): PickingListStats`, `batchLabel(now: Date): string`; const `NO_CARRIER_LABEL`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/picking-list-logic.test.ts
import { describe, expect, it } from "vitest";
import {
	batchLabel,
	consolidateItems,
	groupByCarrier,
	NO_CARRIER_LABEL,
	type PickingListOrder,
	pickingListStats,
	shouldIncludeCollect,
} from "../picking-list-logic";

function order(partial: Partial<PickingListOrder>): PickingListOrder {
	return {
		city: "Curitiba",
		clientName: "Cliente Teste",
		id: crypto.randomUUID(),
		items: [],
		number: "#EM-2026-0001",
		shippingMethod: "Correios · SEDEX",
		state: "PR",
		...partial,
	};
}

const LIXADEIRA = {
	barcode: "7891234567890",
	model: "MLP750",
	name: "Lixadeira Telescópica 750W MLP750",
	quantity: 1,
	sku: "750LED-127",
	variantId: "var-lixadeira",
	voltage: "127V",
};

const BALDE = {
	barcode: null,
	model: null,
	name: "Balde Caçamba 50L Menegotti",
	quantity: 1,
	sku: "BALDE50L",
	variantId: "var-balde",
	voltage: null,
};

describe("consolidateItems", () => {
	it("soma quantidades da mesma variante e conta pedidos distintos", () => {
		const orders = [
			order({ items: [{ ...LIXADEIRA, quantity: 1 }] }),
			order({ items: [{ ...LIXADEIRA, quantity: 2 }, BALDE] }),
		];
		const lines = consolidateItems(orders);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			name: LIXADEIRA.name,
			orderCount: 2,
			totalQty: 3,
		});
		expect(lines[1]).toMatchObject({ name: BALDE.name, totalQty: 1 });
	});

	it("cai pra sku e depois name quando variantId é null", () => {
		const semVariante = { ...BALDE, variantId: null };
		const orders = [
			order({ items: [semVariante] }),
			order({ items: [{ ...semVariante, quantity: 3 }] }),
		];
		const lines = consolidateItems(orders);
		expect(lines).toHaveLength(1);
		expect(lines[0]?.totalQty).toBe(4);
	});

	it("ordena por totalQty desc e desempata por nome asc", () => {
		const orders = [
			order({ items: [BALDE, { ...LIXADEIRA, quantity: 5 }] }),
		];
		const lines = consolidateItems(orders);
		expect(lines.map((l) => l.name)).toEqual([LIXADEIRA.name, BALDE.name]);
	});
});

describe("groupByCarrier", () => {
	it("agrupa por shippingMethod, A→Z, null por último com label fixo", () => {
		const orders = [
			order({ number: "#3", shippingMethod: null }),
			order({ number: "#1", shippingMethod: "Jadlog .Package" }),
			order({ number: "#2", shippingMethod: "Correios · SEDEX" }),
		];
		const groups = groupByCarrier(orders);
		expect(groups.map((g) => g.label)).toEqual([
			"Correios · SEDEX",
			"Jadlog .Package",
			NO_CARRIER_LABEL,
		]);
		expect(groups[2]?.carrier).toBeNull();
	});

	it("ordena pedidos dentro do grupo por number asc", () => {
		const orders = [
			order({ number: "#EM-2026-0009" }),
			order({ number: "#EM-2026-0002" }),
		];
		const [group] = groupByCarrier(orders);
		expect(group?.orders.map((o) => o.number)).toEqual([
			"#EM-2026-0002",
			"#EM-2026-0009",
		]);
	});
});

describe("shouldIncludeCollect (regra adaptativa, decisão 6)", () => {
	it("1 pedido → sem seção de coleta", () => {
		expect(shouldIncludeCollect([order({})])).toBe(false);
	});
	it("2+ pedidos → com seção de coleta", () => {
		expect(shouldIncludeCollect([order({}), order({})])).toBe(true);
	});
});

describe("pickingListStats", () => {
	it("conta pedidos, unidades, SKUs distintos e transportadoras distintas", () => {
		const orders = [
			order({ items: [{ ...LIXADEIRA, quantity: 2 }] }),
			order({
				items: [LIXADEIRA, BALDE],
				shippingMethod: "Jadlog .Package",
			}),
		];
		expect(pickingListStats(orders)).toEqual({
			carriers: 2,
			orders: 2,
			skus: 2,
			units: 4,
		});
	});
});

describe("batchLabel", () => {
	it("gera L-ddMM-HHmm no fuso de São Paulo", () => {
		// 2026-07-15T17:32:00Z = 14:32 em São Paulo (UTC-3)
		expect(batchLabel(new Date("2026-07-15T17:32:00Z"))).toBe("L-1507-1432");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test picking-list-logic`
Expected: FAIL — `Cannot find module '../picking-list-logic'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/picking-list-logic.ts
import { formatDayTime } from "@/lib/format/datetime";

export interface PickingListItem {
	barcode: string | null;
	model: string | null;
	name: string;
	quantity: number;
	sku: string | null;
	variantId: string | null;
	voltage: string | null;
}

export interface PickingListOrder {
	city: string | null;
	clientName: string;
	id: string;
	items: PickingListItem[];
	number: string;
	shippingMethod: string | null;
	state: string | null;
}

export interface CollectLine {
	barcode: string | null;
	model: string | null;
	name: string;
	orderCount: number;
	sku: string | null;
	totalQty: number;
	voltage: string | null;
}

export interface CarrierGroup {
	carrier: string | null;
	label: string;
	orders: PickingListOrder[];
}

export interface PickingListStats {
	carriers: number;
	orders: number;
	skus: number;
	units: number;
}

export const NO_CARRIER_LABEL = "Sem transportadora definida";

function lineKey(item: PickingListItem): string {
	return item.variantId ?? item.sku ?? item.name;
}

/** Coleta consolidada: itens iguais somados, uma passada no estoque (spec, decisão 4). */
export function consolidateItems(orders: PickingListOrder[]): CollectLine[] {
	const byKey = new Map<string, CollectLine & { orderIds: Set<string> }>();
	for (const o of orders) {
		for (const item of o.items) {
			const key = lineKey(item);
			const existing = byKey.get(key);
			if (existing) {
				existing.totalQty += item.quantity;
				existing.orderIds.add(o.id);
			} else {
				byKey.set(key, {
					barcode: item.barcode,
					model: item.model,
					name: item.name,
					orderCount: 0,
					orderIds: new Set([o.id]),
					sku: item.sku,
					totalQty: item.quantity,
					voltage: item.voltage,
				});
			}
		}
	}
	return Array.from(byKey.values())
		.map(({ orderIds, ...line }) => ({ ...line, orderCount: orderIds.size }))
		.sort(
			(a, b) => b.totalQty - a.totalQty || a.name.localeCompare(b.name, "pt-BR")
		);
}

/** Conferência agrupada por transportadora; sem transportadora vai pro fim (spec §edge cases). */
export function groupByCarrier(orders: PickingListOrder[]): CarrierGroup[] {
	const byCarrier = new Map<string | null, PickingListOrder[]>();
	for (const o of orders) {
		const key = o.shippingMethod;
		const group = byCarrier.get(key);
		if (group) {
			group.push(o);
		} else {
			byCarrier.set(key, [o]);
		}
	}
	const groups: CarrierGroup[] = Array.from(byCarrier.entries()).map(
		([carrier, groupOrders]) => ({
			carrier,
			label: carrier ?? NO_CARRIER_LABEL,
			orders: [...groupOrders].sort((a, b) =>
				a.number.localeCompare(b.number, "pt-BR")
			),
		})
	);
	return groups.sort((a, b) => {
		if (a.carrier === null) {
			return 1;
		}
		if (b.carrier === null) {
			return -1;
		}
		return a.label.localeCompare(b.label, "pt-BR");
	});
}

/** Documento adaptativo (decisão 6): coleta só agrega valor com 2+ pedidos. */
export function shouldIncludeCollect(orders: PickingListOrder[]): boolean {
	return orders.length >= 2;
}

export function pickingListStats(orders: PickingListOrder[]): PickingListStats {
	const skus = new Set<string>();
	const carriers = new Set<string | null>();
	let units = 0;
	for (const o of orders) {
		carriers.add(o.shippingMethod);
		for (const item of o.items) {
			units += item.quantity;
			skus.add(lineKey(item));
		}
	}
	return { carriers: carriers.size, orders: orders.length, skus: skus.size, units };
}

/** Identificador efêmero de lote (decisão 11): distingue folhas no galpão sem persistir entidade. */
export function batchLabel(now: Date): string {
	// formatDayTime: "15/07 14:32" (fuso America/Sao_Paulo)
	const [dayMonth, hourMinute] = formatDayTime(now).split(" ");
	return `L-${dayMonth?.replace("/", "")}-${hourMinute?.replace(":", "")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test picking-list-logic`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/picking-list
git commit -m "feat: lógica pura do picking list"
```

---

### Task 2: Dependência, fontes e documento PDF

**Files:**
- Modify: `apps/web/package.json` (via `bun add`)
- Create: `apps/web/public/fonts/pdf/*.ttf` (7 arquivos)
- Create: `apps/web/src/app/dashboard/orders/picking-list/_lib/fonts.ts`
- Create: `apps/web/src/app/dashboard/orders/picking-list/_lib/document.tsx`
- Modify: `apps/web/next.config.ts` (outputFileTracingIncludes)
- Test: `apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/document.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`PickingListOrder`, `consolidateItems`, `groupByCarrier`, `shouldIncludeCollect`, `pickingListStats`, `NO_CARRIER_LABEL`).
- Produces (Task 3 depende): `PickingListDocument({ orders, batch, branchName, generatedAt, operatorName }): JSX` e `EmptyPickingListDocument({ batch }): JSX` de `_lib/document.tsx`; `registerPdfFonts()` de `_lib/fonts.ts`.

- [ ] **Step 1: Instalar a dependência**

```bash
bun add --cwd apps/web '@react-pdf/renderer@^4.5.1'
```

Expected: instala sem erro. Se o bun bloquear postinstall (ex: `yoga-layout`), adicionar a entrada reportada em `allowScripts` no `package.json` da raiz e rodar `bun install` de novo.

- [ ] **Step 2: Baixar as fontes TTF (OFL, repo google/fonts)**

```bash
mkdir -p apps/web/public/fonts/pdf
BASE=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -fLo apps/web/public/fonts/pdf/Barlow-Regular.ttf "$BASE/barlow/Barlow-Regular.ttf"
curl -fLo apps/web/public/fonts/pdf/Barlow-Medium.ttf "$BASE/barlow/Barlow-Medium.ttf"
curl -fLo apps/web/public/fonts/pdf/Barlow-SemiBold.ttf "$BASE/barlow/Barlow-SemiBold.ttf"
curl -fLo apps/web/public/fonts/pdf/BarlowCondensed-SemiBold.ttf "$BASE/barlowcondensed/BarlowCondensed-SemiBold.ttf"
curl -fLo apps/web/public/fonts/pdf/BarlowCondensed-Bold.ttf "$BASE/barlowcondensed/BarlowCondensed-Bold.ttf"
curl -fLo apps/web/public/fonts/pdf/IBMPlexMono-Regular.ttf "$BASE/ibmplexmono/IBMPlexMono-Regular.ttf"
curl -fLo apps/web/public/fonts/pdf/IBMPlexMono-SemiBold.ttf "$BASE/ibmplexmono/IBMPlexMono-SemiBold.ttf"
file apps/web/public/fonts/pdf/*.ttf
```

Expected: cada arquivo reporta `TrueType Font data`. Se algum 404 (repo reorganizado), baixar a família em <https://fonts.google.com/> e extrair os mesmos pesos estáticos.

- [ ] **Step 3: Registro de fontes**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/fonts.ts
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

const FONTS_DIR = path.join(process.cwd(), "public/fonts/pdf");

/** Idempotente: Font.register global do react-pdf, chamado uma vez por processo. */
export function registerPdfFonts(): void {
	if (registered) {
		return;
	}
	registered = true;
	Font.register({
		family: "Barlow",
		fonts: [
			{ src: path.join(FONTS_DIR, "Barlow-Regular.ttf"), fontWeight: 400 },
			{ src: path.join(FONTS_DIR, "Barlow-Medium.ttf"), fontWeight: 500 },
			{ src: path.join(FONTS_DIR, "Barlow-SemiBold.ttf"), fontWeight: 600 },
		],
	});
	Font.register({
		family: "Barlow Condensed",
		fonts: [
			{
				src: path.join(FONTS_DIR, "BarlowCondensed-SemiBold.ttf"),
				fontWeight: 600,
			},
			{ src: path.join(FONTS_DIR, "BarlowCondensed-Bold.ttf"), fontWeight: 700 },
		],
	});
	Font.register({
		family: "IBM Plex Mono",
		fonts: [
			{ src: path.join(FONTS_DIR, "IBMPlexMono-Regular.ttf"), fontWeight: 400 },
			{ src: path.join(FONTS_DIR, "IBMPlexMono-SemiBold.ttf"), fontWeight: 600 },
		],
	});
	// Desliga hifenização (nomes de produto quebrados por hífen leem mal em picking list).
	Font.registerHyphenationCallback((word) => [word]);
}
```

- [ ] **Step 4: Documento PDF (layout = mockup v2 aprovado)**

```tsx
// apps/web/src/app/dashboard/orders/picking-list/_lib/document.tsx
import {
	Document,
	G,
	Page,
	Path,
	StyleSheet,
	Svg,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatDateTime } from "@/lib/format/datetime";
import {
	type CarrierGroup,
	type CollectLine,
	consolidateItems,
	groupByCarrier,
	type PickingListOrder,
	pickingListStats,
	shouldIncludeCollect,
} from "./picking-list-logic";

const INK = "#1c1a17";
const GRAY = "#4a463f";
const LIGHT = "#8a857c";
const HAIRLINE = "#e2ddd6";
const BAND = "#eeece8";

const styles = StyleSheet.create({
	page: {
		color: INK,
		fontFamily: "Barlow",
		fontSize: 9,
		paddingBottom: 52,
		paddingHorizontal: 40,
		paddingTop: 36,
	},
	// header: identidade | lote
	head: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
	docTitle: {
		fontFamily: "Barlow Condensed",
		fontSize: 17,
		fontWeight: 700,
		letterSpacing: 0.8,
		marginTop: 7,
	},
	loteBox: {
		alignItems: "center",
		borderColor: INK,
		borderRadius: 3,
		borderWidth: 1.2,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	loteLabel: { color: LIGHT, fontSize: 5.5, fontWeight: 600, letterSpacing: 1.4 },
	loteNum: { fontFamily: "IBM Plex Mono", fontSize: 10.5, fontWeight: 600, marginTop: 1 },
	// faixa de contexto
	context: {
		borderBottomColor: HAIRLINE,
		borderBottomWidth: 0.8,
		borderTopColor: INK,
		borderTopWidth: 2,
		flexDirection: "row",
		gap: 26,
		marginTop: 12,
		paddingVertical: 8,
	},
	ctxLabel: { color: LIGHT, fontSize: 5.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" },
	ctxValue: { fontSize: 9, fontWeight: 500, marginTop: 2 },
	// stat row
	stats: { borderBottomColor: HAIRLINE, borderBottomWidth: 0.8, flexDirection: "row" },
	stat: {
		alignItems: "center",
		borderRightColor: "#eceae6",
		borderRightWidth: 0.8,
		flex: 1,
		paddingVertical: 9,
	},
	statLast: { borderRightWidth: 0 },
	statNum: { fontFamily: "Barlow Condensed", fontSize: 16, fontWeight: 700 },
	statLabel: { color: LIGHT, fontSize: 5.5, fontWeight: 600, letterSpacing: 1.1, marginTop: 3, textTransform: "uppercase" },
	// seções
	sectionLabel: {
		fontFamily: "Barlow Condensed",
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: 1,
		marginTop: 16,
	},
	sectionHint: { color: LIGHT, fontSize: 6.5, marginBottom: 4, marginTop: 1 },
	// coleta
	pickRow: {
		alignItems: "flex-start",
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.8,
		flexDirection: "row",
		gap: 10,
		paddingVertical: 8,
	},
	check: {
		borderColor: INK,
		borderRadius: 2,
		borderWidth: 1.2,
		height: 11,
		marginTop: 2,
		width: 11,
	},
	checkLg: { height: 13, width: 13 },
	qty: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
		textAlign: "center",
		width: 28,
	},
	pickInfo: { flex: 1 },
	pickName: { fontSize: 9, fontWeight: 600, lineHeight: 1.35 },
	pickSub: { color: GRAY, fontFamily: "IBM Plex Mono", fontSize: 7, marginTop: 3 },
	pickSide: { alignItems: "flex-end", gap: 3 },
	barcodeText: { color: GRAY, fontFamily: "IBM Plex Mono", fontSize: 6.5 },
	ordersRef: { color: LIGHT, fontSize: 6.5 },
	// conferência
	carrier: {
		alignItems: "center",
		backgroundColor: BAND,
		borderRadius: 2,
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 12,
		paddingHorizontal: 9,
		paddingVertical: 5,
	},
	carrierName: { fontFamily: "Barlow Condensed", fontSize: 10, fontWeight: 700, letterSpacing: 1 },
	carrierCount: { color: GRAY, fontSize: 6.5, fontWeight: 500 },
	orderBlock: {
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.8,
		flexDirection: "row",
		gap: 10,
		paddingVertical: 9,
	},
	orderBody: { flex: 1 },
	orderHead: { flexDirection: "row", justifyContent: "space-between" },
	orderNum: { fontFamily: "IBM Plex Mono", fontSize: 9, fontWeight: 600 },
	orderCity: { color: LIGHT, fontSize: 7 },
	orderClient: { color: GRAY, fontSize: 8, fontWeight: 500, marginTop: 2 },
	orderItems: {
		borderTopColor: "#ddd9d3",
		borderTopStyle: "dashed",
		borderTopWidth: 0.8,
		marginTop: 6,
		paddingTop: 5,
	},
	oItem: { flexDirection: "row", gap: 7, paddingVertical: 2 },
	oItemQty: { fontSize: 8, fontWeight: 700, width: 16 },
	oItemInfo: { flex: 1 },
	oItemName: { fontSize: 8, fontWeight: 500 },
	oItemSku: { color: GRAY, fontFamily: "IBM Plex Mono", fontSize: 6.5, marginTop: 1 },
	// rodapé
	foot: {
		borderTopColor: HAIRLINE,
		borderTopWidth: 0.8,
		bottom: 22,
		color: LIGHT,
		flexDirection: "row",
		fontSize: 6.5,
		justifyContent: "space-between",
		left: 40,
		paddingTop: 4,
		position: "absolute",
		right: 40,
	},
	emptyWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
	emptyText: { color: GRAY, fontSize: 11 },
});

/** Wordmark emach — paths de apps/web/public/emach-nome-branco.svg, fill em tinta. */
function Wordmark() {
	return (
		<Svg height={13} viewBox="0 0 2041 377" width={70}>
			<G transform="translate(0,377) scale(0.1,-0.1)">
				<Path d="M2167 3293 c-4 -3 -7 -638 -7 -1410 l0 -1403 1413 0 1412 0 -3 277 c-2 153 -6 280 -8 282 -2 3 -510 5 -1129 5 l-1125 1 0 292 0 293 1128 0 c621 0 1131 2 1133 4 2 2 3 131 1 285 l-3 281 -1129 0 -1130 0 0 265 0 265 1130 0 1130 0 0 285 0 285 -1403 0 c-772 0 -1407 -3 -1410 -7z" fill={INK} />
				<Path d="M9446 3293 c-8 -8 -7 -2779 1 -2800 4 -10 64 -13 279 -13 l274 0 0 575 0 575 854 0 853 0 -2 -562 c-1 -310 0 -569 2 -575 4 -10 69 -13 279 -13 l274 0 -2 1408 -3 1407 -1401 3 c-770 1 -1404 -1 -1408 -5z m2264 -812 c0 -137 -3 -256 -6 -265 -6 -14 -90 -16 -855 -16 l-849 0 0 265 0 265 855 0 855 0 0 -249z" fill={INK} />
				<Path d="M12488 3273 c-4 -22 -3 -1474 2 -2685 l0 -108 1410 0 1410 0 0 280 0 280 -252 2 c-139 1 -649 2 -1133 2 l-880 1 -1 842 -1 843 1131 2 1131 3 0 280 0 280 -1406 3 -1406 2 -5 -27z" fill={INK} />
				<Path d="M15557 3268 c-5 -37 -5 -2513 1 -2681 l3 -107 275 0 274 0 0 73 c1 39 0 298 0 575 l-1 502 851 0 850 0 0 -575 0 -575 275 0 275 0 0 1410 0 1410 -275 0 -275 0 -1 -77 c-1 -43 0 -291 1 -550 l1 -473 -850 0 -851 0 0 550 0 550 -274 0 -274 0 -5 -32z" fill={INK} />
				<Path d="M6898 3215 c-233 -44 -453 -185 -594 -380 -42 -57 -1196 -2364 -1189 -2375 14 -22 403 -29 544 -10 294 40 497 150 664 360 51 63 124 203 467 895 246 496 425 844 452 880 73 99 217 207 338 255 38 15 181 50 205 50 20 0 -9 29 -97 100 -121 94 -286 181 -403 211 -106 27 -284 33 -387 14z" fill={INK} />
				<Path d="M8380 3219 c-236 -36 -468 -177 -612 -371 -35 -49 -226 -421 -630 -1230 -318 -638 -576 -1164 -572 -1167 3 -3 130 -6 282 -6 293 0 361 8 507 57 200 68 369 207 478 393 41 70 373 732 642 1282 188 382 221 433 347 535 116 94 255 159 371 173 31 4 57 11 57 16 0 13 -138 117 -234 175 -105 63 -215 110 -305 130 -87 19 -250 25 -331 13z" fill={INK} />
				<Path d="M8552 1483 c-18 -9 -44 -30 -56 -47 -13 -17 -132 -246 -265 -508 l-242 -478 103 0 c57 0 310 -2 563 -5 253 -3 495 -1 537 3 l77 7 -90 170 c-50 94 -163 312 -251 485 -88 173 -168 324 -177 334 -23 27 -90 56 -131 56 -19 0 -50 -8 -68 -17z" fill={INK} />
			</G>
		</Svg>
	);
}

interface HeaderProps {
	batch: string;
	branchName: string | null;
	generatedAt: Date;
	operatorName: string;
	title: string;
}

function DocHeader({ batch, branchName, generatedAt, operatorName, title }: HeaderProps) {
	return (
		<>
			<View style={styles.head}>
				<View>
					<Wordmark />
					<Text style={styles.docTitle}>{title}</Text>
				</View>
				<View style={styles.loteBox}>
					<Text style={styles.loteLabel}>LOTE</Text>
					<Text style={styles.loteNum}>{batch}</Text>
				</View>
			</View>
			<View style={styles.context}>
				<View>
					<Text style={styles.ctxLabel}>Filial</Text>
					<Text style={styles.ctxValue}>{branchName ?? "—"}</Text>
				</View>
				<View>
					<Text style={styles.ctxLabel}>Emissão</Text>
					<Text style={styles.ctxValue}>{formatDateTime(generatedAt)}</Text>
				</View>
				<View>
					<Text style={styles.ctxLabel}>Operador</Text>
					<Text style={styles.ctxValue}>{operatorName}</Text>
				</View>
			</View>
		</>
	);
}

function DocFooter({ batch }: { batch: string }) {
	return (
		<View fixed style={styles.foot}>
			<Text>{`emach dashboard · Lote ${batch}`}</Text>
			<Text
				render={({ pageNumber, totalPages }) =>
					`página ${pageNumber} de ${totalPages}`
				}
			/>
		</View>
	);
}

function itemMeta(item: { model: string | null; sku: string | null; voltage: string | null }): string {
	return [item.sku, item.voltage, item.model].filter(Boolean).join(" · ");
}

function CollectSection({ lines }: { lines: CollectLine[] }) {
	return (
		<>
			<Text style={styles.sectionLabel}>COLETA CONSOLIDADA</Text>
			<Text style={styles.sectionHint}>
				Itens iguais agrupados — uma passada no estoque
			</Text>
			{lines.map((line, i) => (
				<View
					key={`${line.sku ?? line.name}`}
					style={i === lines.length - 1 ? [styles.pickRow, { borderBottomWidth: 0 }] : styles.pickRow}
					wrap={false}
				>
					<View style={styles.check} />
					<Text style={styles.qty}>{`${line.totalQty}×`}</Text>
					<View style={styles.pickInfo}>
						<Text style={styles.pickName}>{line.name}</Text>
						{itemMeta(line) ? <Text style={styles.pickSub}>{itemMeta(line)}</Text> : null}
					</View>
					<View style={styles.pickSide}>
						{line.barcode ? <Text style={styles.barcodeText}>{line.barcode}</Text> : null}
						<Text style={styles.ordersRef}>
							{line.orderCount === 1 ? "1 pedido" : `${line.orderCount} pedidos`}
						</Text>
					</View>
				</View>
			))}
		</>
	);
}

function ConferenceSection({ groups }: { groups: CarrierGroup[] }) {
	return (
		<>
			{groups.map((group) => (
				<View key={group.label}>
					<View minPresenceAhead={60} style={styles.carrier}>
						<Text style={styles.carrierName}>{group.label.toUpperCase()}</Text>
						<Text style={styles.carrierCount}>
							{group.orders.length === 1 ? "1 pedido" : `${group.orders.length} pedidos`}
						</Text>
					</View>
					{group.orders.map((o) => (
						<View key={o.id} style={styles.orderBlock} wrap={false}>
							<View style={[styles.check, styles.checkLg]} />
							<View style={styles.orderBody}>
								<View style={styles.orderHead}>
									<Text style={styles.orderNum}>{o.number}</Text>
									{o.city ? (
										<Text style={styles.orderCity}>
											{o.state ? `${o.city}/${o.state}` : o.city}
										</Text>
									) : null}
								</View>
								<Text style={styles.orderClient}>{o.clientName}</Text>
								<View style={styles.orderItems}>
									{o.items.map((item) => (
										<View key={`${o.id}-${item.sku ?? item.name}`} style={styles.oItem}>
											<Text style={styles.oItemQty}>{`${item.quantity}×`}</Text>
											<View style={styles.oItemInfo}>
												<Text style={styles.oItemName}>{item.name}</Text>
												{itemMeta(item) ? (
													<Text style={styles.oItemSku}>{itemMeta(item)}</Text>
												) : null}
											</View>
										</View>
									))}
								</View>
							</View>
						</View>
					))}
				</View>
			))}
		</>
	);
}

export interface PickingListDocumentProps {
	batch: string;
	branchName: string | null;
	generatedAt: Date;
	operatorName: string;
	orders: PickingListOrder[];
}

/**
 * Lista de Separação (spec 2026-07-15): documento adaptativo — coleta
 * consolidada só com 2+ pedidos; conferência por pedido agrupada por
 * transportadora sempre. Fluxo contínuo, quebra de página natural.
 */
export function PickingListDocument({
	batch,
	branchName,
	generatedAt,
	operatorName,
	orders,
}: PickingListDocumentProps) {
	const stats = pickingListStats(orders);
	const withCollect = shouldIncludeCollect(orders);
	return (
		<Document title={`Lista de Separação ${batch}`}>
			<Page size="A4" style={styles.page}>
				<DocHeader
					batch={batch}
					branchName={branchName}
					generatedAt={generatedAt}
					operatorName={operatorName}
					title="LISTA DE SEPARAÇÃO"
				/>
				<View style={styles.stats}>
					<View style={styles.stat}>
						<Text style={styles.statNum}>{stats.orders}</Text>
						<Text style={styles.statLabel}>{stats.orders === 1 ? "Pedido" : "Pedidos"}</Text>
					</View>
					<View style={styles.stat}>
						<Text style={styles.statNum}>{stats.units}</Text>
						<Text style={styles.statLabel}>Unidades</Text>
					</View>
					<View style={withCollect ? styles.stat : [styles.stat, styles.statLast]}>
						<Text style={styles.statNum}>{stats.skus}</Text>
						<Text style={styles.statLabel}>SKUs</Text>
					</View>
					{withCollect ? (
						<View style={[styles.stat, styles.statLast]}>
							<Text style={styles.statNum}>{stats.carriers}</Text>
							<Text style={styles.statLabel}>Transportadoras</Text>
						</View>
					) : null}
				</View>
				{withCollect ? <CollectSection lines={consolidateItems(orders)} /> : null}
				{withCollect ? (
					<Text style={styles.sectionLabel}>CONFERÊNCIA POR PEDIDO</Text>
				) : null}
				<ConferenceSection groups={groupByCarrier(orders)} />
				<DocFooter batch={batch} />
			</Page>
		</Document>
	);
}

/** 200 com documento vazio: não vaza existência de pedidos fora do escopo (spec §edge cases). */
export function EmptyPickingListDocument({ batch }: { batch: string }) {
	return (
		<Document title={`Lista de Separação ${batch}`}>
			<Page size="A4" style={styles.page}>
				<View style={styles.emptyWrap}>
					<Text style={styles.emptyText}>Nenhum pedido no escopo desta lista.</Text>
				</View>
				<DocFooter batch={batch} />
			</Page>
		</Document>
	);
}
```

- [ ] **Step 5: Smoke test de render**

```tsx
// apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/document.test.tsx
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { registerPdfFonts } from "../fonts";
import { EmptyPickingListDocument, PickingListDocument } from "../document";
import type { PickingListOrder } from "../picking-list-logic";

const ORDERS: PickingListOrder[] = [
	{
		city: "Curitiba",
		clientName: "Marcos Vinícius Almeida",
		id: "o1",
		items: [
			{
				barcode: "7891234567890",
				model: "MLP750",
				name: "Lixadeira Telescópica Parede/Teto 750W MLP750 Menegotti",
				quantity: 1,
				sku: "750LED-127",
				variantId: "v1",
				voltage: "127V",
			},
		],
		number: "#EM-2026-0142",
		shippingMethod: "Correios · SEDEX",
		state: "PR",
	},
	{
		city: "Joinville",
		clientName: "Carlos Eduardo Ramos",
		id: "o2",
		items: [
			{
				barcode: null,
				model: null,
				name: "Balde Caçamba 50L Menegotti",
				quantity: 2,
				sku: "BALDE50L",
				variantId: "v2",
				voltage: null,
			},
		],
		number: "#EM-2026-0139",
		shippingMethod: null,
		state: "SC",
	},
];

describe("PickingListDocument", () => {
	it("renderiza PDF válido com 2 pedidos (com seção de coleta)", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<PickingListDocument
				batch="L-1507-1432"
				branchName="Curitiba"
				generatedAt={new Date("2026-07-15T17:32:00Z")}
				operatorName="Othavio"
				orders={ORDERS}
			/>
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(buf.length).toBeGreaterThan(2000);
	});

	it("renderiza documento vazio", async () => {
		registerPdfFonts();
		const buf = await renderToBuffer(
			<EmptyPickingListDocument batch="L-1507-1432" />
		);
		expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
	});
});
```

- [ ] **Step 6: Run test**

Run: `bun --cwd apps/web test document`
Expected: PASS. Se o `<G transform>` do wordmark falhar no render (limitação de transform do react-pdf), substituir `<Wordmark />` por `<Text style={{ fontFamily: "Barlow Condensed", fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>EMACH</Text>` e anotar no PR.

- [ ] **Step 7: Tracing das fontes no build**

Em `apps/web/next.config.ts`, adicionar ao objeto de config (topo do objeto, junto das outras chaves):

```ts
outputFileTracingIncludes: {
	"/dashboard/orders/picking-list": ["./public/fonts/pdf/**/*"],
},
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/public/fonts apps/web/src/app/dashboard/orders/picking-list apps/web/next.config.ts bun.lock
git commit -m "feat: documento PDF da lista de separação"
```

---

### Task 3: Route handler GET + query de dados

**Files:**
- Create: `apps/web/src/app/dashboard/orders/picking-list/_lib/resolve-params.ts`
- Create: `apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts`
- Create: `apps/web/src/app/dashboard/orders/picking-list/route.ts`
- Test: `apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2 (`PickingListOrder`, `PickingListDocument`, `EmptyPickingListDocument`, `registerPdfFonts`, `batchLabel`); `requireCapability` de `@/lib/permissions`; `getUserBranchScope`, `isBlindScope`, `orderBranchCondition` de `@/lib/branch-scope`; `isCapabilityError` de `@/lib/action-error`.
- Produces (Tasks 4-5 dependem): rota `GET /dashboard/orders/picking-list?ids=<csv>` e `?tab=a_separar|em_separacao` respondendo `application/pdf` inline.

- [ ] **Step 1: Write the failing test (resolve-params)**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts
import { describe, expect, it } from "vitest";
import { resolvePickingListParams } from "../resolve-params";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";

function sp(query: string): URLSearchParams {
	return new URL(`http://x/y?${query}`).searchParams;
}

describe("resolvePickingListParams", () => {
	it("modo ids: csv vira array deduplicado", () => {
		const r = resolvePickingListParams(sp(`ids=${UUID_A},${UUID_B},${UUID_A}`));
		expect(r).toEqual({ ok: true, params: { ids: [UUID_A, UUID_B], mode: "ids" } });
	});

	it("modo tab: aceita a_separar e em_separacao", () => {
		expect(resolvePickingListParams(sp("tab=a_separar"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "a_separar" },
		});
		expect(resolvePickingListParams(sp("tab=em_separacao"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "em_separacao" },
		});
	});

	it("rejeita: sem params, ids+tab juntos, tab inválida, id não-uuid", () => {
		expect(resolvePickingListParams(sp("")).ok).toBe(false);
		expect(resolvePickingListParams(sp(`ids=${UUID_A}&tab=a_separar`)).ok).toBe(false);
		expect(resolvePickingListParams(sp("tab=excecoes")).ok).toBe(false);
		expect(resolvePickingListParams(sp("ids=abc")).ok).toBe(false);
	});

	it("rejeita mais de 100 ids", () => {
		const many = Array.from({ length: 101 }, (_, i) =>
			`${i.toString(16).padStart(8, "0")}-58cc-4372-a567-0e02b2c3d479`
		).join(",");
		expect(resolvePickingListParams(sp(`ids=${many}`)).ok).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test resolve-params`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar resolve-params**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/resolve-params.ts
import { z } from "zod";

const MAX_IDS = 100; // mesmo teto do bulkStartSeparationSchema (orders/schema.ts)

const idSchema = z.string().uuid();

export type PickingListParams =
	| { ids: string[]; mode: "ids" }
	| { mode: "tab"; tab: "a_separar" | "em_separacao" };

export type ResolveResult =
	| { ok: true; params: PickingListParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) e `?tab=` (recorte da fila) são mutuamente exclusivos. */
export function resolvePickingListParams(sp: URLSearchParams): ResolveResult {
	const idsRaw = sp.get("ids");
	const tabRaw = sp.get("tab");

	if (idsRaw && tabRaw) {
		return { error: "Use ids OU tab, não ambos", ok: false };
	}
	if (idsRaw) {
		const ids = Array.from(
			new Set(idsRaw.split(",").map((s) => s.trim()).filter(Boolean))
		);
		if (ids.length === 0 || ids.length > MAX_IDS) {
			return { error: `ids deve ter entre 1 e ${MAX_IDS} itens`, ok: false };
		}
		if (!ids.every((id) => idSchema.safeParse(id).success)) {
			return { error: "ids contém valor inválido", ok: false };
		}
		return { ok: true, params: { ids, mode: "ids" } };
	}
	if (tabRaw) {
		if (tabRaw !== "a_separar" && tabRaw !== "em_separacao") {
			return { error: "tab inválida", ok: false };
		}
		return { ok: true, params: { mode: "tab", tab: tabRaw } };
	}
	return { error: "Informe ids ou tab", ok: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test resolve-params`
Expected: PASS (4 testes).

- [ ] **Step 5: Query de dados (server-only)**

```ts
// apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts
import "server-only";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";
import { type BranchScope, isBlindScope, orderBranchCondition } from "@/lib/branch-scope";
import type { PickingListItem, PickingListOrder } from "./picking-list-logic";
import type { PickingListParams } from "./resolve-params";

const MAX_ORDERS = 100;

interface Row {
	city: string | null;
	client_name: string;
	id: string;
	items: PickingListItem[] | null;
	number: string;
	shipping_method: string | null;
	state: string | null;
}

/**
 * Pedidos + itens completos para o PDF. Só etapas de separação
 * ('paid'/'preparing') entram — pedido enviado/cancelado não imprime.
 * Branch-scoping fail-closed: fora do escopo é excluído em silêncio (spec).
 */
export async function fetchPickingListOrders(
	params: PickingListParams,
	scope: BranchScope
): Promise<PickingListOrder[]> {
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const branchFragment = branchCond ? sql`AND ${branchCond}` : sql``;

	let modeFragment;
	if (params.mode === "ids") {
		const ph = sql.join(params.ids.map((id) => sql`${id}`), sql`, `);
		modeFragment = sql`o.id IN (${ph}) AND o.status IN ('paid', 'preparing')`;
	} else if (params.tab === "a_separar") {
		// Mesma condição da fila (separacao/data.ts, tab a_separar): sem sessão ativa.
		modeFragment = sql`o.status IN ('paid', 'preparing') AND (lp.status IS NULL OR lp.status = 'canceled')`;
	} else {
		// em_separacao: sessão in_progress existente (unique parcial garante ≤1).
		modeFragment = sql`o.status = 'preparing' AND lp.status = 'in_progress'`;
	}

	const result = await db.execute<Row>(sql`
		SELECT
			o.id,
			o.number,
			c.name AS client_name,
			o.shipping_method,
			o.shipping_address->>'city' AS city,
			o.shipping_address->>'state' AS state,
			li.items
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN LATERAL (
			SELECT op.status FROM order_picking op
			WHERE op.order_id = o.id
			ORDER BY op.started_at DESC, op.id DESC LIMIT 1
		) lp ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'variantId', oi.variant_id, 'sku', oi.sku, 'barcode', oi.barcode,
				'name', oi.name, 'model', oi.model, 'voltage', oi.voltage,
				'quantity', oi.quantity
			) ORDER BY oi.quantity DESC, oi.name ASC), '[]'::jsonb) AS items
			FROM order_item oi
			WHERE oi.order_id = o.id
		) li ON true
		WHERE ${modeFragment}
			${branchFragment}
		ORDER BY o.paid_at ASC, o.id ASC
		LIMIT ${MAX_ORDERS}
	`);

	return result.rows.map((r) => ({
		city: r.city,
		clientName: r.client_name,
		id: r.id,
		items: r.items ?? [],
		number: r.number,
		shippingMethod: r.shipping_method,
		state: r.state,
	}));
}
```

- [ ] **Step 6: Route handler**

```tsx
// apps/web/src/app/dashboard/orders/picking-list/route.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { isCapabilityError } from "@/lib/action-error";
import { getUserBranchScope } from "@/lib/branch-scope";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { fetchPickingListOrders } from "./_lib/data";
import { EmptyPickingListDocument, PickingListDocument } from "./_lib/document";
import { registerPdfFonts } from "./_lib/fonts";
import { batchLabel } from "./_lib/picking-list-logic";
import { resolvePickingListParams } from "./_lib/resolve-params";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
	try {
		const session = await requireCapability("orders.read");
		const resolved = resolvePickingListParams(new URL(req.url).searchParams);
		if (!resolved.ok) {
			return new Response(resolved.error, { status: 400 });
		}
		const scope = await getUserBranchScope(session);
		const orders = await fetchPickingListOrders(resolved.params, scope);

		registerPdfFonts();
		const generatedAt = new Date();
		const batch = batchLabel(generatedAt);
		// Filial do documento: única filial presente no conjunto, senão "—".
		// (order.branchId não vem na query; a filial exibida deriva do escopo
		// do lote — v1 mostra o nome só quando o operador é scoped a 1 filial.)
		const branchName = null;

		const doc =
			orders.length === 0 ? (
				<EmptyPickingListDocument batch={batch} />
			) : (
				<PickingListDocument
					batch={batch}
					branchName={branchName}
					generatedAt={generatedAt}
					operatorName={session.user.name ?? session.user.email ?? "—"}
					orders={orders}
				/>
			);

		const buffer = await renderToBuffer(doc);
		logger.info("picking_list.pdf", {
			userId: session.user.id,
			orders: orders.length,
			mode: resolved.params.mode,
		});
		return new Response(new Uint8Array(buffer), {
			headers: {
				"Cache-Control": "no-store",
				"Content-Disposition": `inline; filename="lista-separacao-${batch}.pdf"`,
				"Content-Type": "application/pdf",
			},
		});
	} catch (error) {
		if (isCapabilityError(error)) {
			return new Response("Sem permissão", { status: 403 });
		}
		logger.error("picking_list.pdf", error);
		return new Response("Erro ao gerar a lista de separação", { status: 500 });
	}
}
```

Nota sobre `branchName`: a v1 renderiza "—" na Filial do header quando o lote pode misturar filiais. Melhorar para nome real do conjunto é refinamento pós-smoke (Task 9 valida se incomoda). ⚠️ O arquivo é `route.tsx`? **Não** — Next aceita JSX em `route.ts` somente com config; usar extensão **`route.tsx`** para o handler acima (Next suporta `route.tsx` desde 13.4? — NÃO suporta). **Decisão firme:** manter `route.ts` SEM JSX — usar `createElement`:

No topo: `import { createElement } from "react";` e trocar o bloco `const doc = ...` por:

```ts
const doc =
	orders.length === 0
		? createElement(EmptyPickingListDocument, { batch })
		: createElement(PickingListDocument, {
				batch,
				branchName,
				generatedAt,
				operatorName: session.user.name ?? session.user.email ?? "—",
				orders,
			});
```

- [ ] **Step 7: Type-check + testes**

Run: `bun check-types --force && bun --cwd apps/web test picking-list`
Expected: PASS em ambos.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/orders/picking-list
git commit -m "feat: rota GET do PDF de separação"
```

---

### Task 4: CTA pós-bulk em Pedidos

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (interface `BulkStartSeparationResult` + loop de `bulkStartSeparation`)
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-view.tsx` (`runBulkSeparation`)

**Interfaces:**
- Consumes: rota da Task 3.
- Produces: `BulkStartSeparationResult` ganha `movedIds: string[]`.

- [ ] **Step 1: Ampliar o retorno da action**

Em `apps/web/src/app/dashboard/orders/actions.ts`:

1. Na interface (linha ~338):

```ts
export interface BulkStartSeparationResult {
	moved: number;
	movedIds: string[];
	skipped: { number: string; reason: string }[];
}
```

2. No corpo de `bulkStartSeparation`, junto de `let moved = 0;`:

```ts
const movedIds: string[] = [];
```

3. Dentro da transação, logo após `moved += 1;`:

```ts
movedIds.push(orderId);
```

4. No return de sucesso:

```ts
return { ok: true, data: { moved, movedIds, skipped } };
```

- [ ] **Step 2: Verificar testes existentes da action**

Run: `rg -l "bulkStartSeparation" apps/web/src --glob '*__tests__*'`
Se algum teste assertar o shape do retorno, adicionar `movedIds` à expectativa (array com os ids movidos do cenário).

- [ ] **Step 3: Abrir o PDF no sucesso do bulk**

Em `apps/web/src/app/dashboard/orders/_components/orders-view.tsx`, substituir o final de `runBulkSeparation` (o bloco de `const { kind, message } = ...` até `sel.exit();`) por:

```tsx
const { kind, message } = buildBulkSeparationToast(
	result.data.moved,
	result.data.skipped
);
if (result.data.movedIds.length > 0) {
	const pdfUrl = `/dashboard/orders/picking-list?ids=${result.data.movedIds.join(",")}`;
	// Abre o PDF do lote; se o popup blocker engolir, o botão do toast cobre.
	window.open(pdfUrl, "_blank", "noopener");
	notify[kind](message, {
		action: {
			label: "Imprimir lista",
			onClick: () => window.open(pdfUrl, "_blank", "noopener"),
		},
	});
} else {
	notify[kind](message);
}
sel.exit();
```

- [ ] **Step 4: Type-check**

Run: `bun check-types --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/_components/orders-view.tsx
git commit -m "feat: PDF do lote ao enviar para separação"
```

---

### Task 5: Fila de separação — botão Imprimir + seleção

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx` (botão no `PageHeader`)
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` (modo seleção)

**Interfaces:**
- Consumes: rota da Task 3; kit bulk (`useBulkSelection` de `@/lib/use-bulk-selection`, `SelectionToolbar`/`BulkActionBar`/`SelectableItem` de `@/components/bulk/*`).
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Botão "Imprimir lista" no header da fila**

Em `apps/web/src/app/dashboard/separacao/page.tsx`:

1. Imports novos no topo:

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import { PrinterIcon } from "lucide-react";
```

2. No `action={...}` do `<PageHeader>`, envolver o `div` dos contadores e adicionar o link (o slot vira um fragmento com os dois):

```tsx
action={
	<div className="flex items-center gap-6">
		{activeTab !== "excecoes" && (
			<a
				className={buttonVariants({ size: "sm", variant: "outline" })}
				href={`/dashboard/orders/picking-list?tab=${activeTab}`}
				rel="noopener"
				target="_blank"
			>
				<PrinterIcon aria-hidden className="size-4" />
				Imprimir lista
			</a>
		)}
		{/* ...bloco existente dos 3 contadores permanece aqui, inalterado... */}
	</div>
}
```

(O bloco dos contadores já é um `div.flex.items-center.gap-6` — mover o link para DENTRO dele como primeiro filho, sem criar wrapper duplicado.)

- [ ] **Step 2: Seleção na fila (imprimir pedidos específicos)**

Reescrever `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` com o modo seleção (diff sobre o arquivo atual — tabs e grid permanecem):

```tsx
"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";

type Tab = "a_separar" | "em_separacao" | "excecoes";

const BASE = "/dashboard/separacao";

const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido sendo separado no momento.",
	excecoes: "Sem exceções no momento.",
};

interface PickingQueueProps {
	activeTab: Tab;
	counts: { a_separar: number; em_separacao: number; excecoes: number };
	initial: PickingQueueRow[];
	initialCursor: string | null;
}

export function PickingQueue({
	activeTab,
	counts,
	initial,
	initialCursor,
}: PickingQueueProps) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchPickingQueuePageAction({ cursor, tab: activeTab }),
		resetKey: activeTab,
	});
	const sel = useBulkSelection({
		items,
		getId: (row) => row.orderId,
		resetKey: activeTab,
	});
	// Exceções não imprimem (spec): sem modo seleção nessa tab.
	const selectable = activeTab !== "excecoes";

	const printSelected = (ids: string[]) => {
		window.open(
			`/dashboard/orders/picking-list?ids=${ids.join(",")}`,
			"_blank",
			"noopener"
		);
	};

	return (
		<div>
			{/* Tabs split: esquerda (fila principal) · direita (seleção + exceções) */}
			<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
				<Tabs value={activeTab}>
					<TabsList scrollable>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=a_separar`} />}
							value="a_separar"
						>
							A separar
							<TabsCountBadge value={counts.a_separar} />
						</TabsTrigger>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=em_separacao`} />}
							value="em_separacao"
						>
							Separando
							<TabsCountBadge value={counts.em_separacao} />
						</TabsTrigger>
					</TabsList>
				</Tabs>
				<div className="flex items-center gap-2">
					{selectable && (
						<SelectionToolbar
							active={sel.active}
							allLoadedSelected={sel.allLoadedSelected}
							loadedCount={items.length}
							onCancel={sel.exit}
							onEnter={sel.enter}
							onToggleAll={
								sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded
							}
						/>
					)}
					<Tabs value={activeTab}>
						<TabsList>
							<TabsTrigger
								nativeButton={false}
								render={<Link href={`${BASE}?tab=excecoes`} />}
								value="excecoes"
							>
								Exceções
								<TabsCountBadge value={counts.excecoes} />
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			</div>

			{/* Grid de cards */}
			{items.length === 0 && !pending && !error ? (
				<p className="py-10 text-center text-muted-foreground text-sm">
					{TAB_EMPTY[activeTab]}
				</p>
			) : (
				<div
					aria-live="polite"
					className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
				>
					{items.map((row) => (
						<SelectableItem
							active={selectable && sel.active}
							key={row.orderId}
							onToggle={() => sel.toggle(row.orderId)}
							selected={sel.isSelected(row.orderId)}
						>
							<PickingOrderCard row={row} tab={activeTab} />
						</SelectableItem>
					))}
				</div>
			)}

			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>

			{selectable && sel.count > 0 && (
				<BulkActionBar
					actions={[
						{
							label: `Imprimir lista (${sel.count})`,
							run: printSelected,
						},
					]}
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Type-check + lint**

Run: `bun check-types --force && bun check`
Expected: PASS (warnings pré-existentes do padrão canônico são aceitáveis; erro novo não).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/page.tsx apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx
git commit -m "feat: imprimir picking list pela fila de separação"
```

---

### Task 6: Rename "Separado" → "Pronto para enviar"

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts:32`
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts:55,91` (tab picked + pill picked)
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx:52`
- Test: `apps/web/src/app/dashboard/separacao/__tests__/fulfillment-meta.test.ts`, `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores (independente).
- Produces: labels novos; `order.status` no DB **não muda** (contrato com ecommerce intacto).

**NÃO mudar:** "Separado por {pickerName}" em `orders/[id]/_components/picking-status-card.tsx` (semântica de autoria, não label de estado); labels da fila "A separar"/"Separando" (nomes de processo).

- [ ] **Step 1: Atualizar os testes primeiro (TDD do rename)**

Em `apps/web/src/app/dashboard/separacao/__tests__/fulfillment-meta.test.ts`: trocar as 2 expectativas `"Separado · Othavio Quiliao"` → `"Pronto para enviar · Othavio Quiliao"` e `"Separado"` → `"Pronto para enviar"`.

Em `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`: nos 2 arrays de labels, trocar `"Separado"` → `"Pronto para enviar"` (tab de etapa e pill de Atrasados).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun --cwd apps/web test fulfillment-meta status-meta`
Expected: FAIL (4 asserts).

- [ ] **Step 3: Aplicar o rename**

1. `fulfillment-meta.ts` linha 32:

```ts
	picked: { label: "Pronto para enviar", iconKey: "check", badgeVariant: "success" },
```

2. `status-meta.ts` — na entrada `key: "picked"` de `ORDER_FLOW_TABS`: `label: "Pronto para enviar",`; em `LATE_SUB_TABS`: `{ key: "picked", label: "Pronto para enviar" },`.

3. `picking-complete-panel.tsx` linha ~52: trocar

```tsx
{`${pickedUnits} de ${totalUnits} unidades conferidas. O pedido está "Separado — pronto pra envio".`}
```

por

```tsx
{`${pickedUnits} de ${totalUnits} unidades conferidas. O pedido está "Pronto para enviar".`}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --cwd apps/web test fulfillment-meta status-meta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/fulfillment-meta.ts apps/web/src/app/dashboard/orders/status-meta.ts apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx apps/web/src/app/dashboard/separacao/__tests__/fulfillment-meta.test.ts apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts
git commit -m "feat: renomeia Separado para Pronto para enviar"
```

---

### Task 7: Guard P1 — pedido cancelado durante picking ativo

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts` (helper + 3 actions)
- Test: `apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts` (casos novos)

**Interfaces:**
- Consumes: `lockOrderAndAuthorize` retorna `{ status: string; branchId: string | null; session: DashboardSession }` — o guard usa `locked.status`.
- Produces: `scanItem`/`completePicking`/`reportMissing` retornam `{ ok: false, error: ORDER_LEFT_PREPARING_ERROR }` e encerram a sessão quando `locked.status !== "preparing"`. **`cancelPicking` fica FORA do guard** (cancelar sessão de pedido cancelado é a limpeza legítima — spec).

- [ ] **Step 1: Escrever os testes (failing)**

Contexto do arquivo de teste (`picking-actions.test.ts`): `lockOrderAndAuthorize` NÃO é mockado — roda de verdade sobre o `makeMockTx(selectResults)`, onde cada array interno alimenta um `tx.select(...)` na ordem em que as actions os fazem. `requireCapabilityWithContext` está mockado globalmente devolvendo `{ user: { id: "usr_1", name: "Picker" } }` — então a sessão dentro do lock é `usr_1`, e `assertOwner` passa quando o picking tem `pickerUserId: "usr_1"`.

Ordem dos selects por action: `scanItem`/`completePicking`/`cancelPicking` → `[0]` picking, `[1]` lock do order; `reportMissing` → `[0]` pickingItem, `[1]` picking, `[2]` lock do order.

Adicionar ao final do arquivo:

```ts
describe("guard: pedido saiu de preparing durante picking ativo", () => {
	const OWNED_PICKING = {
		id: PICKING_ID,
		orderId: ORDER_ID,
		status: "in_progress",
		pickerUserId: "usr_1",
		pickerName: "Picker",
	};
	const CANCELED_LOCK = { status: "canceled", branchId: BRANCH_ID };

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue(mockSession);
	});

	function armTx(selectResults: unknown[][]) {
		let tx: ReturnType<typeof makeMockTx> | undefined;
		mockTransaction.mockImplementation(
			async (cb: (t: ReturnType<typeof makeMockTx>) => unknown) => {
				tx = makeMockTx(selectResults);
				return await cb(tx);
			}
		);
		return () => tx;
	}

	it("scanItem encerra a sessão e retorna erro amigável", async () => {
		const getTx = armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await scanItem(PICKING_ID, "7891234567890");
		expect(result).toMatchObject({ ok: false });
		expect((result as { ok: false; error: string }).error).toContain(
			"encerrada"
		);
		const updateChain = getTx()?.update.mock.results[0]?.value as
			| { set: ReturnType<typeof vi.fn> }
			| undefined;
		expect(updateChain?.set).toHaveBeenCalledWith(
			expect.objectContaining({ canceledByName: "Sistema", status: "canceled" })
		);
	});

	it("completePicking idem", async () => {
		armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await completePicking(PICKING_ID);
		expect(result).toMatchObject({ ok: false });
	});

	it("reportMissing idem", async () => {
		armTx([
			[{ id: PICKING_ITEM_ID, pickingId: PICKING_ID }],
			[OWNED_PICKING],
			[CANCELED_LOCK],
		]);
		const result = await reportMissing(PICKING_ITEM_ID, "não achei na prateleira");
		expect(result).toMatchObject({ ok: false });
	});

	it("cancelPicking SEGUE permitido com pedido cancelado", async () => {
		armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
		const result = await cancelPicking(PICKING_ID, "limpeza");
		expect(result).toMatchObject({ ok: true });
	});
});
```

(Se `makeMockTx`'s `update` não for `vi.fn` tipado no seu editor, seguir o cast usado nos testes existentes do arquivo. `OWNED_PICKING` pode precisar de campos extras que a action leia antes do guard — se um teste falhar com `undefined`, copiar o shape do picking dos testes de sucesso existentes de cada action.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun --cwd apps/web test picking-actions`
Expected: os 3 primeiros FAIL (hoje as actions ignoram `locked.status`); o de `cancelPicking` já passa.

- [ ] **Step 3: Implementar o guard**

Em `apps/web/src/app/dashboard/separacao/actions.ts`:

1. Constante + helper (junto dos helpers `assertInProgress`/`assertOwner`):

```ts
const ORDER_LEFT_PREPARING_ERROR =
	"O pedido foi cancelado ou alterado — a sessão de separação foi encerrada.";

/**
 * Guard P1 (spec 2026-07-15): o ecommerce pode cancelar/estornar o pedido
 * durante uma sessão ativa. Se o status travado não é mais "preparing",
 * encerra a sessão (auditada como Sistema) e retorna true — o caller então
 * retorna erro amigável SEM throw (throw daria rollback no próprio
 * encerramento). NÃO aplicar em cancelPicking: cancelar a sessão de um
 * pedido cancelado é exatamente a ação de limpeza.
 */
async function autoCancelIfOrderLeftPreparing(
	tx: Tx,
	pickingId: string,
	orderStatus: string
): Promise<boolean> {
	if (orderStatus === "preparing") {
		return false;
	}
	await tx
		.update(orderPicking)
		.set({
			status: "canceled",
			canceledByUserId: null,
			canceledByName: "Sistema",
			canceledAt: new Date(),
			cancelReason: `Pedido saiu de preparação (${orderStatus}) durante a separação`,
		})
		.where(eq(orderPicking.id, pickingId));
	return true;
}
```

2. Em **`scanItem`**: declarar `let orderLeft = false;` antes da transação. Dentro da transação, logo após `assertOwner(picking, locked.session.user);`:

```ts
if (await autoCancelIfOrderLeftPreparing(tx, picking.id, locked.status)) {
	orderLeft = true;
	return undefined;
}
```

(A transação de `scanItem` retorna `ScanResult` — ajustar o tipo do callback para `ScanResult | undefined` e, após a transação: )

```ts
if (orderLeft) {
	revalidatePickingPaths(/* orderId do escopo externo */);
	return { ok: false, error: ORDER_LEFT_PREPARING_ERROR };
}
```

(Capturar `orderId` num `let` externo como as outras actions já fazem; o retorno de sucesso existente só roda quando `scanResult !== undefined`.)

3. Em **`completePicking`** e **`reportMissing`**: mesma inserção após o `assertOwner` de cada uma — `orderLeft = true; return;` dentro, e o mesmo bloco de retorno amigável após a transação (ambas já têm `let orderId` externo).

4. **`cancelPicking`: NÃO tocar.**

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun --cwd apps/web test picking-actions`
Expected: PASS (suíte inteira, incluindo os 4 novos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts
git commit -m "fix: encerra picking quando pedido sai de preparing"
```

---

### Task 8: Nome real da filial na execução de picking

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/data.ts` (`getOrderBranchId`)
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`

**Interfaces:**
- Consumes: schema `branch` de `@emach/db/schema/inventory`.
- Produces: `getOrderBranchId` retorna também `branchName: string | null`; `PickingExecutionProps` ganha `branchName: string | null`.

- [ ] **Step 1: Join com branch em getOrderBranchId**

Em `apps/web/src/app/dashboard/separacao/data.ts`, adicionar `branch` ao import de `@emach/db/schema/inventory` (criar o import se não existir) e trocar a implementação:

```ts
export async function getOrderBranchId(orderId: string): Promise<{
	branchId: string | null;
	branchName: string | null;
	number: string;
	status: OrderStatus;
} | null> {
	const [row] = await db
		.select({
			branchId: order.branchId,
			branchName: branch.name,
			number: order.number,
			status: order.status,
		})
		.from(order)
		.leftJoin(branch, eq(branch.id, order.branchId))
		.where(eq(order.id, orderId))
		.limit(1);
	return row ?? null;
}
```

- [ ] **Step 2: Passar a prop**

Em `[orderId]/page.tsx`, no render de `<PickingExecution>`:

```tsx
<PickingExecution
	branchName={orderRow.branchName}
	canShip={canShip}
	items={result.items}
	orderNumber={orderRow.number}
	picking={result.picking}
/>
```

- [ ] **Step 3: Exibir no header**

Em `picking-execution.tsx`:

1. `PickingExecutionProps` ganha `branchName: string | null;` e o destructuring do componente ganha `branchName`.
2. No header (linha ~570), trocar o texto literal `Filial` por:

```tsx
{branchName ?? "Filial"}
```

- [ ] **Step 4: Type-check**

Run: `bun check-types --force`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/data.ts apps/web/src/app/dashboard/separacao/\[orderId\]/page.tsx apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "fix: nome real da filial na execução de picking"
```

---

### Task 9: Verificação integrada + smoke

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Suíte completa com cache limpo**

Run: `bun check-types --force && bun check && bun --cwd apps/web test`
Expected: PASS nos três. Warnings pré-existentes do padrão canônico (ex: `role="button"` em card) são aceitáveis; erro ou warning NOVO não.

- [ ] **Step 2: Build de produção (gate "use server" + tracing de fontes)**

Run: `bun --cwd apps/web run build`
Expected: build completa sem erro. Verificar no output que a rota `/dashboard/orders/picking-list` aparece como dynamic (ƒ).

- [ ] **Step 3: Smoke no browser (⚠️ banco compartilhado — só leitura + fluxo normal de UI)**

Com `bun dev:web` rodando (porta padrão 3001, auth configurada):

1. `/dashboard/orders` → selecionar 2+ pedidos "Pago" → "Enviar para separação (N)" → confirma que o PDF abre em nova aba com coleta consolidada + conferência por transportadora + logo/lote/contexto/stats.
2. `/dashboard/orders/picking-list?ids=<1 id válido em preparing>` → ficha única SEM seção de coleta (regra adaptativa).
3. `/dashboard/separacao` → botão "Imprimir lista" (tab A separar) abre o PDF do recorte; modo seleção → "Imprimir lista (N)" com 2 selecionados.
4. Conferir labels: tab "Pronto para enviar" em Pedidos, badge "Pronto para enviar" em card separado, nome real da filial no header da execução de picking.
5. Comparar o PDF lado a lado com o mockup aprovado (`.superpowers/brainstorm/161240-1784133636/content/pdf-structure-v2.html`) — tipografia, zonas do header, espaçamento.

Expected: os 5 pontos conferem. Divergência visual → ajustar `document.tsx` e re-smoke.

- [ ] **Step 4: Commit final (se houve ajustes no smoke)**

```bash
git add -A apps/web && git commit -m "polish: ajustes do smoke da lista de separação"
```

---

## Self-review notes (já aplicadas)

- Spec coverage: decisões 1-13 → Tasks 1 (4, 5, 6, 11), 2 (7, layout, 12), 3 (escopo/edge cases/13), 4-5 (3), 6 (8), 7-8 (10). Decisão 9 (sem cor) é ausência — nenhuma task adiciona cor.
- `route.ts` sem JSX (usa `createElement`) — regra do Next para route handlers.
- Guard usa flag + return (não throw) para não dar rollback no auto-cancel.
- `cancelPicking` explicitamente fora do guard, com teste garantindo.

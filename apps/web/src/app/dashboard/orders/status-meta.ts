export type { OrderStatus } from "@emach/db/schema/orders";

import type { OrderStatus as DbOrderStatus } from "@emach/db/schema/orders";
import type { StatusIconKey, Tone } from "@/components/status-visual";

// Tab default ao abrir /dashboard/orders (fila de entrada: pagos aguardando
// início da separação — startPicking transiciona paid→preparing sozinho).
export const DEFAULT_ORDER_TAB = "paid";

// "__none__" = frete a combinar (shipping_method IS NULL). Vive aqui (módulo
// client-safe) porque _lib/orders-where.ts importa drizzle-orm/branch-scope
// (server-tainted) — client component nunca pode importar de lá (ADR-0015).
export const CARRIER_NONE = "__none__";

// "__none__" no filtro de Filial = pedidos na triagem (branch_id IS NULL),
// ainda não roteados a partir do ecommerce. Mesmo racional client-safe do
// CARRIER_NONE; valor coincide mas o parâmetro de URL é outro (branchId).
export const BRANCH_NONE = "__none__";

// Teto da atribuição de filial em lote (1 página da listagem; a triagem é o
// caso de uso). Vive aqui (client-safe) porque o schema zod (server) e o
// BranchPickerDialog (client) compartilham o limite.
export const BULK_ASSIGN_LIMIT = 20;

// Teto do envio em lote para separação. Espelha o `.max(100)` de
// bulkStartSeparationSchema (orders/schema.ts) — ação distinta da atribuição
// de filial acima, cabendo divergir no futuro.
export const BULK_SEPARATION_LIMIT = 100;

export type TabLateness = "only";

export interface OrderTabDef {
	key: string;
	label: string;
	lateness?: TabLateness;
	/** Divide o status preparing pela última sessão de picking (tab Separado). */
	picking?: "picked" | "not_picked";
	statuses: readonly DbOrderStatus[] | null;
}

// Fluxo ativo do operador interno (grupo da esquerda na barra de tabs).
// Um chip por status do funil (spec 2026-07-08); a antiga aba agregada
// "A preparar" (paid+preparing) foi dividida em "Pago" e "Em separação".
// Dois eixos ORTOGONAIS convivem aqui:
//   · etapa — abas mutuamente exclusivas; `preparing` é dividido pela última
//     sessão de picking em "Em separação" (bipando) e "Separado" (spec 2026-07-11);
//   · atraso — "Atrasados" fecha a fileira e é um OVERLAY (spec 2026-07-13),
//     não uma etapa: o pedido atrasado continua listado na aba do próprio status.
export const ORDER_FLOW_TABS = [
	{
		key: "paid",
		label: "Pago",
		statuses: ["paid"] as DbOrderStatus[],
		// `lateness` explícito (undefined) — sem ele, a inferência de predicado do
		// TS 5.5+ em `.find()` narrowa pro literal exato desta entrada, que não
		// declara a chave, e `?.lateness` vira erro de check-types (TS2339).
		lateness: undefined,
	},
	{
		key: "preparing",
		label: "Em separação",
		statuses: ["preparing"] as DbOrderStatus[],
		lateness: undefined,
		picking: "not_picked",
	},
	{
		// Tab computada (spec 2026-07-11): preparing com a última sessão de
		// picking concluída — separado, aguardando código de envio.
		key: "picked",
		label: "Pronto para enviar",
		statuses: ["preparing"] as DbOrderStatus[],
		lateness: undefined,
		picking: "picked",
	},
	{
		key: "shipped",
		label: "Enviados",
		statuses: ["shipped"] as DbOrderStatus[],
		lateness: undefined,
	},
	{
		key: "delivered",
		label: "Entregues",
		statuses: ["delivered"] as DbOrderStatus[],
		lateness: undefined,
	},
	{
		// Tab computada: pedidos pagos/em separação há ≥72h (relógio por etapa).
		// Overlay — o pedido também segue listado na aba da própria etapa
		// ("Pago"/"Em separação"/"Separado"), spec 2026-07-13.
		key: "late",
		label: "Atrasados",
		statuses: ["paid", "preparing"] as DbOrderStatus[],
		lateness: "only",
	},
] as const satisfies readonly OrderTabDef[];

// Sub-abas (pills) dentro de "Atrasados": filtram o overlay por etapa — 1:1 com
// as abas do fluxo, então "preparing" aqui exclui os já separados ("picked").
export type LateSubTabKey = "all" | "paid" | "preparing" | "picked";

export const LATE_SUB_TABS = [
	{ key: "all", label: "Todos" },
	{ key: "paid", label: "Pagos" },
	{ key: "preparing", label: "Em separação" },
	{ key: "picked", label: "Pronto para enviar" },
] as const satisfies readonly { key: LateSubTabKey; label: string }[];

// Chaves antigas que ainda podem chegar por deep-link/bookmark. "to_prepare"
// era a aba agregada pago+preparando; cai na fila de entrada.
const LEGACY_TAB_ALIASES: Record<string, string> = {
	to_prepare: "paid",
};

export function canonicalOrderTabKey(tab?: string): string | undefined {
	if (!tab) {
		return tab;
	}
	return LEGACY_TAB_ALIASES[tab] ?? tab;
}

// Estados fora do fluxo principal de ação (grupo da direita na barra de tabs).
export const ORDER_EXCEPTION_TABS = [
	{
		key: "pending_payment",
		label: "Aguardando pagamento",
		statuses: ["pending_payment", "payment_failed"] as DbOrderStatus[],
	},
	{
		key: "returned",
		label: "Devolvidos",
		statuses: ["returned"] as DbOrderStatus[],
	},
	{
		key: "canceled",
		label: "Cancelados",
		statuses: ["canceled", "refunded"] as DbOrderStatus[],
	},
] as const satisfies readonly OrderTabDef[];

// Lista completa (sem "Todos") — consumida por data/export/KPIs.
export const ORDER_TABS = [...ORDER_FLOW_TABS, ...ORDER_EXCEPTION_TABS];

// Sentinel: nenhuma tab selecionada = todos os pedidos (sem filtro de status).
export const ALL_ORDERS_TAB = {
	key: "all",
	label: "Todos",
	statuses: null,
} as const satisfies OrderTabDef;

// Fonte única de status: label + ícone + cor. Consumida por badge, histórico e
// pendências. iconKey/tone são strings serializáveis (ver components/status-visual).
export const ORDER_STATUS_META: Record<
	DbOrderStatus,
	{ iconKey: StatusIconKey; label: string; tone: Tone }
> = {
	pending_payment: {
		label: "Aguardando pagamento",
		iconKey: "clock",
		tone: "warning",
	},
	payment_failed: {
		label: "Pagamento falhou",
		iconKey: "ban",
		tone: "destructive",
	},
	paid: { label: "Pago", iconKey: "check", tone: "success" },
	preparing: { label: "Em separação", iconKey: "package", tone: "info" },
	shipped: { label: "Enviado", iconKey: "truck", tone: "info" },
	delivered: { label: "Entregue", iconKey: "checkCheck", tone: "success" },
	returned: { label: "Devolvido", iconKey: "undo", tone: "warning" },
	canceled: { label: "Cancelado", iconKey: "xCircle", tone: "destructive" },
	refunded: { label: "Reembolsado", iconKey: "rotate", tone: "destructive" },
};

export const ORDER_STATUS_LABELS: Record<DbOrderStatus, string> =
	Object.fromEntries(
		Object.entries(ORDER_STATUS_META).map(([status, meta]) => [
			status,
			meta.label,
		])
	) as Record<DbOrderStatus, string>;

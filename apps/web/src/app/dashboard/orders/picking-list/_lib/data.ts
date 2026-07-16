import "server-only";

import { db } from "@emach/db";
import { type SQL, sql } from "drizzle-orm";
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import type { PickingListItem, PickingListOrder } from "./picking-list-logic";
import type { PickingListParams } from "./resolve-params";

const MAX_ORDERS = 100;

interface Row extends Record<string, unknown> {
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

	let modeFragment: SQL;
	if (params.mode === "ids") {
		const ph = sql.join(
			params.ids.map((id) => sql`${id}`),
			sql`, `
		);
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

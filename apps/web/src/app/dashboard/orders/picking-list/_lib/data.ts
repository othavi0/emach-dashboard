import "server-only";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";
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

	const ph = sql.join(
		params.ids.map((id) => sql`${id}`),
		sql`, `
	);
	const idsFragment = sql`o.id IN (${ph}) AND o.status IN ('paid', 'preparing')`;

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
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'variantId', oi.variant_id, 'sku', oi.sku, 'barcode', oi.barcode,
				'name', oi.name, 'model', oi.model, 'voltage', oi.voltage,
				'quantity', oi.quantity
			) ORDER BY oi.quantity DESC, oi.name ASC), '[]'::jsonb) AS items
			FROM order_item oi
			WHERE oi.order_id = o.id
		) li ON true
		WHERE ${idsFragment}
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

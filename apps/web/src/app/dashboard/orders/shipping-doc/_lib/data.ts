import "server-only";

import { db } from "@emach/db";
import { type SQL, sql } from "drizzle-orm";
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import type { ShippingDocParams } from "./resolve-params";
import type { ShippingDocItem, ShippingDocOrder } from "./shipping-doc-logic";

const MAX_ORDERS = 100;

interface Row extends Record<string, unknown> {
	b_cep: string | null;
	b_city: string | null;
	b_complement: string | null;
	b_name: string | null;
	b_neighborhood: string | null;
	b_phone: string | null;
	b_state: string | null;
	b_street: string | null;
	b_street_number: string | null;
	client_document: string | null;
	client_phone: string | null;
	id: string;
	items: ShippingDocItem[] | null;
	number: string;
	r_city: string | null;
	r_complement: string | null;
	r_neighborhood: string | null;
	r_number: string | null;
	r_state: string | null;
	r_street: string | null;
	recipient: string | null;
	shipping_method: string | null;
	shipping_service_code: string | null;
	zip_code: string | null;
}

/**
 * Pedidos "Pronto para enviar" (preparing + última sessão de picking concluída)
 * com remetente (filial), destinatário (snapshot + contato do cliente) e itens
 * para o documento de dados de envio. Branch-scoping fail-closed: pedido fora
 * do escopo é excluído em silêncio (mesmo padrão da picking-list, spec #319).
 */
export async function fetchShippingDocOrders(
	params: ShippingDocParams,
	scope: BranchScope
): Promise<ShippingDocOrder[]> {
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const branchFragment = branchCond ? sql`AND ${branchCond}` : sql``;

	// Condição "Pronto para enviar" idêntica à tab picked (orders-where.ts):
	// preparing com a última sessão de picking (lp) = 'completed'.
	const pickedCond = sql`o.status = 'preparing' AND lp.status = 'completed'`;
	let modeFragment: SQL;
	if (params.mode === "ids") {
		const ph = sql.join(
			params.ids.map((id) => sql`${id}`),
			sql`, `
		);
		modeFragment = sql`o.id IN (${ph}) AND ${pickedCond}`;
	} else {
		modeFragment = pickedCond;
	}

	const result = await db.execute<Row>(sql`
		SELECT
			o.id,
			o.number,
			o.shipping_method,
			o.shipping_service_code,
			o.shipping_address->>'recipient' AS recipient,
			o.shipping_address->>'zipCode' AS zip_code,
			o.shipping_address->>'street' AS r_street,
			o.shipping_address->>'number' AS r_number,
			o.shipping_address->>'complement' AS r_complement,
			o.shipping_address->>'neighborhood' AS r_neighborhood,
			o.shipping_address->>'city' AS r_city,
			o.shipping_address->>'state' AS r_state,
			c.phone AS client_phone,
			c.document AS client_document,
			b.name AS b_name,
			b.phone AS b_phone,
			b.cep AS b_cep,
			b.street AS b_street,
			b.street_number AS b_street_number,
			b.complement AS b_complement,
			b.neighborhood AS b_neighborhood,
			b.city AS b_city,
			b.state AS b_state,
			li.items
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN branch b ON b.id = o.branch_id
		LEFT JOIN LATERAL (
			SELECT op.status FROM order_picking op
			WHERE op.order_id = o.id
			ORDER BY op.started_at DESC, op.id DESC LIMIT 1
		) lp ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'name', oi.name,
				'quantity', oi.quantity,
				'unitPrice', oi.unit_price,
				'lineTotal', oi.line_total
			) ORDER BY oi.name ASC), '[]'::jsonb) AS items
			FROM order_item oi
			WHERE oi.order_id = o.id
		) li ON true
		WHERE ${modeFragment}
			${branchFragment}
		ORDER BY o.paid_at ASC, o.id ASC
		LIMIT ${MAX_ORDERS}
	`);

	return result.rows.map((r) => ({
		id: r.id,
		items: (r.items ?? []).map((item) => ({
			lineTotal: Number(item.lineTotal),
			name: item.name,
			quantity: Number(item.quantity),
			unitPrice: Number(item.unitPrice),
		})),
		number: r.number,
		recipient: {
			city: r.r_city,
			complement: r.r_complement,
			document: r.client_document,
			name: r.recipient,
			neighborhood: r.r_neighborhood,
			number: r.r_number,
			phone: r.client_phone,
			state: r.r_state,
			street: r.r_street,
			zipCode: r.zip_code,
		},
		sender: {
			cep: r.b_cep,
			city: r.b_city,
			complement: r.b_complement,
			name: r.b_name,
			neighborhood: r.b_neighborhood,
			phone: r.b_phone,
			state: r.b_state,
			street: r.b_street,
			streetNumber: r.b_street_number,
		},
		shippingMethod: r.shipping_method,
		shippingServiceCode: r.shipping_service_code,
	}));
}

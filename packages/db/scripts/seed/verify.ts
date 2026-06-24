// packages/db/scripts/seed/verify.ts
import { sql } from "drizzle-orm";
import type { Tx } from "./context";

const CHECKS: { name: string; query: string }[] = [
	{
		name: "tool sem default variant",
		query:
			"SELECT count(*) AS n FROM tool t WHERE NOT EXISTS (SELECT 1 FROM tool_variant v WHERE v.tool_id = t.id AND v.is_default = true)",
	},
	{
		name: "tool sem primary category",
		query:
			"SELECT count(*) AS n FROM tool t WHERE NOT EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.is_primary = true)",
	},
	{
		name: "attribute value orfao de path",
		query: `
			SELECT count(*) AS n
			FROM tool_attribute_value tav
			JOIN attribute_definition ad ON ad.id = tav.attribute_id
			JOIN category attr_cat ON attr_cat.id = ad.category_id
			JOIN tool_category tc ON tc.tool_id = tav.tool_id AND tc.is_primary = true
			JOIN category primary_cat ON primary_cat.id = tc.category_id
			WHERE primary_cat.path <> attr_cat.path
			  AND primary_cat.path NOT LIKE (attr_cat.path || '/%')
		`,
	},
	{
		name: "stock_level incoerente com movimentos",
		query: `
			SELECT count(*) AS n
			FROM stock_level sl
			WHERE sl.quantity <> (
				SELECT COALESCE(SUM(sm.delta), 0)
				FROM stock_movement sm
				WHERE sm.variant_id = sl.variant_id
				  AND sm.branch_id = sl.branch_id
			)
		`,
	},
	{
		name: "stock negativo",
		query: "SELECT count(*) AS n FROM stock_level WHERE quantity < 0",
	},
	{
		name: "order sem history",
		query: `
			SELECT count(*) AS n FROM "order" o
			WHERE NOT EXISTS (
				SELECT 1 FROM order_status_history h WHERE h.order_id = o.id
			)
		`,
	},
	{
		name: "order sem origem pending_payment",
		query: `
			SELECT count(*) AS n FROM "order" o
			WHERE NOT EXISTS (
				SELECT 1 FROM order_status_history h
				WHERE h.order_id = o.id AND h.to_status = 'pending_payment'
			)
		`,
	},
	{
		name: "review invalida",
		query: `
			SELECT count(*) AS n
			FROM review r
			WHERE
				-- order não está em status "entregue+" (delivered/returned/refunded)
				NOT EXISTS (
					SELECT 1 FROM "order" o
					WHERE o.id = r.order_id
					  AND o.status IN ('delivered', 'returned', 'refunded')
				)
				OR
				-- a tool da review não está em nenhum order_item daquele order
				NOT EXISTS (
					SELECT 1 FROM order_item oi
					WHERE oi.order_id = r.order_id AND oi.tool_id = r.tool_id
				)
		`,
	},
	{
		name: "client sem consent tos ou privacy",
		query: `
			SELECT count(*) AS n
			FROM client c
			WHERE NOT EXISTS (
				SELECT 1 FROM consent_log cl WHERE cl.client_id = c.id AND cl.kind = 'tos'
			)
			OR NOT EXISTS (
				SELECT 1 FROM consent_log cl WHERE cl.client_id = c.id AND cl.kind = 'privacy'
			)
		`,
	},
	{
		name: "actor incoerente em movimentos e historicos",
		query: `
			SELECT count(*) AS n FROM (
				-- stock_movement: actor_type='user' com actor_id NULL, ou 'system' com actor_id NOT NULL
				SELECT id FROM stock_movement
				WHERE (actor_type = 'user' AND actor_id IS NULL)
				   OR (actor_type = 'system' AND actor_id IS NOT NULL)
				UNION ALL
				-- order_status_history: actor_type='user' com actor_user_id NULL, ou 'system' com actor_user_id NOT NULL
				SELECT id FROM order_status_history
				WHERE (actor_type = 'user' AND actor_user_id IS NULL)
				   OR (actor_type = 'system' AND actor_user_id IS NOT NULL)
				UNION ALL
				-- client_audit_log: actor_type='user' com actor_user_id NULL, ou 'system' com actor_user_id NOT NULL
				SELECT id FROM client_audit_log
				WHERE (actor_type = 'user' AND actor_user_id IS NULL)
				   OR (actor_type = 'system' AND actor_user_id IS NOT NULL)
			) incoerentes
		`,
	},
	{
		name: "order_item pago sem saida_venda",
		query: `
			SELECT count(*) AS n
			FROM order_item oi
			JOIN "order" o ON o.id = oi.order_id
			WHERE o.status IN ('paid', 'preparing', 'shipped', 'delivered', 'returned', 'refunded')
			  AND NOT EXISTS (
				SELECT 1 FROM stock_movement sm
				WHERE sm.order_id = oi.order_id
				  AND sm.order_item_id = oi.id
				  AND sm.reason = 'saida_venda'
			  )
		`,
	},
	{
		name: "tool_variant com barcode nulo",
		query: "SELECT count(*) AS n FROM tool_variant WHERE barcode IS NULL",
	},
	{
		name: "barcodes duplicados em tool_variant",
		query:
			"SELECT count(*) AS n FROM (SELECT barcode FROM tool_variant GROUP BY barcode HAVING count(*) > 1) d",
	},
];

export async function verifySeed(tx: Tx): Promise<void> {
	for (const c of CHECKS) {
		const res = await tx.execute<{ n: string }>(sql.raw(c.query));
		const n = Number(res.rows[0]?.n ?? 0);
		if (n > 0) {
			throw new Error(`Invariante violado [${c.name}]: ${n} linha(s)`);
		}
	}
	console.log(`[verify] ${CHECKS.length} invariantes OK`);
}

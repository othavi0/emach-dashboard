import "server-only";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import type { SearchResults } from "./global-search";
import { buildSearchPattern, isSearchable } from "./global-search";

const LIMIT = 5;

export async function runGlobalSearch(query: string): Promise<SearchResults> {
	if (!isSearchable(query)) {
		return { tools: [], orders: [], clients: [], variants: [] };
	}
	const pattern = buildSearchPattern(query);
	const trimmed = query.trim();

	const [tools, orders, clients, barcodeVariant] = await Promise.all([
		db.execute<{ id: string; name: string; model: string | null }>(sql`
			SELECT id, name, model FROM tool
			WHERE lower(name) LIKE ${pattern} OR lower(coalesce(model, '')) LIKE ${pattern}
			ORDER BY name ASC LIMIT ${LIMIT}
		`),
		db.execute<{ id: string; number: string; client_name: string }>(sql`
			SELECT o.id, o.number, c.name AS client_name
			FROM "order" o JOIN client c ON c.id = o.client_id
			WHERE lower(o.number) LIKE ${pattern} OR lower(c.name) LIKE ${pattern}
			ORDER BY o.created_at DESC LIMIT ${LIMIT}
		`),
		db.execute<{ id: string; name: string; document: string | null }>(sql`
			SELECT id, name, document FROM client
			WHERE lower(name) LIKE ${pattern} OR coalesce(document, '') LIKE ${pattern}
			ORDER BY name ASC LIMIT ${LIMIT}
		`),
		db.execute<{
			variant_id: string;
			id: string;
			name: string;
			sku: string | null;
		}>(sql`
			SELECT tv.id AS variant_id, t.id, t.name, tv.sku
			FROM tool_variant tv JOIN tool t ON t.id = tv.tool_id
			WHERE tv.barcode = ${trimmed}
			LIMIT 1
		`),
	]);

	return {
		tools: tools.rows.map((r) => ({
			id: r.id,
			label: r.name,
			sublabel: r.model ?? undefined,
			href: `/dashboard/tools/${r.id}`,
			group: "Ferramentas",
		})),
		orders: orders.rows.map((r) => ({
			id: r.id,
			label: `#${r.number}`,
			sublabel: r.client_name,
			href: `/dashboard/orders/${r.id}`,
			group: "Pedidos",
		})),
		clients: clients.rows.map((r) => ({
			id: r.id,
			label: r.name,
			sublabel: r.document ?? undefined,
			href: `/dashboard/customers/${r.id}`,
			group: "Clientes",
		})),
		variants: barcodeVariant.rows.map((r) => ({
			id: r.id,
			variantId: r.variant_id,
			label: r.name,
			sublabel: r.sku ?? undefined,
			href: `/dashboard/tools/${r.id}?variant=${r.variant_id}`,
			group: "Ferramentas",
		})),
	};
}

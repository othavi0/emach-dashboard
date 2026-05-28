import { db } from "@emach/db";
import { sql } from "drizzle-orm";

export interface SearchHit {
	id: string;
	label: string;
	sublabel?: string;
	href: string;
	group: "Ferramentas" | "Pedidos" | "Clientes";
}

export interface SearchResults {
	tools: SearchHit[];
	orders: SearchHit[];
	clients: SearchHit[];
}

export function isSearchable(query: string): boolean {
	return query.trim().length >= 2;
}

export function buildSearchPattern(query: string): string {
	return `%${query.trim().toLowerCase()}%`;
}

const LIMIT = 5;

export async function runGlobalSearch(query: string): Promise<SearchResults> {
	if (!isSearchable(query)) {
		return { tools: [], orders: [], clients: [] };
	}
	const pattern = buildSearchPattern(query);

	const [tools, orders, clients] = await Promise.all([
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
	};
}

export interface SearchHit {
	group: "Ferramentas" | "Pedidos" | "Clientes";
	href: string;
	id: string;
	label: string;
	sublabel?: string;
}

export interface SearchResults {
	clients: SearchHit[];
	orders: SearchHit[];
	tools: SearchHit[];
}

export function isSearchable(query: string): boolean {
	return query.trim().length >= 2;
}

// Metacaracteres LIKE do Postgres. Escape com `\` (char de escape default do LIKE)
// para que `%` e `_` digitados pelo usuário sejam tratados como literais.
const LIKE_SPECIAL = /[\\%_]/g;

export function buildSearchPattern(query: string): string {
	const escaped = query.trim().toLowerCase().replace(LIKE_SPECIAL, "\\$&");
	return `%${escaped}%`;
}

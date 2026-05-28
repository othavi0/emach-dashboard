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

export function buildSearchPattern(query: string): string {
	return `%${query.trim().toLowerCase()}%`;
}

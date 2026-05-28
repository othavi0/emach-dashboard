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

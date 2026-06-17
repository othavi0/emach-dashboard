// Lógica pura de layout dos KPIs do painel — sem imports server-only, para ser
// testável e compartilhada entre o KpiRow (render) e o KpiSkeleton (fallback).

export interface KpiCaps {
	canReadCustomers: boolean;
	canReadPromotions: boolean;
	canReadReviews: boolean;
}

// Classes completas por contagem de KPIs visíveis (literais → Tailwind purge-safe).
// Mínimo é 2 (Pedidos + Rupturas, sempre visíveis: orders.read/stock.read são SAU).
const KPI_GRID_BY_COUNT: Record<number, string> = {
	2: "xl:grid-cols-2",
	3: "md:grid-cols-3 xl:grid-cols-3",
	4: "md:grid-cols-2 xl:grid-cols-4",
	5: "md:grid-cols-3 xl:grid-cols-5",
};

// Quantos KPIs ficam visíveis para o conjunto de capabilities — base 2 + restritos.
export function visibleKpiCount(caps: KpiCaps): number {
	return (
		2 +
		(caps.canReadReviews ? 1 : 0) +
		(caps.canReadCustomers ? 1 : 0) +
		(caps.canReadPromotions ? 1 : 0)
	);
}

export function kpiGridClass(count: number): string {
	return KPI_GRID_BY_COUNT[count] ?? "md:grid-cols-3 xl:grid-cols-5";
}

import Link from "next/link";

export function ProductFilterSummary({
	clearHref,
	name,
	orders,
	units,
}: {
	clearHref: string;
	name: string;
	orders: number;
	units: number;
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/8 px-3 py-2 text-[12.5px]">
			<span className="rounded-md bg-secondary/50 px-2 py-0.5">{name}</span>
			<span>
				em{" "}
				<b>
					{orders} {orders === 1 ? "pedido" : "pedidos"}
				</b>{" "}
				nesta aba ·{" "}
				<b>
					{units} {units === 1 ? "unidade" : "unidades"}
				</b>{" "}
				pra separar
			</span>
			<Link
				className="ml-auto text-muted-foreground text-xs hover:text-foreground"
				href={clearHref}
			>
				limpar filtro ✕
			</Link>
		</div>
	);
}

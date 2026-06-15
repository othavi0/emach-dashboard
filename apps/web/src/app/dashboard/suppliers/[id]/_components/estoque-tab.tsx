import { Boxes } from "lucide-react";

import { fetchSupplierStockPage } from "../../actions";
import { SupplierStockInfinite } from "./supplier-stock-infinite";

interface Props {
	search?: string;
	supplierId: string;
}

export async function EstoqueTab({ supplierId, search }: Props) {
	const first = await fetchSupplierStockPage({
		supplierId,
		search,
		cursor: null,
	});

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Boxes
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">
					Nenhuma ferramenta recebida deste fornecedor
				</p>
				<p className="text-muted-foreground text-xs">
					{search
						? "Nenhuma ferramenta corresponde à busca."
						: "Registre uma entrada com este fornecedor para vê-la aqui."}
				</p>
			</div>
		);
	}

	return (
		<SupplierStockInfinite
			initial={first.items}
			initialCursor={first.nextCursor}
			search={search}
			supplierId={supplierId}
		/>
	);
}

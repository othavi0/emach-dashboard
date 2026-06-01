import { Wrench } from "lucide-react";

import { fetchSupplierToolsPage } from "../../actions";
import { SupplierToolsInfinite } from "./supplier-tools-infinite";

interface Props {
	search?: string;
	supplierId: string;
}

export async function ToolsTab({ supplierId, search }: Props) {
	const first = await fetchSupplierToolsPage({
		supplierId,
		search,
		cursor: null,
	});

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Wrench
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem ferramentas vinculadas</p>
				<p className="text-muted-foreground text-xs">
					{search
						? "Nenhuma ferramenta corresponde à busca."
						: "Adicione a primeira ferramenta deste fornecedor."}
				</p>
			</div>
		);
	}

	return (
		<SupplierToolsInfinite
			initial={first.items}
			initialCursor={first.nextCursor}
			search={search}
			supplierId={supplierId}
		/>
	);
}

import { PackageOpen } from "lucide-react";

import { getCategoryProductsPage } from "../../actions";
import { ProductsInfinite } from "./products-infinite";

export async function ProductsTab({ categoryId }: { categoryId: string }) {
	const first = await getCategoryProductsPage({ categoryId, cursor: null });

	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<PackageOpen
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Nenhum produto nesta categoria</p>
				<p className="text-muted-foreground text-xs">
					Ferramentas com esta categoria como primária aparecem aqui.
				</p>
			</div>
		);
	}

	return (
		<ProductsInfinite
			categoryId={categoryId}
			initial={first.items}
			initialCursor={first.nextCursor}
		/>
	);
}

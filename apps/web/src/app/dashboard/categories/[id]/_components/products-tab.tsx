import { PackageOpen } from "lucide-react";

import type { InfiniteResult } from "@/lib/infinite";
import type { CategoryProductItem } from "../../data";
import { ProductsInfinite } from "./products-infinite";

interface Props {
	categoryId: string;
	first: InfiniteResult<CategoryProductItem>;
}

export function ProductsTab({ categoryId, first }: Props) {
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

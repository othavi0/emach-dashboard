import { FolderTree } from "lucide-react";

import type { InfiniteResult } from "@/lib/infinite";
import type { CategoryChildItem } from "../../data";
import { SubcategoriesInfinite } from "./subcategories-infinite";

interface Props {
	categoryId: string;
	first: InfiniteResult<CategoryChildItem>;
}

export function SubcategoriesTab({ categoryId, first }: Props) {
	if (first.items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<FolderTree
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem subcategorias</p>
				<p className="text-muted-foreground text-xs">
					Use “Nova subcategoria” no topo para criar a primeira.
				</p>
			</div>
		);
	}

	return (
		<SubcategoriesInfinite
			categoryId={categoryId}
			initial={first.items}
			initialCursor={first.nextCursor}
		/>
	);
}

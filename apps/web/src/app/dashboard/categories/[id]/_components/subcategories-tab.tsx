import { FolderTree } from "lucide-react";

import { getCategoryChildrenPage } from "../../actions";
import { SubcategoriesInfinite } from "./subcategories-infinite";

export async function SubcategoriesTab({ categoryId }: { categoryId: string }) {
	const first = await getCategoryChildrenPage({ categoryId, cursor: null });

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

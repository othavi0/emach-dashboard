"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { InfiniteResult } from "@/lib/infinite";
import { getCategoryProductsPage } from "../../actions";
import type { CategoryProductItem } from "../../data";
import { ProductsTab } from "./products-tab";

export function ProductsTabLoader({ categoryId }: { categoryId: string }) {
	return (
		<LazyTab load={() => getCategoryProductsPage({ categoryId, cursor: null })}>
			{(first: InfiniteResult<CategoryProductItem>) => (
				<ProductsTab categoryId={categoryId} first={first} />
			)}
		</LazyTab>
	);
}

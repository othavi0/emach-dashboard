"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { InfiniteResult } from "@/lib/infinite";
import { getCategoryChildrenPage } from "../../actions";
import type { CategoryChildItem } from "../../data";
import { SubcategoriesTab } from "./subcategories-tab";

export function SubcategoriesTabLoader({ categoryId }: { categoryId: string }) {
	return (
		<LazyTab load={() => getCategoryChildrenPage({ categoryId, cursor: null })}>
			{(first: InfiniteResult<CategoryChildItem>) => (
				<SubcategoriesTab categoryId={categoryId} first={first} />
			)}
		</LazyTab>
	);
}

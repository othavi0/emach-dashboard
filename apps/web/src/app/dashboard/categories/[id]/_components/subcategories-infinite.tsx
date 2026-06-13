"use client";

import { FolderTree } from "lucide-react";
import Link from "next/link";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { type CategoryChildItem, getCategoryChildrenPage } from "../../actions";

interface Props {
	categoryId: string;
	initial: CategoryChildItem[];
	initialCursor: string | null;
}

export function SubcategoriesInfinite({
	categoryId,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => getCategoryChildrenPage({ categoryId, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				{items.map((c) => (
					<Link
						className="flex items-center gap-3 border-border border-t px-4 py-2.5 transition-colors first:border-t-0 hover:bg-muted/40"
						href={`/dashboard/categories/${c.id}`}
						key={c.id}
					>
						<span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
							<FolderTree aria-hidden className="size-4" />
						</span>
						<span className="truncate font-medium text-primary text-sm">
							{c.name}
						</span>
						<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
							{c.productCount} {c.productCount === 1 ? "produto" : "produtos"}
						</span>
					</Link>
				))}
				<InfiniteSentinel
					error={error}
					hasMore={hasMore}
					onLoadMore={loadMore}
					pending={pending}
				/>
			</div>
		</div>
	);
}

"use client";

import { Package } from "lucide-react";
import Link from "next/link";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { getCategoryProductsPage } from "../../actions";
import type { CategoryProductItem } from "../../data";

interface Props {
	categoryId: string;
	initial: CategoryProductItem[];
	initialCursor: string | null;
}

export function ProductsInfinite({
	categoryId,
	initial,
	initialCursor,
}: Props) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => getCategoryProductsPage({ categoryId, cursor }),
	});

	return (
		<div aria-live="polite">
			<div className="overflow-hidden rounded-lg border border-border bg-card">
				{items.map((p) => (
					<Link
						className="flex items-center gap-3 border-border border-t px-4 py-2.5 transition-colors first:border-t-0 hover:bg-muted/40"
						href={`/dashboard/tools/${p.id}`}
						key={p.id}
					>
						{p.imageUrl ? (
							// biome-ignore lint/performance/noImgElement: Supabase public URL
							<img
								alt=""
								className="size-9 shrink-0 rounded-md border border-border object-cover"
								height={36}
								src={p.imageUrl}
								width={36}
							/>
						) : (
							<span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
								<Package aria-hidden className="size-4" />
							</span>
						)}
						<span className="truncate font-medium text-primary text-sm">
							{p.name}
						</span>
						<span className="ml-auto shrink-0 font-mono text-muted-foreground text-xs">
							{p.sku ?? "—"}
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

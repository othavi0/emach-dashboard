import { Skeleton } from "@emach/ui/components/skeleton";

export default function ToolStockLoading() {
	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<Skeleton className="size-12 shrink-0 rounded-full" />
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-5 w-56" />
						<Skeleton className="h-4 w-40" />
					</div>
				</div>
				<Skeleton className="h-8 w-20 rounded-md" />
			</div>

			{/* Tabs */}
			<Skeleton className="h-9 w-full rounded-md" />

			{/* List rows */}
			<div className="flex flex-col gap-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<Skeleton className="h-20 w-full rounded-xl" key={i} />
				))}
			</div>
		</div>
	);
}

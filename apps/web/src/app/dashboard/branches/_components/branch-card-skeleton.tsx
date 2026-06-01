import { Skeleton } from "@emach/ui/components/skeleton";

/** Placeholders no shape do BranchCard, exibidos durante o carregamento da próxima página. */
export function BranchCardGridSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{Array.from({ length: count }, (_, i) => i).map((i) => (
				<div
					className="overflow-hidden rounded-[10px] border border-border bg-card"
					key={i}
				>
					<div className="flex items-start gap-3 px-4 pt-4 pb-3">
						<Skeleton className="size-12 rounded-[10px]" />
						<div className="flex-1 space-y-2 pt-1">
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
					<div className="grid grid-cols-3 border-border border-t">
						{[0, 1, 2].map((c) => (
							<div className="flex flex-col items-center gap-1.5 py-3" key={c}>
								<Skeleton className="h-5 w-6" />
								<Skeleton className="h-2 w-10" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

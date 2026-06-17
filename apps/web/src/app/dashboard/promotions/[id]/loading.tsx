import { Skeleton } from "@emach/ui/components/skeleton";

export default function PromotionDetailLoading() {
	return (
		<div className="flex flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex min-w-0 items-center gap-3">
					<Skeleton className="size-12 shrink-0 rounded-full" />
					<div className="flex flex-col gap-1.5">
						<Skeleton className="h-5 w-56" />
						<Skeleton className="h-4 w-40" />
						<div className="flex gap-1.5">
							<Skeleton className="h-5 w-16 rounded-md" />
							<Skeleton className="h-5 w-24 rounded-md" />
						</div>
					</div>
				</div>
				<div className="flex gap-1.5">
					<Skeleton className="size-8 rounded-md" />
					<Skeleton className="h-8 w-20 rounded-md" />
				</div>
			</div>

			{/* Tabs */}
			<Skeleton className="h-9 w-full rounded-md" />

			{/* Overview body */}
			<div className="flex flex-col gap-5">
				<Skeleton className="h-16 w-full" />
				<Skeleton className="h-24 w-full" />
				<Skeleton className="h-32 w-full rounded-xl" />
			</div>
		</div>
	);
}

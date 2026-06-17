import { Skeleton } from "@emach/ui/components/skeleton";

export default function OrdersLoading() {
	return (
		<div className="flex flex-col gap-6">
			{/* PageHeader */}
			<div className="flex flex-col gap-1.5">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-4 w-80" />
			</div>
			{/* filter row */}
			<Skeleton className="h-9 w-full rounded-md" />
			{/* list rows */}
			<div className="flex flex-col gap-3">
				{[0, 1, 2, 3, 4, 5].map((i) => (
					<Skeleton className="h-20 w-full rounded-xl" key={i} />
				))}
			</div>
		</div>
	);
}

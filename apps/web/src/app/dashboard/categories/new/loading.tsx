import { Skeleton } from "@emach/ui/components/skeleton";

export default function NewCategoryLoading() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<Skeleton className="h-7 w-56" />
				<Skeleton className="h-4 w-72" />
			</div>
			<div className="flex max-w-2xl flex-col gap-5">
				{[0, 1, 2, 3, 4].map((i) => (
					<div className="flex flex-col gap-2" key={i}>
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-9 w-full rounded-md" />
					</div>
				))}
			</div>
		</div>
	);
}

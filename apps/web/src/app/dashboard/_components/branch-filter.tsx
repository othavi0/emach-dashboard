"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { usePathname } from "next/navigation";
import { useFilterState } from "@/lib/use-filter-state";

export function BranchFilter({
	options,
	value,
}: {
	options: { id: string; name: string }[];
	value: string | null;
}) {
	const pathname = usePathname();
	const { setParam } = useFilterState({ basePath: pathname });

	const onChange = (next: string | null) => {
		setParam("branch", !next || next === "all" ? null : next);
	};

	return (
		<Select onValueChange={onChange} value={value ?? "all"}>
			<SelectTrigger className="w-48">
				<SelectValue placeholder="Todas as filiais" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="all">Todas as filiais</SelectItem>
				{options.map((o) => (
					<SelectItem key={o.id} value={o.id}>
						{o.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

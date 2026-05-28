"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function BranchFilter({
	options,
	value,
}: {
	options: { id: string; name: string }[];
	value: string | null;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const onChange = (next: string | null) => {
		const sp = new URLSearchParams(params.toString());
		if (!next || next === "all") {
			sp.delete("branch");
		} else {
			sp.set("branch", next);
		}
		router.push(`${pathname}?${sp.toString()}`);
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

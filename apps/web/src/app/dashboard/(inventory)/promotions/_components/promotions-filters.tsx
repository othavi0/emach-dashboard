"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const DEBOUNCE_MS = 300;
const ALL = "all";

interface PromotionsFiltersProps {
	initialSearch: string;
	initialType: string;
}

export function PromotionsFilters({
	initialSearch,
	initialType,
}: PromotionsFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [search, setSearch] = useState(initialSearch);
	const currentType = searchParams.get("type") ?? initialType;

	// debounce search input → URL
	useEffect(() => {
		const currentSearch = searchParams.get("search") ?? "";
		if (search === currentSearch) {
			return;
		}
		const handle = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (search) {
				next.set("search", search);
			} else {
				next.delete("search");
			}
			const qs = next.toString();
			router.replace(
				qs ? `/dashboard/promotions?${qs}` : "/dashboard/promotions"
			);
		}, DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [search, router, searchParams]);

	function updateType(value: string | null) {
		const next = new URLSearchParams(searchParams.toString());
		if (!value || value === ALL) {
			next.delete("type");
		} else {
			next.set("type", value);
		}
		const qs = next.toString();
		router.replace(
			qs ? `/dashboard/promotions?${qs}` : "/dashboard/promotions"
		);
	}

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="promo-search">
					Buscar por título
				</label>
				<Input
					id="promo-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Ex: desconto verão"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-48">
				<label className="text-muted-foreground text-xs" htmlFor="promo-type">
					Tipo
				</label>
				<Select onValueChange={updateType} value={currentType}>
					<SelectTrigger id="promo-type">
						<SelectValue placeholder="Todos" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Todos</SelectItem>
						<SelectItem value="promotion">Promoção</SelectItem>
						<SelectItem value="promocode">Código</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

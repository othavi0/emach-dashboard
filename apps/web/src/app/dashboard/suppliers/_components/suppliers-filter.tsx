"use client";

import { Input } from "@emach/ui/components/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const DEBOUNCE_MS = 300;
const SUPPLIERS_PATH = "/dashboard/suppliers";

interface SuppliersFilterProps {
	initialSearch: string;
}

export function SuppliersFilter({ initialSearch }: SuppliersFilterProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlSearch = searchParams.get("search") ?? "";
	const [search, setSearch] = useState(initialSearch);

	useEffect(() => {
		setSearch(urlSearch);
	}, [urlSearch]);

	useEffect(() => {
		if (search === urlSearch) {
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
			router.replace(qs ? `${SUPPLIERS_PATH}?${qs}` : SUPPLIERS_PATH);
		}, DEBOUNCE_MS);

		return () => clearTimeout(handle);
	}, [router, search, searchParams, urlSearch]);

	return (
		<div className="flex flex-col gap-1 md:max-w-md">
			<label className="text-muted-foreground text-xs" htmlFor="supplier-search">
				Buscar por nome, e-mail ou telefone
			</label>
			<Input
				id="supplier-search"
				onChange={(event) => setSearch(event.target.value)}
				placeholder="Ex: Bosch, contato@email.com"
				value={search}
			/>
		</div>
	);
}

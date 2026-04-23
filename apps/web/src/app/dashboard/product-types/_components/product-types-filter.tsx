"use client";

import { Input } from "@emach/ui/components/input";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const PRODUCT_TYPES_PATH = "/dashboard/product-types";
const DEBOUNCE_MS = 300;

interface ProductTypesFilterProps {
	initialSearch: string;
}

export function ProductTypesFilter({ initialSearch }: ProductTypesFilterProps) {
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
			router.replace(qs ? `${PRODUCT_TYPES_PATH}?${qs}` : PRODUCT_TYPES_PATH);
		}, DEBOUNCE_MS);

		return () => clearTimeout(handle);
	}, [router, search, searchParams, urlSearch]);

	return (
		<div className="flex flex-col gap-1 md:max-w-md">
			<label
				className="text-muted-foreground text-xs"
				htmlFor="product-type-search"
			>
				Buscar por nome
			</label>
			<Input
				id="product-type-search"
				onChange={(event) => setSearch(event.target.value)}
				placeholder="Ex: Furadeiras"
				value={search}
			/>
		</div>
	);
}

"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface ProductTypeOption {
	id: string;
	name: string;
}

interface StockFiltersProps {
	productTypes: ProductTypeOption[];
}

const SORT_OPTIONS = [
	{ label: "Nome (A–Z)", value: "nome" },
	{ label: "Maior estoque", value: "maior" },
	{ label: "Menor estoque", value: "menor" },
] as const;

export function StockFilters({ productTypes }: StockFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const urlSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";
	const [search, setSearch] = useState(urlSearch);

	const currentProductType = searchParams.get("productType") ?? "";
	const currentOrdem = searchParams.get("ordem") ?? "nome";

	useEffect(() => {
		setSearch(urlSearch);
	}, [urlSearch]);

	function buildUrl(next: Record<string, string | null>) {
		const params = new URLSearchParams(searchParams.toString());
		for (const [key, value] of Object.entries(next)) {
			if (key === "search") {
				params.delete("q");
			}
			if (value) {
				params.set(key, value);
			} else {
				params.delete(key);
			}
		}
		const queryString = params.toString();
		return `/dashboard/stock${queryString ? `?${queryString}` : ""}`;
	}

	function pushUrl(next: Record<string, string | null>) {
		startTransition(() => {
			router.replace(buildUrl(next));
		});
	}

	function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		pushUrl({ search: search.trim() || null });
	}

	return (
		<form
			className="flex flex-wrap items-end gap-4"
			onSubmit={handleSearchSubmit}
		>
			<div className="flex flex-col gap-2">
				<Label htmlFor="stock-q">Buscar ferramenta</Label>
				<Input
					disabled={isPending}
					id="stock-q"
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Nome da ferramenta"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="stock-product-type">Tipo de produto</Label>
				<Select
					disabled={isPending}
					onValueChange={(value) =>
						pushUrl({ productType: value === "__all__" ? null : value })
					}
					value={currentProductType || "__all__"}
				>
					<SelectTrigger className="w-52" id="stock-product-type">
						<SelectValue placeholder="Todos" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">Todos</SelectItem>
						{productTypes.map((p) => (
							<SelectItem key={p.id} value={p.id}>
								{p.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="stock-ordem">Ordenar por</Label>
				<Select
					disabled={isPending}
					onValueChange={(value) => pushUrl({ ordem: value })}
					value={currentOrdem}
				>
					<SelectTrigger className="w-52" id="stock-ordem">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SORT_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</form>
	);
}

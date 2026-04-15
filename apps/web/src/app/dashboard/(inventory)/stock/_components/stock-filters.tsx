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
import { useState, useTransition } from "react";

interface CategoryOption {
	id: string;
	name: string;
}

interface StockFiltersProps {
	categories: CategoryOption[];
}

const SORT_OPTIONS = [
	{ label: "Nome (A–Z)", value: "nome" },
	{ label: "Maior estoque", value: "maior" },
	{ label: "Menor estoque", value: "menor" },
] as const;

export function StockFilters({ categories }: StockFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [q, setQ] = useState(searchParams.get("q") ?? "");

	const currentCategoria = searchParams.get("categoria") ?? "";
	const currentOrdem = searchParams.get("ordem") ?? "nome";

	function buildUrl(next: Record<string, string | null>) {
		const params = new URLSearchParams(searchParams.toString());
		for (const [key, value] of Object.entries(next)) {
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
			router.push(buildUrl(next));
		});
	}

	function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		pushUrl({ q: q.trim() || null });
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
					onChange={(event) => setQ(event.target.value)}
					placeholder="Nome da ferramenta"
					value={q}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="stock-categoria">Categoria</Label>
				<Select
					disabled={isPending}
					onValueChange={(value) =>
						pushUrl({ categoria: value === "__all__" ? null : value })
					}
					value={currentCategoria || "__all__"}
				>
					<SelectTrigger className="w-52" id="stock-categoria">
						<SelectValue placeholder="Todas" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="__all__">Todas</SelectItem>
						{categories.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name}
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

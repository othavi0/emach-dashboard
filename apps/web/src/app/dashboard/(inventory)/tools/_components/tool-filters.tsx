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

interface CategoryOption {
	id: string;
	name: string;
}

interface ToolFiltersProps {
	categories: CategoryOption[];
}

const DEBOUNCE_MS = 300;
const ALL = "__all__";

export function ToolFilters({ categories }: ToolFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";

	const [search, setSearch] = useState(urlSearch);
	const currentCategory = searchParams.get("category") ?? ALL;
	const currentVisibility = searchParams.get("visible") ?? ALL;

	useEffect(() => {
		setSearch(urlSearch);
	}, [urlSearch]);

	// debounce search input → URL (guard to skip when unchanged)
	useEffect(() => {
		if (search === urlSearch) {
			return;
		}
		const handle = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			next.delete("q");
			if (search) {
				next.set("search", search);
			} else {
				next.delete("search");
			}
			const qs = next.toString();
			router.replace(qs ? `/dashboard/tools?${qs}` : "/dashboard/tools");
		}, DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [router, search, searchParams, urlSearch]);

	function updateParam(key: string, value: string | null) {
		const next = new URLSearchParams(searchParams.toString());
		if (!value || value === ALL) {
			next.delete(key);
		} else {
			next.set(key, value);
		}
		const qs = next.toString();
		router.replace(qs ? `/dashboard/tools?${qs}` : "/dashboard/tools");
	}

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="tool-q">
					Buscar por nome
				</label>
				<Input
					id="tool-q"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Ex: furadeira"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-56">
				<label className="text-muted-foreground text-xs" htmlFor="tool-cat">
					Categoria
				</label>
				<Select
					onValueChange={(v) => updateParam("category", v)}
					value={currentCategory}
				>
					<SelectTrigger id="tool-cat">
						<SelectValue>
							{(v: string) =>
								v === ALL
									? "Todas"
									: (categories.find((c) => c.id === v)?.name ?? "Todas")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Todas</SelectItem>
						{categories.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="tool-vis">
					Visibilidade
				</label>
				<Select
					onValueChange={(v) => updateParam("visible", v)}
					value={currentVisibility}
				>
					<SelectTrigger id="tool-vis">
						<SelectValue>
							{(v: string) => {
								if (v === "true") {
									return "Visível";
								}
								if (v === "false") {
									return "Oculto";
								}
								return "Todos";
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Todos</SelectItem>
						<SelectItem value="true">Visível</SelectItem>
						<SelectItem value="false">Oculto</SelectItem>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}

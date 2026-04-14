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

	const [query, setQuery] = useState(searchParams.get("q") ?? "");
	const currentCategory = searchParams.get("category") ?? ALL;
	const currentVisibility = searchParams.get("visible") ?? ALL;

	// debounce search input → URL
	useEffect(() => {
		const handle = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (query) {
				next.set("q", query);
			} else {
				next.delete("q");
			}
			router.replace(`/dashboard/tools?${next.toString()}`);
		}, DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [query, router, searchParams]);

	function updateParam(key: string, value: string | null) {
		const next = new URLSearchParams(searchParams.toString());
		if (!value || value === ALL) {
			next.delete(key);
		} else {
			next.set(key, value);
		}
		router.replace(`/dashboard/tools?${next.toString()}`);
	}

	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="tool-q">
					Buscar por nome
				</label>
				<Input
					id="tool-q"
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Ex: furadeira"
					value={query}
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
						<SelectValue />
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
						<SelectValue />
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

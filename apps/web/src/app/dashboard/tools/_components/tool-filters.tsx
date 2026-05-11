"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

import { TOOL_STATUS_LABELS, TOOL_STATUS_OPTIONS } from "./tool-schema";

interface CategoryOption {
	id: string;
	name: string;
}

interface ToolFiltersProps {
	categories: CategoryOption[];
}

const ALL = "__all__";
const BASE = "/dashboard/tools";
const TRACKED = [
	"search",
	"q",
	"categoryId",
	"visible",
	"status",
	"ncm",
	"sort",
] as const;

const SORT_OPTIONS = [
	{ label: "Mais nova", value: "newest" },
	{ label: "Nome (A–Z)", value: "name" },
] as const;

const SORT_LABEL: Record<string, string> = Object.fromEntries(
	SORT_OPTIONS.map((o) => [o.value, o.label])
);

export function ToolFilters({ categories }: ToolFiltersProps) {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});
	const [ncm, setNcm] = useDebouncedParam({
		basePath: BASE,
		key: "ncm",
	});
	const currentCategoryId = searchParams.get("categoryId") ?? ALL;
	const currentVisibility = searchParams.get("visible") ?? ALL;
	const currentStatus = searchParams.get("status") ?? ALL;
	const currentSort = searchParams.get("sort") ?? "newest";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
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
				<label
					className="text-muted-foreground text-xs"
					htmlFor="tool-category"
				>
					Categoria
				</label>
				<Select
					onValueChange={(v) => setParam("categoryId", v === ALL ? null : v)}
					value={currentCategoryId}
				>
					<SelectTrigger id="tool-category">
						<SelectValue>
							{(v: string) =>
								v === ALL
									? "Todas"
									: (categories.find((c) => c.id === v)?.name ?? "Todas")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>Todas</SelectItem>
							{categories.map((c) => (
								<SelectItem key={c.id} value={c.id}>
									{c.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="tool-vis">
					Visibilidade
				</label>
				<Select
					onValueChange={(v) => setParam("visible", v === ALL ? null : v)}
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
						<SelectGroup>
							<SelectItem value={ALL}>Todos</SelectItem>
							<SelectItem value="true">Visível</SelectItem>
							<SelectItem value="false">Oculto</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="tool-status">
					Status
				</label>
				<Select
					onValueChange={(v) => setParam("status", v === ALL ? null : v)}
					value={currentStatus}
				>
					<SelectTrigger id="tool-status">
						<SelectValue>
							{(v: string) => {
								if (v === ALL) {
									return "Todos";
								}
								return (
									TOOL_STATUS_LABELS[
										v as (typeof TOOL_STATUS_OPTIONS)[number]
									] ?? v
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>Todos</SelectItem>
							{TOOL_STATUS_OPTIONS.map((s) => (
								<SelectItem key={s} value={s}>
									{TOOL_STATUS_LABELS[s]}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1 md:w-36">
				<label className="text-muted-foreground text-xs" htmlFor="tool-ncm">
					NCM (prefixo)
				</label>
				<Input
					id="tool-ncm"
					onChange={(e) => setNcm(e.target.value)}
					placeholder="Ex: 8467"
					value={ncm}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-40">
				<label className="text-muted-foreground text-xs" htmlFor="tool-sort">
					Ordenar por
				</label>
				<Select
					onValueChange={(v) => setParam("sort", v === "newest" ? null : v)}
					value={currentSort}
				>
					<SelectTrigger id="tool-sort">
						<SelectValue>
							{(v: string) => SORT_LABEL[v] ?? "Mais nova"}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{SORT_OPTIONS.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}

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
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";
import { TOOL_STATUS_LABELS, TOOL_STATUS_OPTIONS } from "./tool-schema";

interface CategoryOption {
	id: string;
	name: string;
}

interface BranchOption {
	id: string;
	name: string;
}

interface ToolFiltersProps {
	branches: BranchOption[];
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
	"mode",
	"branchId",
] as const;

function buildModeHref(
	currentParams: URLSearchParams,
	mode: string | undefined
): string {
	const next = new URLSearchParams(currentParams.toString());
	if (mode) {
		next.set("mode", mode);
	} else {
		next.delete("mode");
	}
	const qs = next.toString();
	return qs ? `${BASE}?${qs}` : BASE;
}

export function ToolFilters({ branches, categories }: ToolFiltersProps) {
	const rawSearchParams = useSearchParams();
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});
	const currentCategoryId = searchParams.get("categoryId") ?? ALL;
	const currentVisibility = searchParams.get("visible") ?? ALL;
	const currentStatus = searchParams.get("status") ?? ALL;
	const currentMode = searchParams.get("mode") ?? undefined;
	const currentBranchId = searchParams.get("branchId") ?? ALL;

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			{/* Mode toggle — Catálogo / Repor agora / Esgotadas */}
			<div className="flex shrink-0 items-end pb-0.5">
				<div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
					<Link
						className={cn(
							"whitespace-nowrap rounded px-3 py-1 text-xs",
							currentMode
								? "text-muted-foreground"
								: "bg-background font-medium text-foreground shadow-sm"
						)}
						href={buildModeHref(rawSearchParams, undefined)}
					>
						Catálogo
					</Link>
					<Link
						className={cn(
							"whitespace-nowrap rounded px-3 py-1 text-xs",
							currentMode === "repor"
								? "bg-destructive/15 font-medium text-destructive"
								: "text-muted-foreground"
						)}
						href={buildModeHref(rawSearchParams, "repor")}
					>
						Repor agora
					</Link>
					<Link
						className={cn(
							"whitespace-nowrap rounded px-3 py-1 text-xs",
							currentMode === "esgotado"
								? "bg-destructive/15 font-medium text-destructive"
								: "text-muted-foreground"
						)}
						href={buildModeHref(rawSearchParams, "esgotado")}
					>
						Esgotadas
					</Link>
				</div>
			</div>

			<div className="flex flex-1 flex-col gap-1 md:min-w-[220px]">
				<label
					className="whitespace-nowrap text-muted-foreground text-xs"
					htmlFor="tool-q"
				>
					Buscar por nome
				</label>
				<Input
					id="tool-q"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Ex: furadeira"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="tool-branch">
					Filial
				</label>
				<Select
					onValueChange={(v) => setParam("branchId", v === ALL ? null : v)}
					value={currentBranchId}
				>
					<SelectTrigger id="tool-branch">
						<SelectValue>
							{(v: string) =>
								v === ALL
									? "Todas as filiais"
									: (branches.find((b) => b.id === v)?.name ??
										"Todas as filiais")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>Todas as filiais</SelectItem>
							{branches.map((b) => (
								<SelectItem key={b.id} value={b.id}>
									{b.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
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

			<div className="flex flex-col gap-1 md:w-32">
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

			<div className="flex flex-col gap-1 md:w-40">
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
		</FiltersBar>
	);
}

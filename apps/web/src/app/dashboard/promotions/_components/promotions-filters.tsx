"use client";

import { Button } from "@emach/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { ChevronsUpDown, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FiltersBar } from "@/components/filters-bar";
import { MaskedInput } from "@/components/masked-input";
import { percentageMask } from "@/lib/masks";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";
import type { PromotionSort } from "../data";

const BASE = "/dashboard/promotions";
const TRACKED = [
	"search",
	"type",
	"sort",
	"toolId",
	"discountMin",
	"discountMax",
] as const;

interface ToolOption {
	id: string;
	name: string;
}

interface PromotionsFiltersProps {
	availableTools: ToolOption[];
}

const SORT_OPTIONS: Array<{ value: PromotionSort; label: string }> = [
	{ value: "createdDesc", label: "Mais recentes" },
	{ value: "createdAsc", label: "Mais antigas" },
	{ value: "discountDesc", label: "Maior desconto" },
	{ value: "discountAsc", label: "Menor desconto" },
	{ value: "endsAtAsc", label: "Fim mais próximo" },
];

const TYPE_OPTIONS: Array<{
	value: "all" | "promotion" | "promocode";
	label: string;
}> = [
	{ value: "all", label: "Todos os tipos" },
	{ value: "promotion", label: "Automática" },
	{ value: "promocode", label: "Cupom" },
];

export function PromotionsFilters({ availableTools }: PromotionsFiltersProps) {
	const router = useRouter();
	const { setParam, clearAll, hasActive, searchParams } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});

	const currentType = searchParams.get("type") ?? "all";
	const currentSort = searchParams.get("sort") ?? "createdDesc";
	const currentToolId = searchParams.get("toolId") ?? "all";

	const [advancedOpen, setAdvancedOpen] = useState(
		Boolean(
			searchParams.get("discountMin") ||
				searchParams.get("discountMax") ||
				(currentToolId !== "all" && currentToolId)
		)
	);
	const [discountMin, setDiscountMin] = useState<number | undefined>(() => {
		const v = searchParams.get("discountMin");
		return v ? Number(v) : undefined;
	});
	const [discountMax, setDiscountMax] = useState<number | undefined>(() => {
		const v = searchParams.get("discountMax");
		return v ? Number(v) : undefined;
	});
	const [toolPopoverOpen, setToolPopoverOpen] = useState(false);

	const selectedTool = availableTools.find((t) => t.id === currentToolId);

	// Aplica min+max num único replace (evita o closure-staleness de 2x setParam)
	function applyDiscountRange() {
		const next = new URLSearchParams(searchParams.toString());
		if (typeof discountMin === "number") {
			next.set("discountMin", String(discountMin));
		} else {
			next.delete("discountMin");
		}
		if (typeof discountMax === "number") {
			next.set("discountMax", String(discountMax));
		} else {
			next.delete("discountMax");
		}
		const qs = next.toString();
		router.replace(qs ? `${BASE}?${qs}` : BASE);
	}

	function handleClear() {
		setDiscountMin(undefined);
		setDiscountMax(undefined);
		clearAll();
	}

	return (
		<div className="flex flex-col gap-3">
			<FiltersBar hasActive={hasActive} onClear={handleClear}>
				<div className="flex flex-1 flex-col gap-1">
					<Label
						className="text-muted-foreground text-xs"
						htmlFor="promo-search"
					>
						Buscar
					</Label>
					<Input
						id="promo-search"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Título ou código…"
						value={search}
					/>
				</div>

				<div className="flex flex-col gap-1 md:w-44">
					<Label className="text-muted-foreground text-xs">Tipo</Label>
					<Select
						onValueChange={(v) => setParam("type", v === "all" ? null : v)}
						value={currentType}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TYPE_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1 md:w-44">
					<Label className="text-muted-foreground text-xs">Ordenar por</Label>
					<Select
						onValueChange={(v) =>
							setParam("sort", v === "createdDesc" ? null : v)
						}
						value={currentSort}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SORT_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</FiltersBar>

			<Button
				className="w-fit"
				onClick={() => setAdvancedOpen((v) => !v)}
				size="sm"
				variant="ghost"
			>
				{advancedOpen ? "Ocultar filtros avançados" : "Filtros avançados"}
			</Button>

			{advancedOpen && (
				<div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-3">
					<div className="flex flex-col gap-1.5">
						<Label>Ferramenta</Label>
						<Popover onOpenChange={setToolPopoverOpen} open={toolPopoverOpen}>
							<PopoverTrigger
								className="flex h-10 w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
								render={<button type="button" />}
							>
								<span className="truncate">
									{selectedTool ? selectedTool.name : "Todas"}
								</span>
								{currentToolId !== "all" && (
									<button
										aria-label="Limpar ferramenta"
										className="ml-2"
										onClick={(e) => {
											e.stopPropagation();
											setParam("toolId", null);
										}}
										type="button"
									>
										<X className="size-3.5" />
									</button>
								)}
								<ChevronsUpDown className="ml-1 size-3.5 opacity-50" />
							</PopoverTrigger>
							<PopoverContent align="start" className="w-72 p-0">
								<Command>
									<CommandInput placeholder="Buscar ferramenta…" />
									<CommandList>
										<CommandEmpty>Nenhuma encontrada.</CommandEmpty>
										<CommandGroup>
											{availableTools.map((t) => (
												<CommandItem
													key={t.id}
													onSelect={() => {
														setToolPopoverOpen(false);
														setParam("toolId", t.id);
													}}
													value={t.name}
												>
													{t.name}
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Desconto mínimo</Label>
						<MaskedInput
							mask={percentageMask}
							onChange={setDiscountMin}
							placeholder="Ex: 10"
							value={discountMin}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label>Desconto máximo</Label>
						<div className="flex gap-2">
							<MaskedInput
								mask={percentageMask}
								onChange={setDiscountMax}
								placeholder="Ex: 50"
								value={discountMax}
							/>
							<Button
								onClick={applyDiscountRange}
								size="sm"
								variant="secondary"
							>
								Aplicar
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

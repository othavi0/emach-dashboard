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
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { percentageMask } from "@/lib/masks";
import type { PromotionSort, PromotionStatus } from "../actions";

interface ToolOption {
	id: string;
	name: string;
}

interface PromotionsFiltersProps {
	availableTools: ToolOption[];
	initialDiscountMax: string;
	initialDiscountMin: string;
	initialSearch: string;
	initialSort: PromotionSort;
	initialStatus: PromotionStatus | "all";
	initialToolId: string;
	initialType: "promotion" | "promocode" | "all";
}

const SORT_OPTIONS: Array<{ value: PromotionSort; label: string }> = [
	{ value: "createdDesc", label: "Mais recentes" },
	{ value: "createdAsc", label: "Mais antigas" },
	{ value: "discountDesc", label: "Maior desconto" },
	{ value: "discountAsc", label: "Menor desconto" },
	{ value: "endsAtAsc", label: "Fim mais próximo" },
];

const STATUS_OPTIONS: Array<{ value: PromotionStatus | "all"; label: string }> =
	[
		{ value: "all", label: "Todos" },
		{ value: "active", label: "Ativa agora" },
		{ value: "scheduled", label: "Agendada" },
		{ value: "expired", label: "Expirada" },
		{ value: "inactive", label: "Inativa" },
	];

const TYPE_OPTIONS: Array<{
	value: "all" | "promotion" | "promocode";
	label: string;
}> = [
	{ value: "all", label: "Todos os tipos" },
	{ value: "promotion", label: "Automática" },
	{ value: "promocode", label: "Cupom" },
];

export function PromotionsFilters({
	availableTools,
	initialDiscountMax,
	initialDiscountMin,
	initialSearch,
	initialSort,
	initialStatus,
	initialToolId,
	initialType,
}: PromotionsFiltersProps) {
	const router = useRouter();
	const sp = useSearchParams();

	const [search, setSearch] = useState(initialSearch);
	const [advancedOpen, setAdvancedOpen] = useState(
		Boolean(initialDiscountMin || initialDiscountMax || initialToolId !== "all")
	);
	const [discountMin, setDiscountMin] = useState<number | undefined>(
		initialDiscountMin ? Number(initialDiscountMin) : undefined
	);
	const [discountMax, setDiscountMax] = useState<number | undefined>(
		initialDiscountMax ? Number(initialDiscountMax) : undefined
	);
	const [toolPopoverOpen, setToolPopoverOpen] = useState(false);
	const [toolId, setToolId] = useState(initialToolId);

	// Debounced search push — intencionalmente depende só de `search`
	// biome-ignore lint/correctness/useExhaustiveDependencies: só dispara ao alterar o campo de busca
	useEffect(() => {
		const handle = setTimeout(() => {
			const params = new URLSearchParams(sp);
			if (search.trim()) {
				params.set("search", search.trim());
			} else {
				params.delete("search");
			}
			params.delete("view"); // fechar Sheet ao filtrar
			router.replace(`/dashboard/promotions?${params.toString()}`);
		}, 300);
		return () => clearTimeout(handle);
	}, [search]);

	function pushParam(key: string, value: string | undefined) {
		const params = new URLSearchParams(sp);
		if (value && value !== "all" && value !== "") {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		params.delete("view");
		router.replace(`/dashboard/promotions?${params.toString()}`);
	}

	function applyDiscountRange() {
		const params = new URLSearchParams(sp);
		if (typeof discountMin === "number") {
			params.set("discountMin", String(discountMin));
		} else {
			params.delete("discountMin");
		}
		if (typeof discountMax === "number") {
			params.set("discountMax", String(discountMax));
		} else {
			params.delete("discountMax");
		}
		params.delete("view");
		router.replace(`/dashboard/promotions?${params.toString()}`);
	}

	const selectedTool = useMemo(
		() => availableTools.find((t) => t.id === toolId),
		[availableTools, toolId]
	);

	return (
		<div className="flex flex-col gap-3">
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="filter-search">Buscar</Label>
					<Input
						id="filter-search"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Título ou código…"
						value={search}
					/>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Tipo</Label>
					<Select
						onValueChange={(v) => pushParam("type", v)}
						value={initialType}
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

				<div className="flex flex-col gap-1.5">
					<Label>Status</Label>
					<Select
						onValueChange={(v) => pushParam("status", v)}
						value={initialStatus}
					>
						<SelectTrigger>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{STATUS_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>Ordenar por</Label>
					<Select
						onValueChange={(v) => pushParam("sort", v)}
						value={initialSort}
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
			</div>

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
								{toolId !== "all" && (
									<button
										aria-label="Limpar ferramenta"
										className="ml-2"
										onClick={(e) => {
											e.stopPropagation();
											setToolId("all");
											pushParam("toolId", undefined);
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
														setToolId(t.id);
														setToolPopoverOpen(false);
														pushParam("toolId", t.id);
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

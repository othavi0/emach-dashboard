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

import { TOOL_STATUS_LABELS, TOOL_STATUS_OPTIONS } from "./tool-schema";

interface ProductTypeOption {
	id: string;
	name: string;
}

interface ToolFiltersProps {
	productTypes: ProductTypeOption[];
}

const DEBOUNCE_MS = 300;
const ALL = "__all__";

export function ToolFilters({ productTypes }: ToolFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlSearch = searchParams.get("search") ?? searchParams.get("q") ?? "";

	const [search, setSearch] = useState(urlSearch);
	const currentProductType = searchParams.get("productType") ?? ALL;
	const currentVisibility = searchParams.get("visible") ?? ALL;
	const currentStatus = searchParams.get("status") ?? ALL;
	const urlNcm = searchParams.get("ncm") ?? "";
	const [ncm, setNcm] = useState(urlNcm);

	useEffect(() => {
		setNcm(urlNcm);
	}, [urlNcm]);

	useEffect(() => {
		setSearch(urlSearch);
	}, [urlSearch]);

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

	useEffect(() => {
		if (ncm === urlNcm) {
			return;
		}
		const handle = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (ncm) {
				next.set("ncm", ncm);
			} else {
				next.delete("ncm");
			}
			const qs = next.toString();
			router.replace(qs ? `/dashboard/tools?${qs}` : "/dashboard/tools");
		}, DEBOUNCE_MS);
		return () => clearTimeout(handle);
	}, [ncm, urlNcm, router, searchParams]);

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
				<label
					className="text-muted-foreground text-xs"
					htmlFor="tool-product-type"
				>
					Tipo de produto
				</label>
				<Select
					onValueChange={(v) => updateParam("productType", v)}
					value={currentProductType}
				>
					<SelectTrigger id="tool-product-type">
						<SelectValue>
							{(v: string) =>
								v === ALL
									? "Todos"
									: (productTypes.find((p) => p.id === v)?.name ?? "Todos")
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>Todos</SelectItem>
						{productTypes.map((p) => (
							<SelectItem key={p.id} value={p.id}>
								{p.name}
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

			<div className="flex flex-col gap-1 md:w-44">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="tool-status"
				>
					Status
				</label>
				<Select
					onValueChange={(v) => updateParam("status", v)}
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
						<SelectItem value={ALL}>Todos</SelectItem>
						{TOOL_STATUS_OPTIONS.map((s) => (
							<SelectItem key={s} value={s}>
								{TOOL_STATUS_LABELS[s]}
							</SelectItem>
						))}
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
		</div>
	);
}

"use client";

import { DateRangePicker } from "@emach/ui/components/date-range-picker";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import { FiltersBar } from "@/components/filters-bar";
import { formatDateParam, parseDateParam } from "@/lib/date-params";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";
import type {
	BranchOption,
	OrderListFilters as OrderListFilterState,
	OrderStatus,
} from "../data";
import {
	ALL_ORDERS_TAB,
	CARRIER_NONE,
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	ORDER_EXCEPTION_TABS,
	ORDER_FLOW_TABS,
} from "../status-meta";
import { ProductFilterCombobox } from "./product-filter-combobox";

interface OrderListFiltersProps {
	branches: BranchOption[];
	carrierOptions: { hasUnassigned: boolean; methods: string[] };
	counts: Record<string, number>;
	filters: OrderListFilterState;
	toolOptions: { id: string; name: string }[];
}

const BASE = "/dashboard/orders";
// "tab" fora do TRACKED de propósito: o botão "Limpar" da barra de busca age só
// sobre busca/data/filial/transportadora/produto e mantém a tab atual; o reset
// de status é o chip "Todos".
const TRACKED = [
	"q",
	"from",
	"to",
	"branchId",
	"carrier",
	"productId",
] as const;
const BRANCH_ALL = "__all__";
const CARRIER_ALL = "__all__";

function buildTabHref(filters: OrderListFilterState, tabKey: string): string {
	const params = new URLSearchParams();
	// Sempre explicitar o tab: a ausência de ?tab agora resolve para o default
	// ("Pago"), então "Todos" e os demais precisam do parâmetro na URL.
	if (tabKey) {
		params.set("tab", tabKey);
	}
	if (filters.q) {
		params.set("q", filters.q);
	}
	if (filters.from) {
		params.set("from", filters.from);
	}
	if (filters.to) {
		params.set("to", filters.to);
	}
	if (filters.branchId) {
		params.set("branchId", filters.branchId);
	}
	if (filters.carrier) {
		params.set("carrier", filters.carrier);
	}
	if (filters.toolId) {
		params.set("productId", filters.toolId);
	}
	const qs = params.toString();
	return qs ? `${BASE}?${qs}` : BASE;
}

function tabCount(
	counts: Record<string, number>,
	tabKey: string,
	statuses: readonly OrderStatus[] | null
) {
	if (tabKey === "all") {
		return counts.all_count ?? 0;
	}
	if (tabKey === "late") {
		return counts.late ?? 0;
	}
	if (tabKey === "picked") {
		return counts.picked ?? 0;
	}
	if (!statuses) {
		return 0;
	}
	return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export function OrderFiltersPanel({
	branches,
	carrierOptions,
	counts,
	filters,
	toolOptions,
}: OrderListFiltersProps) {
	const currentTab = canonicalOrderTabKey(filters.tab) ?? DEFAULT_ORDER_TAB;

	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [q, setQ] = useDebouncedParam({ basePath: BASE, key: "q" });
	const [from, setFrom] = useDebouncedParam({ basePath: BASE, key: "from" });
	const [to, setTo] = useDebouncedParam({ basePath: BASE, key: "to" });
	const currentBranch = searchParams.get("branchId") ?? BRANCH_ALL;
	const currentCarrier = searchParams.get("carrier") ?? CARRIER_ALL;

	const renderTab = (tab: {
		key: string;
		label: string;
		statuses: readonly OrderStatus[] | null;
	}) => {
		const count = tabCount(counts, tab.key, tab.statuses);
		const isActive = currentTab === tab.key;
		const href = buildTabHref(filters, tab.key);
		return (
			<TabsTrigger
				key={tab.key}
				nativeButton={false}
				render={<Link href={href} />}
				value={tab.key}
			>
				<span>{tab.label}</span>
				{(isActive || count > 0) && (
					<TabsCountBadge
						className={
							tab.key === "late" && count > 0
								? "bg-warning text-warning-foreground"
								: undefined
						}
						value={count}
					/>
				)}
			</TabsTrigger>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<Tabs value={currentTab}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<TabsList scrollable>
						{renderTab(ALL_ORDERS_TAB)}
						{ORDER_FLOW_TABS.map(renderTab)}
					</TabsList>
					<TabsList scrollable>{ORDER_EXCEPTION_TABS.map(renderTab)}</TabsList>
				</div>
			</Tabs>

			<FiltersBar hasActive={hasActive} onClear={clearAll}>
				<div className="flex flex-1 flex-col gap-1.5">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-q"
					>
						Buscar pedido ou cliente
					</label>
					<Input
						id="orders-q"
						onChange={(e) => setQ(e.target.value)}
						placeholder="Nº do pedido ou nome do cliente"
						value={q}
					/>
				</div>

				<div className="flex flex-col gap-1.5 md:w-64">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-period"
					>
						Período
					</label>
					<DateRangePicker
						from={parseDateParam(from)}
						id="orders-period"
						onChange={(r) => {
							setFrom(formatDateParam(r.from));
							setTo(formatDateParam(r.to));
						}}
						to={parseDateParam(to)}
					/>
				</div>

				<div className="flex flex-col gap-1.5 md:w-52">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-product"
					>
						Produto
					</label>
					<ProductFilterCombobox
						id="orders-product"
						onChange={(id) => setParam("productId", id)}
						options={toolOptions}
						value={searchParams.get("productId")}
					/>
				</div>

				<div className="flex flex-col gap-1.5 md:w-52">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-branch"
					>
						Filial
					</label>
					<Select
						onValueChange={(v) =>
							setParam("branchId", v === BRANCH_ALL ? null : v)
						}
						value={currentBranch}
					>
						<SelectTrigger id="orders-branch">
							<SelectValue>
								{(v: string) =>
									v === BRANCH_ALL
										? "Todas as filiais"
										: (branches.find((b) => b.id === v)?.name ??
											"Todas as filiais")
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={BRANCH_ALL}>Todas as filiais</SelectItem>
								{branches.map((branch) => (
									<SelectItem key={branch.id} value={branch.id}>
										{branch.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5 md:w-52">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-carrier"
					>
						Transportadora
					</label>
					<Select
						onValueChange={(v) =>
							setParam("carrier", v === CARRIER_ALL ? null : v)
						}
						value={currentCarrier}
					>
						<SelectTrigger id="orders-carrier">
							<SelectValue>
								{(v: string) => {
									if (v === CARRIER_ALL) {
										return "Todas as transportadoras";
									}
									if (v === CARRIER_NONE) {
										return "A combinar";
									}
									return v;
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={CARRIER_ALL}>
									Todas as transportadoras
								</SelectItem>
								{carrierOptions.methods.map((method) => (
									<SelectItem key={method} value={method}>
										{method}
									</SelectItem>
								))}
								{carrierOptions.hasUnassigned && (
									<SelectItem value={CARRIER_NONE}>A combinar</SelectItem>
								)}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			</FiltersBar>
		</div>
	);
}

"use client";

import { DatePicker } from "@emach/ui/components/date-picker";
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
import { ORDER_EXCEPTION_TABS, ORDER_FLOW_TABS } from "../status-meta";

interface OrderListFiltersProps {
	branches: BranchOption[];
	counts: Record<string, number>;
	filters: OrderListFilterState;
}

const BASE = "/dashboard/orders";
const TRACKED = ["tab", "q", "from", "to", "branchId", "page"] as const;
const BRANCH_ALL = "__all__";

function buildTabHref(filters: OrderListFilterState, tabKey: string): string {
	const params = new URLSearchParams();
	if (tabKey && tabKey !== "all") {
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
	if (!statuses) {
		return 0;
	}
	return statuses.reduce((sum, status) => sum + (counts[status] ?? 0), 0);
}

export function OrderFiltersPanel({
	branches,
	counts,
	filters,
}: OrderListFiltersProps) {
	const currentTab = filters.tab ?? "all";

	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [q, setQ] = useDebouncedParam({ basePath: BASE, key: "q" });
	const [from, setFrom] = useDebouncedParam({ basePath: BASE, key: "from" });
	const [to, setTo] = useDebouncedParam({ basePath: BASE, key: "to" });
	const currentBranch = searchParams.get("branchId") ?? BRANCH_ALL;

	const renderTab = (tab: {
		key: string;
		label: string;
		statuses: readonly OrderStatus[];
	}) => {
		const count = tabCount(counts, tab.key, tab.statuses);
		const isActive = currentTab === tab.key;
		// Clicar na tab ativa volta a "Todos" (remove o filtro de status).
		const href = buildTabHref(filters, isActive ? "all" : tab.key);
		return (
			<TabsTrigger
				key={tab.key}
				nativeButton={false}
				render={<Link href={href} />}
				value={tab.key}
			>
				<span>{tab.label}</span>
				{(isActive || count > 0) && <TabsCountBadge value={count} />}
			</TabsTrigger>
		);
	};

	return (
		<div className="flex flex-col gap-3">
			<Tabs value={currentTab}>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<TabsList scrollable>{ORDER_FLOW_TABS.map(renderTab)}</TabsList>
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

				<div className="flex flex-col gap-1.5 md:w-40">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-from"
					>
						De
					</label>
					<DatePicker
						id="orders-from"
						onChange={(d) => setFrom(formatDateParam(d))}
						value={parseDateParam(from)}
					/>
				</div>

				<div className="flex flex-col gap-1.5 md:w-40">
					<label
						className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest"
						htmlFor="orders-to"
					>
						Até
					</label>
					<DatePicker
						id="orders-to"
						min={parseDateParam(from)}
						onChange={(d) => setTo(formatDateParam(d))}
						value={parseDateParam(to)}
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
			</FiltersBar>
		</div>
	);
}

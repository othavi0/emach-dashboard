import { Input } from "@emach/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@emach/ui/components/native-select";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import Link from "next/link";

import type {
	BranchOption,
	OrderListFilters as OrderListFilterState,
	OrderStatus,
} from "../data";
import { ORDER_TABS } from "../status-meta";

interface OrderListFiltersProps {
	branches: BranchOption[];
	counts: Record<string, number>;
	filters: OrderListFilterState;
}

function buildHref(
	filters: OrderListFilterState,
	overrides: Partial<OrderListFilterState>
): string {
	const params = new URLSearchParams();
	const next = {
		tab: overrides.tab ?? filters.tab,
		q: overrides.q ?? filters.q,
		from: overrides.from ?? filters.from,
		to: overrides.to ?? filters.to,
		branchId: overrides.branchId ?? filters.branchId,
		page: overrides.page ?? filters.page,
	};

	if (next.tab && next.tab !== "all") {
		params.set("tab", next.tab);
	}
	if (next.q) {
		params.set("q", next.q);
	}
	if (next.from) {
		params.set("from", next.from);
	}
	if (next.to) {
		params.set("to", next.to);
	}
	if (next.branchId) {
		params.set("branchId", next.branchId);
	}
	if (next.page && next.page > 1) {
		params.set("page", String(next.page));
	}

	const query = params.toString();
	return query ? `/dashboard/orders?${query}` : "/dashboard/orders";
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

	return (
		<div className="flex flex-col gap-4">
			<Tabs value={currentTab}>
				<TabsList className="max-w-full overflow-x-auto">
					{ORDER_TABS.map((tab) => (
						<TabsTrigger
							key={tab.key}
							nativeButton={false}
							render={
								<Link href={buildHref(filters, { page: 1, tab: tab.key })} />
							}
							value={tab.key}
						>
							{tab.label} ({tabCount(counts, tab.key, tab.statuses)})
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<form
				action="/dashboard/orders"
				className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]"
			>
				<input name="tab" type="hidden" value={currentTab} />
				<div className="flex flex-col gap-1">
					<label className="text-muted-foreground text-xs" htmlFor="orders-q">
						Buscar pedido ou cliente
					</label>
					<Input
						defaultValue={filters.q ?? ""}
						id="orders-q"
						name="q"
						placeholder="Ex: 2026-000123 ou Cliente"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="orders-from"
					>
						De
					</label>
					<Input
						defaultValue={filters.from ?? ""}
						id="orders-from"
						name="from"
						type="date"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label className="text-muted-foreground text-xs" htmlFor="orders-to">
						Até
					</label>
					<Input
						defaultValue={filters.to ?? ""}
						id="orders-to"
						name="to"
						type="date"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="orders-branch"
					>
						Filial
					</label>
					<NativeSelect
						defaultValue={filters.branchId ?? ""}
						id="orders-branch"
						name="branchId"
					>
						<NativeSelectOption value="">Todas</NativeSelectOption>
						{branches.map((branch) => (
							<NativeSelectOption key={branch.id} value={branch.id}>
								{branch.name}
							</NativeSelectOption>
						))}
					</NativeSelect>
				</div>

				<div className="flex items-end gap-2">
					<button
						className="h-8 rounded-none bg-primary px-3 text-primary-foreground text-xs"
						type="submit"
					>
						Aplicar
					</button>
					<Link
						className="inline-flex h-8 items-center rounded-none border border-border px-3 text-xs"
						href="/dashboard/orders"
					>
						Limpar
					</Link>
				</div>
			</form>
		</div>
	);
}

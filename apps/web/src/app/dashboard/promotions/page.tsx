import { Button } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { ChevronDown, Plus, Tag, Ticket } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { PromotionsFilters } from "./_components/promotions-filters";
import { PromotionsGrid } from "./_components/promotions-grid";
import {
	fetchPromotionsPage,
	getPromotionStatusCounts,
	getToolOptions,
	type ListPromotionsOptions,
	type PromotionSort,
	type PromotionStatus,
} from "./data";

export const metadata: Metadata = {
	title: "Promoções",
};

interface PageProps {
	searchParams: Promise<{
		type?: string;
		search?: string;
		status?: string;
		sort?: string;
		toolId?: string;
		discountMin?: string;
		discountMax?: string;
	}>;
}

const VALID_STATUS = new Set<PromotionStatus>([
	"active",
	"scheduled",
	"expired",
	"inactive",
]);

const VALID_SORT = new Set<PromotionSort>([
	"createdDesc",
	"createdAsc",
	"discountDesc",
	"discountAsc",
	"endsAtAsc",
]);

const STATUS_TABS: Array<{ value: PromotionStatus; label: string }> = [
	{ value: "active", label: "Ativas" },
	{ value: "scheduled", label: "Agendadas" },
	{ value: "expired", label: "Expiradas" },
	{ value: "inactive", label: "Inativas" },
];

function parseDiscount(raw?: string): number | undefined {
	if (!raw) {
		return;
	}
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
}

function buildStatusHref(
	sp: Record<string, string | undefined>,
	status: PromotionStatus
): string {
	const params = new URLSearchParams();
	if (status !== "active") {
		params.set("status", status);
	}
	for (const key of [
		"search",
		"type",
		"sort",
		"toolId",
		"discountMin",
		"discountMax",
	] as const) {
		if (sp[key]) {
			params.set(key, sp[key] as string);
		}
	}
	const qs = params.toString();
	return qs ? `/dashboard/promotions?${qs}` : "/dashboard/promotions";
}

export default function PromotionsPage({ searchParams }: PageProps) {
	return <PromotionsPageContent searchParams={searchParams} />;
}

async function PromotionsPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect(
		"promotions.read",
		"/dashboard/sem-acesso?recurso=Promoções"
	);
	const canMutate = await can(session, "promotions.manage");

	const params = await searchParams;
	const search = params.search ?? "";
	const typeParam = params.type;
	const typeFilter =
		typeParam === "promotion" || typeParam === "promocode" ? typeParam : "all";
	const statusFilter = (
		VALID_STATUS.has(params.status as PromotionStatus)
			? params.status
			: "active"
	) as PromotionStatus;
	const sort = (
		VALID_SORT.has(params.sort as PromotionSort) ? params.sort : "createdDesc"
	) as PromotionSort;
	const discountMin = parseDiscount(params.discountMin);
	const discountMax = parseDiscount(params.discountMax);
	const toolId = params.toolId;

	const filters: ListPromotionsOptions = {
		type: typeFilter,
		search: search || undefined,
		status: statusFilter,
		sort,
		toolId,
		discountMin,
		discountMax,
	};

	const [page, availableTools, counts] = await Promise.all([
		fetchPromotionsPage({ filters, cursor: null }),
		getToolOptions(),
		getPromotionStatusCounts(),
	]);

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="default">
										<Plus aria-hidden className="size-4" />
										Criar
										<ChevronDown aria-hidden className="size-4 opacity-80" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="min-w-56">
								<DropdownMenuItem
									render={
										<Link href="/dashboard/promotions/new?type=promotion" />
									}
								>
									<Tag aria-hidden className="size-4 text-muted-foreground" />
									<span className="flex flex-col">
										Promoção automática
										<span className="text-muted-foreground text-xs">
											Desconto direto no preço
										</span>
									</span>
								</DropdownMenuItem>
								<DropdownMenuItem
									render={
										<Link href="/dashboard/promotions/new?type=promocode" />
									}
								>
									<Ticket
										aria-hidden
										className="size-4 text-muted-foreground"
									/>
									<span className="flex flex-col">
										Cupom
										<span className="text-muted-foreground text-xs">
											Código aplicado no checkout
										</span>
									</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null
				}
				description="Gerencie promoções automáticas e cupons aplicados a ferramentas específicas."
				title="Promoções"
			/>

			<Tabs value={statusFilter}>
				<TabsList scrollable>
					{STATUS_TABS.map((t) => (
						<TabsTrigger
							key={t.value}
							nativeButton={false}
							render={<Link href={buildStatusHref(params, t.value)} />}
							value={t.value}
						>
							{t.label}
							<TabsCountBadge value={counts[t.value]} />
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<PromotionsFilters availableTools={availableTools} />

			<PromotionsGrid
				filters={filters}
				initial={page.items}
				initialCursor={page.nextCursor}
			/>
		</>
	);
}

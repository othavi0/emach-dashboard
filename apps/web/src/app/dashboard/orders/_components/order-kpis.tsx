import { Card, CardContent } from "@emach/ui/components/card";
import { Separator } from "@emach/ui/components/separator";
import {
	ArrowRightIcon,
	BanIcon,
	CheckCheckIcon,
	CheckIcon,
	ClockIcon,
	PackageIcon,
	TrendingDownIcon,
	TrendingUpIcon,
	TruckIcon,
} from "lucide-react";
import Link from "next/link";

import type { OrderKpis } from "../data";
import { ORDER_TABS } from "../status-meta";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const PERCENT = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
});

const DELTA = new Intl.NumberFormat("pt-BR", {
	maximumFractionDigits: 1,
	minimumFractionDigits: 0,
	signDisplay: "always",
});

const COUNT = new Intl.NumberFormat("pt-BR");

const LABEL_CLASS =
	"text-[11px] uppercase tracking-widest font-medium text-muted-foreground";

// Tab label per key — single source of truth in status-meta.ts.
const TAB_LABEL: Record<string, string> = Object.fromEntries(
	ORDER_TABS.map((tab) => [tab.key, tab.label])
);

// Visual overlay (icon + role color) per funnel stage, in pipeline order.
// `key` maps to a tab key in getOrdersTabCounts; labels come from ORDER_TABS
// and hrefs are derived from the key — nothing about status is hardcoded here.
const FUNNEL_STAGES = [
	{
		key: "pending_payment",
		icon: ClockIcon,
		colorClass: "text-warning",
		bgClass: "bg-warning/10",
	},
	{
		key: "paid",
		icon: CheckIcon,
		colorClass: "text-success",
		bgClass: "bg-success/10",
	},
	{
		key: "preparing",
		icon: PackageIcon,
		colorClass: "text-info",
		bgClass: "bg-info/10",
	},
	{
		key: "shipped",
		icon: TruckIcon,
		colorClass: "text-info",
		bgClass: "bg-info/10",
	},
	{
		key: "delivered",
		icon: CheckCheckIcon,
		colorClass: "text-success",
		bgClass: "bg-success/10",
	},
] as const;

const CANCELED_STAGE = {
	key: "canceled",
	icon: BanIcon,
	colorClass: "text-destructive",
	bgClass: "bg-destructive/10",
} as const;

function tabHref(key: string): string {
	return `/dashboard/orders?tab=${key}`;
}

interface StageLinkProps {
	bgClass: string;
	colorClass: string;
	count: number;
	icon: typeof ClockIcon;
	label: string;
	/** When the stage represents a negative outcome, a non-zero count uses the role color. */
	negativeCount?: boolean;
	tabKey: string;
}

/** A single funnel/pipeline stage: icon badge + label + count, linking to its tab. */
function StageLink({
	bgClass,
	colorClass,
	count,
	icon: Icon,
	label,
	negativeCount = false,
	tabKey,
}: StageLinkProps) {
	let countClass = "text-muted-foreground";
	if (count > 0) {
		countClass = negativeCount ? colorClass : "text-foreground";
	}

	return (
		<Link
			aria-label={`${label}: ${COUNT.format(count)} pedidos`}
			className={`group flex min-w-0 flex-1 flex-col gap-1 rounded-md p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${count === 0 ? "opacity-50" : ""}`}
			href={tabHref(tabKey)}
		>
			<div className="flex items-center gap-1.5">
				<span
					aria-hidden="true"
					className={`inline-flex size-5 shrink-0 items-center justify-center rounded-sm ${bgClass}`}
				>
					<Icon className={`size-3 ${colorClass}`} />
				</span>
				<span className={`truncate ${LABEL_CLASS}`}>{label}</span>
			</div>
			<span
				className={`font-medium text-xl tabular-nums tracking-tight ${countClass}`}
			>
				{COUNT.format(count)}
			</span>
		</Link>
	);
}

interface OrderKpisRowProps {
	counts: Record<string, number>;
	kpis: OrderKpis;
}

export function OrderKpisRow({ counts, kpis }: OrderKpisRowProps) {
	const deltaPercent =
		kpis.revenueYesterday > 0
			? ((kpis.revenueToday - kpis.revenueYesterday) / kpis.revenueYesterday) *
				100
			: null;

	const isPositive = deltaPercent !== null && deltaPercent >= 0;

	let deltaColorClass = "text-muted-foreground";
	if (deltaPercent !== null) {
		deltaColorClass = isPositive ? "text-success" : "text-destructive";
	}

	let DeltaIcon: typeof TrendingUpIcon | null = null;
	if (deltaPercent !== null) {
		DeltaIcon = isPositive ? TrendingUpIcon : TrendingDownIcon;
	}

	const deltaLabel =
		deltaPercent === null
			? "sem dados de ontem"
			: `${DELTA.format(deltaPercent)}% vs ontem`;

	// Sum of the stages actually shown in the funnel, so the header total always
	// matches the cards (the DB-wide all_count includes statuses not charted here).
	const totalActive = [...FUNNEL_STAGES, CANCELED_STAGE].reduce(
		(sum, stage) => sum + (counts[stage.key] ?? 0),
		0
	);

	return (
		<div className="flex flex-col gap-3">
			{/* Funnel — pipeline de status */}
			<Card>
				<CardContent className="p-4">
					<div className="mb-3 flex items-center justify-between">
						<p className={LABEL_CLASS}>Funil de pedidos</p>
						<span className="text-muted-foreground text-xs tabular-nums">
							{COUNT.format(totalActive)} no total
						</span>
					</div>

					<div className="flex flex-wrap items-stretch gap-1 sm:flex-nowrap">
						{FUNNEL_STAGES.map((stage, index) => {
							const isLast = index === FUNNEL_STAGES.length - 1;

							return (
								<div
									className="flex min-w-0 flex-1 items-stretch"
									key={stage.key}
								>
									<StageLink
										bgClass={stage.bgClass}
										colorClass={stage.colorClass}
										count={counts[stage.key] ?? 0}
										icon={stage.icon}
										label={TAB_LABEL[stage.key] ?? stage.key}
										tabKey={stage.key}
									/>

									{!isLast && (
										<div className="flex shrink-0 items-center px-0.5">
											<ArrowRightIcon
												aria-hidden="true"
												className="size-3 text-border"
											/>
										</div>
									)}
								</div>
							);
						})}

						{/* Separator before terminal (canceled) stage */}
						<div
							aria-hidden="true"
							className="flex shrink-0 items-center px-1.5"
						>
							<Separator className="h-8" orientation="vertical" />
						</div>

						{/* Canceled — terminal negative */}
						<div className="flex min-w-0 flex-1 items-stretch">
							<StageLink
								bgClass={CANCELED_STAGE.bgClass}
								colorClass={CANCELED_STAGE.colorClass}
								count={counts[CANCELED_STAGE.key] ?? 0}
								icon={CANCELED_STAGE.icon}
								label={TAB_LABEL[CANCELED_STAGE.key] ?? CANCELED_STAGE.key}
								negativeCount
								tabKey={CANCELED_STAGE.key}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Revenue KPIs */}
			<div className="grid gap-3 sm:grid-cols-3">
				{/* Receita hoje */}
				<Card>
					<CardContent className="p-4">
						<p className={`mb-2 ${LABEL_CLASS}`}>Receita hoje</p>
						<p className="font-medium text-2xl tabular-nums tracking-tight">
							{CURRENCY.format(kpis.revenueToday)}
						</p>
						<div
							className={`mt-1 flex items-center gap-1 text-xs ${deltaColorClass}`}
						>
							{DeltaIcon && (
								<DeltaIcon aria-hidden="true" className="size-3 shrink-0" />
							)}
							<span>{deltaLabel}</span>
						</div>
					</CardContent>
				</Card>

				{/* Ticket médio */}
				<Card>
					<CardContent className="p-4">
						<p className={`mb-2 ${LABEL_CLASS}`}>Ticket médio</p>
						<p className="font-medium text-2xl tabular-nums tracking-tight">
							{CURRENCY.format(kpis.averageTicket)}
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							últimos 30 dias
						</p>
					</CardContent>
				</Card>

				{/* % Pagos */}
				<Card>
					<CardContent className="p-4">
						<p className={`mb-2 ${LABEL_CLASS}`}>Taxa de pagamento</p>
						<p className="font-medium text-2xl tabular-nums tracking-tight">
							{PERCENT.format(kpis.paidPercent)}%
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							pedidos pagos — últimos 30 dias
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

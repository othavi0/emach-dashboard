"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { useRouter } from "next/navigation";

import { formatDate } from "@/lib/format/datetime";
import { getInitials } from "@/lib/format/name";
import type { CustomerListItem } from "../data";

const NUMBER_FORMATTER = new Intl.NumberFormat("pt-BR");
const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelativeDate(value: Date) {
	const diffMs = value.getTime() - Date.now();
	const diffDays = Math.round(diffMs / 86_400_000);

	let relative: string;
	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			const diffMinutes = Math.round(diffMs / 60_000);
			relative = RELATIVE_FORMATTER.format(diffMinutes, "minute");
		} else {
			relative = RELATIVE_FORMATTER.format(diffHours, "hour");
		}
	} else {
		relative = RELATIVE_FORMATTER.format(diffDays, "day");
	}
	return relative.charAt(0).toUpperCase() + relative.slice(1);
}

const CLIENT_STATUS_CONFIG: Record<
	string,
	{ label: string; variant: "secondary" | "destructive" | "success" }
> = {
	active: { label: "Ativo", variant: "success" },
	inactive: { label: "Inativo", variant: "secondary" },
	blocked: { label: "Bloqueado", variant: "destructive" },
};

const CLIENT_TYPE_CONFIG: Record<
	string,
	{ label: string; variant: "info" | "warning" }
> = {
	b2c: { label: "B2C", variant: "info" },
	b2b: { label: "B2B", variant: "warning" },
};

interface CustomerRowProps {
	customer: CustomerListItem;
}

export function CustomerRow({ customer }: CustomerRowProps) {
	const router = useRouter();
	const detailHref = `/dashboard/customers/${customer.id}`;
	const statusConfig = CLIENT_STATUS_CONFIG[customer.status];
	const typeConfig = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			aria-label={`Ver cliente ${customer.name}`}
			className={`group grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 rounded-[10px] border border-border bg-card px-3.5 py-2.5 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_72px_auto] lg:grid-cols-[minmax(240px,1.3fr)_minmax(72px,0.5fr)_minmax(100px,0.5fr)_minmax(88px,0.5fr)_minmax(80px,0.5fr)_110px] ${customer.status === "blocked" ? "opacity-70" : ""}`}
			onClick={() => router.push(detailHref)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(detailHref);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				<Avatar className="size-9 flex-shrink-0 rounded-md">
					{customer.image && (
						<AvatarImage alt={customer.name} src={customer.image} />
					)}
					<AvatarFallback className="rounded-md bg-muted font-bold text-[13px]">
						{getInitials(customer.name)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-foreground text-sm leading-tight">
						{customer.name}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{customer.email}
					</p>
				</div>
			</div>

			<div className="hidden flex-col sm:flex">
				<span className="font-bold text-[15px] text-foreground tabular-nums">
					{NUMBER_FORMATTER.format(customer.ordersCount)}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Pedidos
				</span>
			</div>

			<div className="hidden flex-col lg:flex">
				<span className="font-semibold text-[13px] text-foreground">
					{customer.lastOrderAt ? (
						<Tooltip>
							<TooltipTrigger
								render={<span>{formatRelativeDate(customer.lastOrderAt)}</span>}
							/>
							<TooltipContent>
								{formatDate(customer.lastOrderAt)}
							</TooltipContent>
						</Tooltip>
					) : (
						"—"
					)}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Último pedido
				</span>
			</div>

			<div className="hidden flex-col lg:flex">
				<span className="font-semibold text-[13px] text-foreground tabular-nums">
					{formatDate(customer.createdAt)}
				</span>
				<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
					Desde
				</span>
			</div>

			<div className="hidden lg:flex">
				{typeConfig && (
					<Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
				)}
			</div>

			<div className="flex justify-end">
				{statusConfig && (
					<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
				)}
			</div>
		</div>
	);
}

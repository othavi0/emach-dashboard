"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { formatDate, formatMonthYearShort } from "@/lib/format/datetime";
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

	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			const diffMinutes = Math.round(diffMs / 60_000);
			return RELATIVE_FORMATTER.format(diffMinutes, "minute");
		}
		return RELATIVE_FORMATTER.format(diffHours, "hour");
	}
	return RELATIVE_FORMATTER.format(diffDays, "day");
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

interface CustomerCardProps {
	customer: CustomerListItem;
}

export function CustomerCard({ customer }: CustomerCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/customers/${customer.id}`;
	const editHref = `/dashboard/customers/${customer.id}?edit=1`;
	const statusConfig = CLIENT_STATUS_CONFIG[customer.status];
	const typeConfig = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			aria-label={`Ver cliente ${customer.name}`}
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${customer.status === "blocked" ? "opacity-70" : ""}`}
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
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<Avatar className="size-12 flex-shrink-0 rounded-md">
					{customer.image && (
						<AvatarImage alt={customer.name} src={customer.image} />
					)}
					<AvatarFallback className="rounded-md bg-muted font-bold text-[17px]">
						{getInitials(customer.name)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[15px] text-foreground leading-tight">
						{customer.name}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{customer.email}
					</p>
				</div>
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: stopPropagation para isolar link de edição do card clicável (padrão DESIGN.md §4) */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation para isolar link de edição do card clicável (padrão DESIGN.md §4) */}
				<div
					className="flex shrink-0 items-center gap-1"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<Link
						aria-label={`Editar cliente ${customer.name}`}
						className={`${buttonVariants({ size: "icon-sm", variant: "ghost" })} border border-border bg-muted`}
						href={editHref}
					>
						<Pencil aria-hidden className="size-4" />
					</Link>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
				{statusConfig && (
					<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
				)}
				{typeConfig && (
					<Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
				)}
				<span className="flex-1" />
				<Badge variant={customer.emailVerified ? "success" : "secondary"}>
					{customer.emailVerified ? "✓" : "✗"} Email
				</Badge>
				<Badge variant={customer.document ? "success" : "secondary"}>
					{customer.document ? "✓" : "—"} Doc
				</Badge>
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[18px] text-foreground tabular-nums">
						{NUMBER_FORMATTER.format(customer.ordersCount)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Pedidos
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-2.5">
					<span className="font-bold text-[13px] text-foreground">
						{customer.lastOrderAt ? (
							<Tooltip>
								<TooltipTrigger
									render={
										<span>{formatRelativeDate(customer.lastOrderAt)}</span>
									}
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
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[13px] text-foreground">
						{formatMonthYearShort(customer.createdAt)}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Cliente desde
					</span>
				</div>
			</div>
		</div>
	);
}

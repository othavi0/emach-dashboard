import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { EyeIcon, PencilIcon } from "lucide-react";
import Link from "next/link";
import { formatDocument } from "@/lib/cpf-cnpj";
import type { CustomerListItem } from "../data";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
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

const WHITESPACE_RE = /\s+/;

function getInitials(name: string) {
	const parts = name.trim().split(WHITESPACE_RE);
	if (parts.length === 1) {
		return (parts[0]?.slice(0, 2) ?? "").toUpperCase();
	}
	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

const CLIENT_STATUS_CONFIG: Record<
	string,
	{
		label: string;
		variant: "default" | "secondary" | "destructive" | "success";
	}
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

interface CustomerTableProps {
	items: CustomerListItem[];
}

export function CustomerTable({ items }: CustomerTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Cliente</TableHead>
					<TableHead>Documento</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead className="text-right">LTV</TableHead>
					<TableHead className="text-right">Pedidos</TableHead>
					<TableHead>Último pedido</TableHead>
					<TableHead className="w-20 text-right">Ações</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => {
					const statusConfig = CLIENT_STATUS_CONFIG[item.status];
					const typeConfig = item.clientType
						? CLIENT_TYPE_CONFIG[item.clientType]
						: null;

					return (
						<TableRow key={item.id}>
							<TableCell>
								<div className="flex items-center gap-2">
									<Avatar size="sm">
										{item.image && (
											<AvatarImage alt={item.name} src={item.image} />
										)}
										<AvatarFallback>{getInitials(item.name)}</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="max-w-[160px] truncate font-medium text-sm leading-none">
											{item.name}
										</span>
										<span className="max-w-[160px] truncate text-muted-foreground text-xs">
											{item.email}
										</span>
									</div>
								</div>
							</TableCell>
							<TableCell className="font-mono text-muted-foreground text-xs">
								{item.document ? formatDocument(item.document) : "—"}
							</TableCell>
							<TableCell>
								{statusConfig ? (
									<Badge variant={statusConfig.variant}>
										{statusConfig.label}
									</Badge>
								) : (
									<span className="text-muted-foreground text-sm">—</span>
								)}
							</TableCell>
							<TableCell>
								{typeConfig ? (
									<Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
								) : (
									<span className="text-muted-foreground text-sm">—</span>
								)}
							</TableCell>
							<TableCell className="text-right font-mono text-sm">
								{CURRENCY_FORMATTER.format(item.ltv)}
							</TableCell>
							<TableCell className="text-right text-sm">
								{Intl.NumberFormat("pt-BR").format(item.ordersCount)}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{item.lastOrderAt ? (
									<Tooltip>
										<TooltipTrigger
											render={
												<span>{formatRelativeDate(item.lastOrderAt)}</span>
											}
										/>
										<TooltipContent>
											{DATE_FORMATTER.format(item.lastOrderAt)}
										</TooltipContent>
									</Tooltip>
								) : (
									"—"
								)}
							</TableCell>
							<TableCell>
								<div className="flex items-center justify-end gap-1">
									<Link
										aria-label={`Ver cliente ${item.name}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "secondary",
										})}
										href={`/dashboard/customers/${item.id}`}
									>
										<EyeIcon aria-hidden className="size-3.5" />
									</Link>
									<Link
										aria-label={`Editar cliente ${item.name}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "secondary",
										})}
										href={`/dashboard/customers/${item.id}?edit=1`}
									>
										<PencilIcon aria-hidden className="size-3.5" />
									</Link>
								</div>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

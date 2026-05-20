import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { PencilIcon } from "lucide-react";
import Link from "next/link";

import type { CustomerDetail } from "../data";
import { ResetPasswordDialog } from "./reset-password-dialog";

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
	b2c: { label: "Pessoa Física (B2C)", variant: "info" },
	b2b: { label: "Pessoa Jurídica (B2B)", variant: "warning" },
};

interface CustomerHeaderProps {
	canEdit: boolean;
	canResetPassword: boolean;
	customer: CustomerDetail;
}

export function CustomerHeader({
	customer,
	canEdit,
	canResetPassword,
}: CustomerHeaderProps) {
	const statusConfig = CLIENT_STATUS_CONFIG[customer.status];
	const typeConfig = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div className="flex items-start gap-4">
				<Avatar size="lg">
					{customer.image && (
						<AvatarImage alt={customer.name} src={customer.image} />
					)}
					<AvatarFallback>{getInitials(customer.name)}</AvatarFallback>
				</Avatar>

				<div className="flex flex-col gap-1.5">
					<h1 className="font-medium font-serif text-3xl leading-tight tracking-tight">
						{customer.name}
					</h1>
					<p className="text-muted-foreground text-sm">{customer.email}</p>
					<p className="text-muted-foreground text-xs">
						Cadastrado em{" "}
						{new Intl.DateTimeFormat("pt-BR", {
							day: "2-digit",
							month: "2-digit",
							year: "numeric",
						}).format(customer.createdAt)}{" "}
						·{" "}
						{Math.floor(
							(Date.now() - customer.createdAt.getTime()) / 86_400_000
						)}{" "}
						dias como cliente
					</p>

					<div className="flex flex-wrap items-center gap-1.5">
						{statusConfig && (
							<Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
						)}
						{typeConfig && (
							<Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
						)}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				{canEdit && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href={`/dashboard/customers/${customer.id}?tab=perfil&edit=1`}
					>
						<PencilIcon aria-hidden className="mr-1.5 size-4" />
						Editar
					</Link>
				)}

				{canResetPassword && (
					<ResetPasswordDialog
						clientId={customer.id}
						clientName={customer.name}
					/>
				)}
			</div>
		</div>
	);
}

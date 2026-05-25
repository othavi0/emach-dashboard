"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Crown,
	type LucideIcon,
	Shield,
	ShieldCheck,
	UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type { UserListRow } from "../data";

const ROLE_META: Record<
	UserListRow["role"],
	{ icon: LucideIcon; avatarBg: string; avatarText: string; iconColor: string }
> = {
	super_admin: {
		icon: Crown,
		avatarBg: "bg-amber-950",
		avatarText: "text-amber-400",
		iconColor: "text-amber-400",
	},
	admin: {
		icon: ShieldCheck,
		avatarBg: "bg-blue-950",
		avatarText: "text-blue-400",
		iconColor: "text-blue-400",
	},
	manager: {
		icon: Shield,
		avatarBg: "bg-green-950",
		avatarText: "text-green-400",
		iconColor: "text-green-400",
	},
	user: {
		icon: UserRound,
		avatarBg: "bg-muted",
		avatarText: "text-muted-foreground",
		iconColor: "text-muted-foreground",
	},
};

const STATUS_VARIANT: Record<
	UserListRow["status"],
	"success" | "warning" | "destructive"
> = {
	active: "success",
	pending: "warning",
	suspended: "destructive",
};

const STATUS_LABEL: Record<UserListRow["status"], string> = {
	active: "Ativo",
	pending: "Pendente",
	suspended: "Suspenso",
};

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const absDays = Math.abs(diffMs) / 86_400_000;
	if (absDays < 1) {
		const absHours = Math.abs(diffMs) / 3_600_000;
		if (absHours < 1) {
			return RELATIVE.format(Math.round(diffMs / 60_000), "minute");
		}
		return RELATIVE.format(Math.round(diffMs / 3_600_000), "hour");
	}
	const diffDays = Math.round(diffMs / 86_400_000);
	if (absDays < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	return RELATIVE.format(Math.round(diffDays / 30), "month");
}

function initials(name: string): string {
	const parts = name.split(" ").filter(Boolean);
	const first = parts[0]?.[0]?.toUpperCase() ?? "";
	const last = parts.length > 1 ? (parts.at(-1)?.[0]?.toUpperCase() ?? "") : "";
	return first + last || "?";
}

const MAX_BRANCH_CHIPS = 3;

interface UserCardProps {
	user: UserListRow;
}

export function UserCard({ user }: UserCardProps) {
	const router = useRouter();
	const role = ROLE_META[user.role];
	const RoleIcon = role.icon;

	return (
		<div
			className="group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => router.push(`/dashboard/users/${user.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/users/${user.id}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			{/* Header: avatar + nome + role icon + status badge */}
			<div className="flex items-start gap-3">
				<div
					className={`flex size-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] font-bold text-[18px] ${role.avatarBg} ${role.avatarText}`}
				>
					{user.image ? (
						// biome-ignore lint/performance/noImgElement: avatar do usuário
						// biome-ignore lint/correctness/useImageSize: tamanho fixo via Tailwind
						<img alt="" className="size-full object-cover" src={user.image} />
					) : (
						initials(user.name)
					)}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<RoleIcon
							aria-hidden
							className={`size-3.5 flex-shrink-0 ${role.iconColor}`}
						/>
						<span className="truncate font-semibold text-[14px] text-foreground leading-tight">
							{user.name}
						</span>
					</div>
					<p className="truncate text-muted-foreground text-xs">{user.email}</p>
				</div>
				<Badge className="flex-shrink-0" variant={STATUS_VARIANT[user.status]}>
					{STATUS_LABEL[user.status]}
				</Badge>
			</div>

			{/* Chips de filiais */}
			<div className="flex flex-wrap gap-1">
				{user.branchNames.length > 0 ? (
					<>
						{user.branchNames.slice(0, MAX_BRANCH_CHIPS).map((b) => (
							<span
								className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
								key={b}
							>
								{b}
							</span>
						))}
						{user.branchNames.length > MAX_BRANCH_CHIPS && (
							<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
								+{user.branchNames.length - MAX_BRANCH_CHIPS}
							</span>
						)}
					</>
				) : (
					<span className="text-[11px] text-muted-foreground/60">
						Sem filial
					</span>
				)}
			</div>

			{/* Footer */}
			<div className="border-border border-t pt-3">
				<span className="text-muted-foreground text-xs">
					{user.lastLoginAt
						? `Login ${formatRelative(user.lastLoginAt)}`
						: "Nunca logou"}
				</span>
			</div>
		</div>
	);
}

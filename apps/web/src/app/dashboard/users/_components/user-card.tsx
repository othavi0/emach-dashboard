"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getInitials } from "@/lib/format/name";
import { formatRelative } from "@/lib/format/relative";
import type { UserListRow } from "../data";
import { ApprovalSheet } from "./approval-sheet";
import type { BranchLite } from "./types";

const ROLE_LABEL: Record<UserListRow["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Gerente",
	user: "Usuário",
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

const MAX_BRANCH_CHIPS = 3;

interface UserCardProps {
	actorRole: UserListRow["role"];
	branches: BranchLite[];
	onResolved?: (userId: string) => void;
	user: UserListRow;
}

export function UserCard({
	user,
	branches,
	onResolved,
	actorRole,
}: UserCardProps) {
	const router = useRouter();
	const [approving, setApproving] = useState(false);

	return (
		<>
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
				{/* Header: avatar + nome + email + status badge */}
				<div className="flex items-start gap-3">
					<div className="flex size-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted font-bold text-[18px] text-foreground">
						{user.image ? (
							// biome-ignore lint/performance/noImgElement: avatar do usuário
							// biome-ignore lint/correctness/useImageSize: tamanho fixo via Tailwind
							<img alt="" className="size-full object-cover" src={user.image} />
						) : (
							getInitials(user.name)
						)}
					</div>
					<div className="min-w-0 flex-1">
						<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
							{user.name}
						</span>
						<p className="truncate text-muted-foreground text-xs">
							{user.email}
						</p>
					</div>
					<Badge
						className="flex-shrink-0"
						variant={STATUS_VARIANT[user.status]}
					>
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
				<div className="flex items-center justify-between gap-2 border-border border-t pt-3">
					<span className="text-muted-foreground text-xs">
						<span className="font-semibold text-foreground">
							{ROLE_LABEL[user.role]}
						</span>
						<span aria-hidden className="mx-1.5">
							·
						</span>
						{user.lastLoginAt
							? `Login ${formatRelative(user.lastLoginAt)}`
							: "Nunca logou"}
					</span>
					{user.status === "pending" && (
						<Button
							onClick={(e) => {
								e.stopPropagation();
								setApproving(true);
							}}
							size="sm"
							variant="default"
						>
							Aprovar
						</Button>
					)}
				</div>
			</div>
			<ApprovalSheet
				actorRole={actorRole}
				branches={branches}
				onClose={() => setApproving(false)}
				onResolved={onResolved ? () => onResolved(user.id) : undefined}
				user={approving ? user : null}
			/>
		</>
	);
}

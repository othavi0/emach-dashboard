"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Loader2, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { unlinkUserFromBranchAction } from "../../actions";
import type { BranchTeamRow } from "../../data";

const ROLE_LABEL: Record<BranchTeamRow["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Gerente",
	user: "Usuário",
};

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

interface Props {
	branchId: string;
	members: BranchTeamRow[];
}

export function TeamList({ branchId, members }: Props) {
	const router = useRouter();
	const [unlinking, setUnlinking] = useState<string | null>(null);

	async function handleUnlink(userId: string, name: string) {
		setUnlinking(userId);
		try {
			const result = await unlinkUserFromBranchAction({ branchId, userId });
			if (result.ok) {
				toast.success(`${name} desvinculado da filial.`);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		} finally {
			setUnlinking(null);
		}
	}

	if (members.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-12 text-center">
				<Users
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Nenhum membro vinculado</p>
				<p className="text-muted-foreground text-xs">
					Use o botão acima para vincular usuários a esta filial.
				</p>
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Membros ({members.length})</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<ul>
					{members.map((member, idx) => (
						<li
							className={
								idx < members.length - 1 ? "border-border border-b" : ""
							}
							key={member.userId}
						>
							<div className="flex items-center gap-3 px-6 py-3">
								<Link
									className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
									href={`/dashboard/users/${member.userId}`}
								>
									<Avatar className="size-8 shrink-0">
										{member.image ? (
											<AvatarImage alt="" src={member.image} />
										) : null}
										<AvatarFallback className="bg-muted text-xs">
											{getInitials(member.name)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">
											{member.name}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{member.email}
										</p>
									</div>
									<div className="flex shrink-0 items-center gap-3">
										<Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
										<span className="hidden text-muted-foreground text-xs tabular-nums sm:inline">
											Vinculado em {formatDate(member.linkedAt)}
										</span>
									</div>
								</Link>
								<button
									aria-label={`Desvincular ${member.name}`}
									className="ml-1 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
									disabled={unlinking === member.userId}
									onClick={() => handleUnlink(member.userId, member.name)}
									type="button"
								>
									{unlinking === member.userId ? (
										<Loader2 aria-hidden className="size-4 animate-spin" />
									) : (
										<X aria-hidden className="size-4" />
									)}
								</button>
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}

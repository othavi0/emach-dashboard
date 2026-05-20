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
import { Users } from "lucide-react";
import Link from "next/link";
import type { BranchTeamRow } from "../../data";
import { TeamLinkPanel } from "./team-link-panel";

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
	team: BranchTeamRow[];
}

export function TeamTab({ branchId, team }: Props) {
	return (
		<div className="flex flex-col gap-6">
			<TeamLinkPanel branchId={branchId} />

			{team.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-12 text-center">
					<Users
						aria-hidden
						className="size-12 text-muted-foreground opacity-40"
					/>
					<p className="font-medium text-sm">Nenhum membro vinculado</p>
					<p className="text-muted-foreground text-xs">
						Use o painel acima para vincular usuários a esta filial.
					</p>
				</div>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Membros ({team.length})</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<ul>
							{team.map((member, idx) => (
								<li
									className={
										idx < team.length - 1 ? "border-border border-b" : ""
									}
									key={member.userId}
								>
									<Link
										className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/40"
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
											<Badge variant="secondary">
												{ROLE_LABEL[member.role]}
											</Badge>
											<span className="hidden text-muted-foreground text-xs tabular-nums sm:inline">
												Vinculado em {formatDate(member.linkedAt)}
											</span>
										</div>
									</Link>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

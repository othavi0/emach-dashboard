import { Users } from "lucide-react";
import type { BranchTeamRow } from "../../data";
import { TeamMemberCard } from "./team-member-card";

interface Props {
	branchId: string;
	members: BranchTeamRow[];
}

export function TeamGrid({ branchId, members }: Props) {
	if (members.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Users
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Nenhum membro vinculado</p>
				<p className="text-muted-foreground text-xs">
					Use "Vincular usuário" no topo para adicionar membros a esta filial.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{members.map((member) => (
				<TeamMemberCard
					branchId={branchId}
					key={member.userId}
					member={member}
				/>
			))}
		</div>
	);
}

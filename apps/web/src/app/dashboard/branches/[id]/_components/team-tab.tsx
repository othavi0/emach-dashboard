import type { BranchTeamRow } from "../../data";
import { TeamGrid } from "./team-grid";

interface Props {
	branchId: string;
	team: BranchTeamRow[];
}

export function TeamTab({ branchId, team }: Props) {
	return <TeamGrid branchId={branchId} members={team} />;
}

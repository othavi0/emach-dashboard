import { getBranchTeam } from "../../data";
import { TeamGrid } from "./team-grid";

export async function TeamTab({ branchId }: { branchId: string }) {
	const team = await getBranchTeam(branchId);
	return <TeamGrid branchId={branchId} members={team} />;
}

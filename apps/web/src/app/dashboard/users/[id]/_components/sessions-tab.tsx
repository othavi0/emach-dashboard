import { getUserSessions } from "../../data";
import { SessionsList } from "./sessions-list";

export async function SessionsTab({ userId }: { userId: string }) {
	const sessions = await getUserSessions(userId);
	return <SessionsList sessions={sessions} userId={userId} />;
}

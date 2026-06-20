import { redirect } from "next/navigation";
import { can, getUserCapabilities } from "@/lib/permissions";
import { getUserStatus, requireCurrentSession } from "@/lib/session";
import { fetchDashboardCounts } from "../pending-data";
import { AppSidebar } from "./app-sidebar";

/**
 * Dynamic hole do dashboard layout: concentra TUDO que depende da sessão.
 * Renderizado sob <Suspense> no layout (fallback = SidebarSkeleton) pra que o
 * frame do layout prerenderize estático sob cacheComponents (006-B).
 */
export async function DashboardChrome() {
	const session = await requireCurrentSession();
	const status = getUserStatus(session);
	if (status === "pending") {
		redirect("/pending");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}

	const [canManageUsers, capsSet] = await Promise.all([
		can(session, "users.approve"),
		getUserCapabilities(session),
	]);

	// Counts NÃO são aguardados: a promise flui pra sidebar e cada badge a consome
	// sob <Suspense> (use()). fetchDashboardCounts é memoizado por request (cache()).
	const countsPromise = fetchDashboardCounts();

	return (
		<AppSidebar
			canManageUsers={canManageUsers}
			capabilities={[...capsSet]}
			countsPromise={countsPromise}
			user={{
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
				role: session.user.role,
				image: session.user.image,
			}}
		/>
	);
}

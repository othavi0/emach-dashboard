import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, getUserCapabilities } from "@/lib/permissions";
import { getUserStatus, requireCurrentSession } from "@/lib/session";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-cookie";
import { AppSidebar } from "./_components/app-sidebar";
import { fetchDashboardCounts } from "./pending-data";

export const metadata: Metadata = {
	description:
		"Área administrativa privada da Emach Ferramentas para gestão operacional do e-commerce.",
	robots: {
		follow: false,
		index: false,
	},
};

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
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
	const capabilities = [...capsSet];

	// Counts NÃO são aguardados: a promise flui para a sidebar e cada badge a
	// consome sob <Suspense> (use()), permitindo que a casca da nav (que só
	// depende de session+capabilities) renderize imediatamente. fetchDashboardCounts
	// é memoizado por request (cache()), então a page (PendingSection) compartilha
	// a mesma query sem round-trip extra.
	const countsPromise = fetchDashboardCounts();

	const cookieStore = await cookies();
	const sidebarOpen = parseSidebarCookie(
		`${SIDEBAR_COOKIE_NAME}=${cookieStore.get(SIDEBAR_COOKIE_NAME)?.value ?? ""}`
	);

	return (
		<SidebarProvider defaultOpen={sidebarOpen}>
			<AppSidebar
				canManageUsers={canManageUsers}
				capabilities={capabilities}
				countsPromise={countsPromise}
				user={{
					id: session.user.id,
					name: session.user.name,
					email: session.user.email,
					role: session.user.role,
					image: session.user.image,
				}}
			/>
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-serif text-base">emach</span>
				</header>
				<div className="flex w-full flex-col gap-6 px-6 py-6">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}

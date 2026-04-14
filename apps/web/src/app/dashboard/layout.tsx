import { SidebarInset, SidebarProvider } from "@emach/ui/components/sidebar";

import { requireCurrentSession } from "@/lib/session";
import { AppSidebar } from "./_components/app-sidebar";

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireCurrentSession();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>{children}</SidebarInset>
		</SidebarProvider>
	);
}

import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";

import { requireCurrentSession } from "@/lib/session";
import { AppSidebar } from "./_components/app-sidebar";

export default async function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	await requireCurrentSession();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-serif text-base">emach</span>
				</header>
				{children}
			</SidebarInset>
		</SidebarProvider>
	);
}

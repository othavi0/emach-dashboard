import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";
import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { can } from "@/lib/permissions";
import type { UserRole } from "@/lib/session";
import { getUserStatus, requireCurrentSession } from "@/lib/session";
import { AppSidebar } from "./_components/app-sidebar";

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

	const role = (session.user.role ?? "user") as UserRole;
	const canManageUsers = can(role, "users.approve");
	let pendingCount = 0;
	if (canManageUsers) {
		const [row] = await db
			.select({ value: count() })
			.from(userTable)
			.where(eq(userTable.status, "pending"));
		pendingCount = Number(row?.value ?? 0);
	}

	return (
		<SidebarProvider>
			<AppSidebar canManageUsers={canManageUsers} pendingCount={pendingCount} />
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

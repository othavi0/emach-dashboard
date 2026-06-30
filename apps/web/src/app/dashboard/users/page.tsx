import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { InviteDialog } from "./_components/invite-dialog";
import { UsersCardGrid } from "./_components/users-card-grid";
import { UsersFilters } from "./_components/users-filters";
import { fetchUsersPage, getUserKpis, type UserListRow } from "./data";

export const metadata: Metadata = {
	title: "Usuários",
};

type Status = "active" | "pending" | "suspended";

interface PageProps {
	searchParams: Promise<{
		branchId?: string;
		role?: string;
		search?: string;
		status?: string;
	}>;
}

function buildStatusHref(
	sp: Record<string, string | undefined>,
	status: Status
): string {
	const params = new URLSearchParams();
	if (status !== "active") {
		params.set("status", status);
	}
	if (sp.search) {
		params.set("search", sp.search);
	}
	if (sp.role) {
		params.set("role", sp.role);
	}
	if (sp.branchId) {
		params.set("branchId", sp.branchId);
	}
	const qs = params.toString();
	return qs ? `/dashboard/users?${qs}` : "/dashboard/users";
}

export default function UsersPage({ searchParams }: PageProps) {
	return <UsersPageContent searchParams={searchParams} />;
}

async function UsersPageContent({ searchParams }: PageProps) {
	const actorSession = await requireCapabilityOrRedirect("users.manage");
	const sp = await searchParams;

	const scope = await getUserBranchScope(actorSession);

	const status = (sp.status as Status | undefined) ?? "active";
	const filters = {
		status,
		role: sp.role as "super_admin" | "admin" | "user" | undefined,
		branchId: sp.branchId,
		search: sp.search,
		scope,
	};

	const [kpis, page, branches] = await Promise.all([
		getUserKpis(),
		fetchUsersPage(filters),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name)),
	]);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					<InviteDialog
						actorRole={actorSession.user.role as UserListRow["role"]}
						branches={branches}
					/>
				}
				description="Equipe interna do Emach — convites, cargos e filiais."
				title="Usuários"
			/>
			<UsersFilters branches={branches} />
			<Tabs value={status}>
				<TabsList scrollable>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={buildStatusHref(sp, "active")} />}
						value="active"
					>
						Ativos
						<TabsCountBadge value={kpis.active} />
					</TabsTrigger>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={buildStatusHref(sp, "pending")} />}
						value="pending"
					>
						Convidados
						<TabsCountBadge value={kpis.pending} />
					</TabsTrigger>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={buildStatusHref(sp, "suspended")} />}
						value="suspended"
					>
						Suspensos
						<TabsCountBadge value={kpis.suspended} />
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<UsersCardGrid
				filters={filters}
				initialCursor={page.nextCursor}
				initialItems={page.items}
				key={JSON.stringify(filters)}
			/>
		</div>
	);
}

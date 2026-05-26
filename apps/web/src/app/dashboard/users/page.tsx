import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { asc } from "drizzle-orm";
import { Ban, Building2, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { UsersCardGrid } from "./_components/users-card-grid";
import { UsersFilters } from "./_components/users-filters";
import { UsersPendingCard } from "./_components/users-pending-card";
import { fetchUserActivityFeedPage } from "./actions";
import {
	fetchPendingUsersPage,
	fetchUsersPage,
	getRecentUserActivity,
	getUserKpis,
} from "./data";

export const dynamic = "force-dynamic";

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

export default async function UsersPage({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("users.manage");
	const sp = await searchParams;

	const status = (sp.status as Status | undefined) ?? "active";
	const filters = {
		status,
		role: sp.role as "super_admin" | "admin" | "manager" | "user" | undefined,
		branchId: sp.branchId,
		search: sp.search,
	};

	const [kpis, page, pending, activity, branches] = await Promise.all([
		getUserKpis(),
		fetchUsersPage(filters),
		fetchPendingUsersPage(null),
		getRecentUserActivity(8),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name)),
	]);

	const activityEvents = activity.map((a) => ({
		id: a.id,
		kind: "user" as const,
		primary: formatActivityAction(a.action, a.actorName ?? "—"),
		at: a.createdAt,
		href: a.targetId ? `/dashboard/users/${a.targetId}` : undefined,
	}));

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description="Equipe interna do Emach — aprovação, cargos e filiais."
				title="Usuários"
			/>
			<EntityKpisRow
				items={[
					{ label: "Ativos", value: kpis.active, icon: CheckCircle2 },
					{
						label: "Pendentes",
						value: kpis.pending,
						tone: kpis.pending > 0 ? "warning" : "default",
						icon: Clock,
						href: buildStatusHref(sp, "pending"),
					},
					{
						label: "Suspensos",
						value: kpis.suspended,
						tone: kpis.suspended > 0 ? "danger" : "default",
						icon: Ban,
					},
					{
						label: "Filiais cobertas",
						value: kpis.branchesCovered,
						icon: Building2,
					},
				]}
			/>
			<section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<UsersPendingCard
					count={kpis.pending}
					initial={pending.items}
					initialCursor={pending.nextCursor}
				/>
				<ActivityFeed
					emptyMessage="Sem atividade recente de usuários."
					fetchPage={fetchUserActivityFeedPage}
					initialCursor={null}
					initialEvents={activityEvents}
					title="Atividade recente"
				/>
			</section>
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
						Pendentes
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
				branches={branches}
				filters={filters}
				initialCursor={page.nextCursor}
				initialItems={page.items}
				key={JSON.stringify(filters)}
			/>
		</div>
	);
}

function formatActivityAction(action: string, actorName: string): string {
	switch (action) {
		case "user.approved":
			return `${actorName} aprovou usuário`;
		case "user.rejected":
			return `${actorName} rejeitou usuário`;
		case "user.updated":
			return `${actorName} atualizou usuário`;
		case "user.suspended":
			return `${actorName} suspendeu usuário`;
		case "user.reactivated":
			return `${actorName} reativou usuário`;
		case "user.deleted":
			return `${actorName} deletou usuário`;
		case "user.password_reset_triggered":
			return `${actorName} enviou reset de senha`;
		case "user.session_revoked":
			return `${actorName} revogou sessão`;
		case "user.all_sessions_revoked":
			return `${actorName} revogou todas as sessões`;
		case "user.branch_linked":
			return `${actorName} vinculou filial`;
		case "user.branch_unlinked":
			return `${actorName} desvinculou filial`;
		default:
			return `${actorName} — ${action}`;
	}
}

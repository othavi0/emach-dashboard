import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc } from "drizzle-orm";
import {
	Activity,
	Briefcase,
	Lock,
	Monitor,
	ShieldCheck,
	User,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { roleDefaultCapabilities } from "@/lib/capabilities";
import {
	can,
	getUserCapabilities,
	requireUserDetailAccessOrRedirect,
} from "@/lib/permissions";
import { ROLE_WEIGHT, type UserRole } from "@/lib/session";
import type { UserRow } from "../_components/types";
import { UserEditSheet } from "../_components/user-edit-sheet";
import {
	getUserAffectedActivity,
	getUserDetail,
	getUserDetailKpis,
	getUserLinkedBranchesWithStats,
} from "../data";
import { ActivityTab } from "./_components/activity-tab";
import { BranchesTab } from "./_components/branches-tab";
import { EditUserButton } from "./_components/edit-user-button";
import { PermissionsTab } from "./_components/permissions-tab";
import { ProfileTab } from "./_components/profile-tab";
import { SecurityTab } from "./_components/security-tab";
import { SessionsTab } from "./_components/sessions-tab";
import { SuperAdminPermissionsNotice } from "./_components/super-admin-permissions-notice";
import { UserBranchLinkPanel } from "./_components/user-branch-link-panel";
import { UserIdentity } from "./_components/user-identity";
import { getUserOverrides } from "./permissions/data";

export const metadata: Metadata = {
	title: "Detalhe do usuário",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default async function UserDetailPage({
	params,
	searchParams,
}: PageProps) {
	const { id } = await params;
	const sp = await searchParams;
	const actorSession = await requireUserDetailAccessOrRedirect(id);
	const canDelete = await can(actorSession, "users.delete");

	// availableBranches só é usada no painel "Vincular filial" (aba Filiais);
	// evita varrer todas as filiais nas demais abas.
	const onBranchesTab = sp.tab === "branches";
	const [user, kpis, linkedBranches, availableBranches, recentActivity] =
		await Promise.all([
			getUserDetail(id),
			getUserDetailKpis(id),
			getUserLinkedBranchesWithStats(id),
			onBranchesTab
				? db
						.select({ id: branch.id, name: branch.name })
						.from(branch)
						.orderBy(asc(branch.name))
				: Promise.resolve([] as { id: string; name: string }[]),
			getUserAffectedActivity(id, null, 5),
		]);

	if (!user) {
		notFound();
	}

	const linkedIds = new Set(linkedBranches.map((b) => b.id));

	const onPermissionsTab = sp.tab === "permissoes";
	const canManagePermissions = await can(actorSession, "permissions.manage");
	const actorRole = (actorSession.user.role ?? "user") as UserRole;
	// Espelha assertManageableTarget (servidor): nunca si mesmo; super_admin
	// gerencia qualquer outro; admin só quem está estritamente abaixo na
	// hierarquia (ROLE_WEIGHT). Mantém a UI alinhada ao que a action aceita —
	// sem aba "morta" (self / role igual).
	const targetManageable =
		canManagePermissions &&
		actorSession.user.id !== user.id &&
		(actorRole === "super_admin" ||
			ROLE_WEIGHT[actorRole] > ROLE_WEIGHT[user.role as UserRole]);

	let permissionsTabContent: ReactNode = null;
	if (targetManageable && onPermissionsTab) {
		if (user.role === "super_admin") {
			// Camada 3 (issue #184): overrides não se aplicam a super_admin — sem grid.
			permissionsTabContent = <SuperAdminPermissionsNotice />;
		} else {
			const [overrides, actorCaps] = await Promise.all([
				getUserOverrides(user.id),
				getUserCapabilities(actorSession),
			]);
			permissionsTabContent = (
				<PermissionsTab
					manageableCaps={[...actorCaps]}
					overrides={[...overrides.entries()]}
					roleDefaults={[...roleDefaultCapabilities(user.role as UserRole)]}
					targetUserId={user.id}
				/>
			);
		}
	}

	const tabs: EntityTab[] = [
		{
			value: "profile",
			label: "Perfil",
			icon: <User aria-hidden className="size-3.5" />,
			content: (
				<ProfileTab
					kpis={kpis}
					linkedBranches={linkedBranches}
					recentActivity={recentActivity.items}
					user={user}
				/>
			),
		},
		{
			value: "branches",
			label: "Filiais",
			icon: <Briefcase aria-hidden className="size-3.5" />,
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{linkedBranches.length}
				</span>
			),
			content: <BranchesTab linkedBranches={linkedBranches} userId={user.id} />,
		},
		{
			value: "activity",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			content: sp.tab === "activity" ? <ActivityTab userId={user.id} /> : null,
		},
		{
			value: "sessions",
			label: "Sessões",
			icon: <Monitor aria-hidden className="size-3.5" />,
			content: sp.tab === "sessions" ? <SessionsTab userId={user.id} /> : null,
		},
		{
			value: "security",
			label: "Segurança",
			icon: <Lock aria-hidden className="size-3.5" />,
			content: <SecurityTab canDelete={canDelete} user={user} />,
		},
	];

	if (targetManageable) {
		tabs.push({
			value: "permissoes",
			label: "Permissões",
			icon: <ShieldCheck aria-hidden className="size-3.5" />,
			content: permissionsTabContent,
		});
	}

	let headerAction: ReactNode = null;
	if (!sp.tab || sp.tab === "profile") {
		headerAction = <EditUserButton />;
	} else if (sp.tab === "branches") {
		headerAction = (
			<UserBranchLinkPanel
				options={availableBranches.filter((b) => !linkedIds.has(b.id))}
				userId={user.id}
			/>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<UserIdentity actions={headerAction} user={user} />
			<EntityTabs defaultValue="profile" tabs={tabs} />
			<UserEditSheet
				actorRole={actorSession.user.role as UserRow["role"]}
				user={{
					id: user.id,
					name: user.name,
					role: user.role,
					emailVerified: user.emailVerified,
				}}
			/>
		</div>
	);
}

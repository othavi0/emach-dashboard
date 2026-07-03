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

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { clampInitialTab } from "@/components/entity/tab-url";
import { roleDefaultCapabilities } from "@/lib/capabilities";
import { can, requireUserDetailAccessOrRedirect } from "@/lib/permissions";
import { ROLE_WEIGHT, type UserRole } from "@/lib/session";
import type { UserRow } from "../_components/types";
import { UserEditSheet } from "../_components/user-edit-sheet";
import {
	getUserAffectedActivity,
	getUserDetail,
	getUserDetailKpis,
	getUserLinkedBranchesWithStats,
} from "../data";
import { ActivityTabLoader } from "./_components/activity-tab-loader";
import { BranchesTab } from "./_components/branches-tab";
import { PermissionsTabLoader } from "./_components/permissions-tab-loader";
import { ProfileTab } from "./_components/profile-tab";
import { SecurityTab } from "./_components/security-tab";
import { SessionsTabLoader } from "./_components/sessions-tab-loader";
import { SuperAdminPermissionsNotice } from "./_components/super-admin-permissions-notice";
import { UserDetailActions } from "./_components/user-detail-actions";
import { UserIdentity } from "./_components/user-identity";
import { UserSelfEditSheet } from "./_components/user-self-edit-sheet";

export const metadata: Metadata = {
	title: "Detalhe do usuário",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default function UserDetailPage({ params, searchParams }: PageProps) {
	return <UserDetailPageContent params={params} searchParams={searchParams} />;
}

async function UserDetailPageContent({ params, searchParams }: PageProps) {
	const { id } = await params;
	const sp = await searchParams;
	const actorSession = await requireUserDetailAccessOrRedirect(id);
	const canDelete = await can(actorSession, "users.delete");
	const isSelf = actorSession.user.id === id;
	const [canManageBranches, canResetPassword, canRevokeSessions] =
		await Promise.all([
			can(actorSession, "users.update_branches"),
			can(actorSession, "users.reset_password"),
			can(actorSession, "users.revoke_sessions"),
		]);

	const [user, kpis, linkedBranches, recentActivity] = await Promise.all([
		getUserDetail(id),
		getUserDetailKpis(id),
		getUserLinkedBranchesWithStats(id),
		getUserAffectedActivity(id, null, 5),
	]);

	if (!user) {
		notFound();
	}

	const canManagePermissions = await can(actorSession, "permissions.manage");
	const actorRole = (actorSession.user.role ?? "user") as UserRole;
	// Espelha assertManageableTarget (servidor): nunca si mesmo; super_admin
	// gerencia qualquer outro; admin só quem está estritamente abaixo na
	// hierarquia (ROLE_WEIGHT). Mantém a UI alinhada ao que a action aceita —
	// sem aba "morta" (self / role igual). O servidor decide quais tabs entram.
	const targetManageable =
		canManagePermissions &&
		actorSession.user.id !== user.id &&
		(actorRole === "super_admin" ||
			ROLE_WEIGHT[actorRole] > ROLE_WEIGHT[user.role as UserRole]);

	const tabs: EntityClientTab[] = [
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
			content: (
				<BranchesTab
					canUnlink={canManageBranches && !isSelf}
					linkedBranches={linkedBranches}
					userId={user.id}
				/>
			),
		},
		{
			value: "activity",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ActivityTabLoader userId={user.id} />,
		},
		{
			value: "sessions",
			label: "Sessões",
			icon: <Monitor aria-hidden className="size-3.5" />,
			lazy: true,
			content: <SessionsTabLoader userId={user.id} />,
		},
		{
			value: "security",
			label: "Segurança",
			icon: <Lock aria-hidden className="size-3.5" />,
			content: (
				<SecurityTab
					canDelete={canDelete}
					canResetPassword={canResetPassword}
					canRevokeSessions={canRevokeSessions}
					isSelf={isSelf}
					user={user}
				/>
			),
		},
	];

	if (targetManageable) {
		tabs.push({
			value: "permissoes",
			label: "Permissões",
			icon: <ShieldCheck aria-hidden className="size-3.5" />,
			lazy: true,
			content:
				user.role === "super_admin" ? (
					<SuperAdminPermissionsNotice />
				) : (
					<PermissionsTabLoader
						roleDefaults={[...roleDefaultCapabilities(user.role as UserRole)]}
						targetUserId={user.id}
					/>
				),
		});
	}

	const initialTab = clampInitialTab(sp.tab, tabs, "profile");

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue="profile"
				header={
					<UserIdentity
						actions={
							<UserDetailActions
								canManageBranches={canManageBranches && !isSelf}
								isSelf={isSelf}
								linkedBranchIds={linkedBranches.map((b) => b.id)}
								userId={user.id}
							/>
						}
						user={user}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
			{isSelf ? (
				<UserSelfEditSheet name={user.name} />
			) : (
				<UserEditSheet
					actorRole={actorSession.user.role as UserRow["role"]}
					user={{
						id: user.id,
						name: user.name,
						role: user.role,
						emailVerified: user.emailVerified,
					}}
				/>
			)}
		</div>
	);
}

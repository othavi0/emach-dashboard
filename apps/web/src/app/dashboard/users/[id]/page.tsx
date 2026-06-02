import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc } from "drizzle-orm";
import { Activity, Briefcase, Lock, Monitor, User } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can, requireUserDetailAccessOrRedirect } from "@/lib/permissions";
import type { UserRow } from "../_components/types";
import { UserEditSheet } from "../_components/user-edit-sheet";
import {
	getUserDetail,
	getUserDetailKpis,
	getUserLinkedBranchesWithStats,
} from "../data";
import { ActivityTab } from "./_components/activity-tab";
import { BranchesTab } from "./_components/branches-tab";
import { EditUserButton } from "./_components/edit-user-button";
import { ProfileTab } from "./_components/profile-tab";
import { SecurityTab } from "./_components/security-tab";
import { SessionsTab } from "./_components/sessions-tab";
import { UserBranchLinkPanel } from "./_components/user-branch-link-panel";
import { UserIdentity } from "./_components/user-identity";

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
	const canDelete = can(actorSession.user.role, "users.delete");

	const [user, availableBranches, kpis, linkedBranches] = await Promise.all([
		getUserDetail(id),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name)),
		getUserDetailKpis(id),
		getUserLinkedBranchesWithStats(id),
	]);

	if (!user) {
		notFound();
	}

	const linkedIds = new Set(linkedBranches.map((b) => b.id));

	const tabs: EntityTab[] = [
		{
			value: "profile",
			label: "Perfil",
			icon: <User aria-hidden className="size-3.5" />,
			content: (
				<ProfileTab kpis={kpis} linkedBranches={linkedBranches} user={user} />
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
			content: <ActivityTab userId={user.id} />,
		},
		{
			value: "sessions",
			label: "Sessões",
			icon: <Monitor aria-hidden className="size-3.5" />,
			content: <SessionsTab userId={user.id} />,
		},
		{
			value: "security",
			label: "Segurança",
			icon: <Lock aria-hidden className="size-3.5" />,
			content: <SecurityTab canDelete={canDelete} user={user} />,
		},
	];

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

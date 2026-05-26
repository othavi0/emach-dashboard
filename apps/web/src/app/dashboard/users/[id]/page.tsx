import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc } from "drizzle-orm";
import { Activity, Briefcase, Lock, Monitor, User } from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import type { UserRow } from "../_components/types";
import { UserEditSheet } from "../_components/user-edit-sheet";
import { getUserDetail } from "../data";
import { ActivityTab } from "./_components/activity-tab";
import { BranchesTab } from "./_components/branches-tab";
import { ProfileTab } from "./_components/profile-tab";
import { SecurityTab } from "./_components/security-tab";
import { SessionsTab } from "./_components/sessions-tab";
import { UserActionsMenu } from "./_components/user-actions-menu";
import { UserIdentity } from "./_components/user-identity";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
	const actorSession = await requireCapabilityOrRedirect("users.manage");

	const { id } = await params;

	const [user, availableBranches] = await Promise.all([
		getUserDetail(id),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name)),
	]);

	if (!user) {
		notFound();
	}

	const tabs: EntityTab[] = [
		{
			value: "profile",
			label: "Perfil",
			icon: <User aria-hidden className="size-3.5" />,
			content: <ProfileTab user={user} />,
		},
		{
			value: "branches",
			label: "Filiais",
			icon: <Briefcase aria-hidden className="size-3.5" />,
			content: (
				<BranchesTab availableBranches={availableBranches} user={user} />
			),
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
			content: <SecurityTab user={user} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<UserIdentity
				extraActions={
					<UserActionsMenu
						user={{ id: user.id, name: user.name, status: user.status }}
					/>
				}
				user={user}
			/>
			<EntityTabs defaultValue="profile" tabs={tabs} />
			<UserEditSheet
				// Better Auth infere additionalFields como string; cast pro enum estrito.
				actorRole={actorSession.user.role as UserRow["role"]}
				user={{ id: user.id, name: user.name, role: user.role }}
			/>
		</div>
	);
}

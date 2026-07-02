"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc } from "drizzle-orm";

import type { Capability } from "@/lib/capabilities";
import type { InfiniteResult } from "@/lib/infinite";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import {
	getUserActivity,
	getUserAffectedActivity,
	getUserSessions,
	type UserActivityRow,
} from "../../data";
import { getUserOverrides, type OverrideState } from "../permissions/data";
import { requireUserDetailAccess } from "./access";

export interface UserActivityTabData {
	affecting: InfiniteResult<UserActivityRow & { actorName: string | null }>;
	byUser: InfiniteResult<UserActivityRow>;
}

export async function fetchUserActivityTabAction(
	userId: string
): Promise<UserActivityTabData> {
	await requireUserDetailAccess(userId);
	const [byUser, affecting] = await Promise.all([
		getUserActivity(userId, null, 25),
		getUserAffectedActivity(userId, null, 25),
	]);
	return { byUser, affecting };
}

export async function fetchUserSessionsTabAction(userId: string) {
	await requireUserDetailAccess(userId);
	return await getUserSessions(userId);
}

export interface UserPermissionsTabData {
	actorCaps: Capability[];
	overrides: [Capability, OverrideState][];
}

export async function fetchUserPermissionsTabAction(
	userId: string
): Promise<UserPermissionsTabData> {
	// Mesmo gate que hoje decide targetManageable no page.tsx: permissions.manage
	// + hierarquia (assertManageableTarget dentro de requireCapabilityWithContext).
	const actorSession = await requireCapabilityWithContext(
		"permissions.manage",
		{
			targetUserId: userId,
		}
	);
	const [overrides, actorCaps] = await Promise.all([
		getUserOverrides(userId),
		getUserCapabilities(actorSession),
	]);
	return { overrides: [...overrides.entries()], actorCaps: [...actorCaps] };
}

export async function fetchAvailableBranchesForUserAction(
	userId: string
): Promise<Array<{ id: string; name: string }>> {
	// Mesmo gate que hoje protege a query condicional de availableBranches
	// (onBranchesTab) no page.tsx — a lista em si não é sensível, mas o
	// endpoint precisa do mesmo nível de acesso à página de detalhe.
	await requireUserDetailAccess(userId);
	return await db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.orderBy(asc(branch.name));
}

"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { Capability } from "@/lib/capabilities";
import { fetchUserPermissionsTabAction } from "../_lib/tab-actions";
import { PermissionsTab } from "./permissions-tab";

interface Props {
	roleDefaults: Capability[];
	targetUserId: string;
}

export function PermissionsTabLoader({ targetUserId, roleDefaults }: Props) {
	return (
		<LazyTab load={() => fetchUserPermissionsTabAction(targetUserId)}>
			{(data) => (
				<PermissionsTab
					manageableCaps={data.actorCaps}
					overrides={data.overrides}
					roleDefaults={roleDefaults}
					targetUserId={targetUserId}
				/>
			)}
		</LazyTab>
	);
}

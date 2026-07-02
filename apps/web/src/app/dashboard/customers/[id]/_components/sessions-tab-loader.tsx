"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import { CustomerSessionsTable } from "../../_components/customer-sessions-table";
import type { CustomerSessionRow } from "../../data";
import { fetchCustomerSessionsTabAction } from "../_lib/tab-actions";

interface Props {
	canManage: boolean;
	clientId: string;
}

export function SessionsTabLoader({ canManage, clientId }: Props) {
	return (
		<LazyTab load={() => fetchCustomerSessionsTabAction(clientId)}>
			{(sessions: CustomerSessionRow[]) => (
				<CustomerSessionsTable
					canManage={canManage}
					clientId={clientId}
					sessions={sessions}
				/>
			)}
		</LazyTab>
	);
}

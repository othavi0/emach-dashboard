"use client";

import { useSearchParams } from "next/navigation";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { CustomerAuditRow } from "../../data";
import { fetchCustomerAuditTabAction } from "../_lib/tab-actions";
import { AuditTabClient } from "./audit-tab-client";

export function AuditTabLoader({ clientId }: { clientId: string }) {
	const params = useSearchParams();
	// Deep-link: ?auditAction=status_changed pré-filtra a auditoria.
	const auditAction = params.get("auditAction") ?? undefined;

	return (
		<LazyTab load={() => fetchCustomerAuditTabAction(clientId, auditAction)}>
			{(items: CustomerAuditRow[]) => (
				<AuditTabClient
					clientId={clientId}
					initialAction={auditAction}
					initialItems={items}
				/>
			)}
		</LazyTab>
	);
}

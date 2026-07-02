"use client";

import { useState, useTransition } from "react";
import { CustomerAuditTable } from "../../_components/customer-audit-table";
import type { CustomerAuditRow } from "../../data";
import { fetchCustomerAuditTabAction } from "../_lib/tab-actions";

interface Props {
	clientId: string;
	initialAction?: string;
	initialItems: CustomerAuditRow[];
}

export function AuditTabClient({
	clientId,
	initialAction,
	initialItems,
}: Props) {
	const [items, setItems] = useState(initialItems);
	const [action, setAction] = useState(initialAction);
	const [isPending, startTransition] = useTransition();

	function handleActionChange(next: string | undefined) {
		setAction(next);
		startTransition(async () => {
			const result = await fetchCustomerAuditTabAction(clientId, next);
			setItems(result);
		});
	}

	return (
		<CustomerAuditTable
			currentAction={action}
			isPending={isPending}
			items={items}
			onActionChange={handleActionChange}
		/>
	);
}

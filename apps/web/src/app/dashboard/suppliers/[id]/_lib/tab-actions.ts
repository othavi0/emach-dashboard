"use server";

import { requireCapability } from "@/lib/permissions";
import { getSupplierAuditLog, type SupplierAuditRow } from "../../data";

export async function fetchSupplierHistoryAction(
	supplierId: string
): Promise<SupplierAuditRow[]> {
	await requireCapability("suppliers.read");
	return await getSupplierAuditLog(supplierId);
}

"use server";

import { requireRole } from "@/lib/session";

/**
 * Tool mutation server actions.
 * Bodies populated in T-050 (cavekit-inventory-tools R8).
 * Phase 1 scaffold: guards in place, mutation logic pending.
 */

export async function createTool(_formData: FormData): Promise<void> {
	await requireRole("admin");
	throw new Error("createTool: not yet implemented (T-050)");
}

export async function updateTool(
	_id: string,
	_formData: FormData
): Promise<void> {
	await requireRole("admin");
	throw new Error("updateTool: not yet implemented (T-050)");
}

export async function deleteTool(_id: string): Promise<void> {
	await requireRole("admin");
	throw new Error("deleteTool: not yet implemented (T-050)");
}

"use server";

import { can, requireCapability } from "@/lib/permissions";
import {
	getCarrierZones,
	getToolsForQuote,
	type ToolForQuote,
	type ZoneWithRates,
} from "../../../data";

export async function fetchCarrierZonesAction(
	carrierId: string
): Promise<{ canManage: boolean; zones: ZoneWithRates[] }> {
	const session = await requireCapability("shipping.read");
	const canManage = await can(session, "shipping.manage");
	const zones = await getCarrierZones(carrierId);
	return { canManage, zones };
}

export async function fetchCarrierPreviewToolsAction(): Promise<
	ToolForQuote[]
> {
	await requireCapability("shipping.read");
	return await getToolsForQuote();
}

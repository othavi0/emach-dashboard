"use server";

import { db } from "@emach/db";
import {
	getActiveBoxes,
	getActiveCarriersWithTables,
} from "@emach/db/queries/shipping";
import {
	type QuoteItem,
	type QuoteResult,
	quoteShipping,
} from "@emach/db/queries/shipping-quote";

import { actionErrorMessage } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { requireCapability } from "@/lib/permissions";

export async function previewQuote(input: {
	declaredValue: number;
	destinationCep: string;
	items: QuoteItem[];
}): Promise<ActionResult<QuoteResult>> {
	await requireCapability("shipping.read");
	try {
		const [carriers, boxes] = await Promise.all([
			getActiveCarriersWithTables(db),
			getActiveBoxes(db),
		]);
		const result = quoteShipping({ ...input, carriers, boxes });
		return { ok: true, data: result };
	} catch (error) {
		return { ok: false, error: actionErrorMessage(error) };
	}
}

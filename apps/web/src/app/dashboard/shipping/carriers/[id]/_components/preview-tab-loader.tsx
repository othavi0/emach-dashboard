"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { ToolForQuote } from "../../../data";
import { fetchCarrierPreviewToolsAction } from "../_lib/tab-actions";
import { PreviewForm } from "./preview-form";

export function PreviewTabLoader({ carrierId }: { carrierId: string }) {
	return (
		<LazyTab load={() => fetchCarrierPreviewToolsAction()}>
			{(tools: ToolForQuote[]) => (
				<PreviewForm carrierId={carrierId} tools={tools} />
			)}
		</LazyTab>
	);
}

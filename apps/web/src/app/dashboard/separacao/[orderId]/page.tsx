import type { Metadata } from "next";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { PickingExecution } from "../_components/picking-execution";
import { StartPicking } from "../_components/start-picking";
import { getPickingForOrder } from "../data";

export const metadata: Metadata = {
	title: "Execução de separação",
};

interface PageProps {
	params: Promise<{ orderId: string }>;
}

export default async function SeparacaoOrderPage({ params }: PageProps) {
	const { orderId } = await params;
	await requireCapabilityOrRedirect("orders.pick");

	const result = await getPickingForOrder(orderId);

	if (result?.picking.status === "in_progress") {
		return <PickingExecution items={result.items} picking={result.picking} />;
	}

	return <StartPicking orderId={orderId} />;
}

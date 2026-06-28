import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { PickingExecution } from "../_components/picking-execution";
import { StartPicking } from "../_components/start-picking";
import { getOrderBranchId, getPickingForOrder } from "../data";

export const metadata: Metadata = {
	title: "Execução de separação",
};

interface PageProps {
	params: Promise<{ orderId: string }>;
}

export default async function SeparacaoOrderPage({ params }: PageProps) {
	const { orderId } = await params;
	const session = await requireCapabilityOrRedirect("orders.pick");
	const scope = await getUserBranchScope(session);

	const orderRow = await getOrderBranchId(orderId);
	if (!orderRow) {
		notFound();
	}
	if (!orderInScope(scope, orderRow.branchId)) {
		notFound();
	}

	const result = await getPickingForOrder(orderId);

	if (result?.picking.status === "in_progress") {
		return <PickingExecution items={result.items} picking={result.picking} />;
	}

	return <StartPicking orderId={orderId} />;
}

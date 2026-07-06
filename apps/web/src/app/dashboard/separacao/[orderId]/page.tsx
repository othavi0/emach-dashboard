import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { PickingExecution } from "../_components/picking-execution";
import { PickingReadonly } from "../_components/picking-readonly";
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
		const isOwner = result.picking.pickerUserId === session.user.id;
		if (isOwner) {
			const canShip = await can(session, "orders.update_status");
			return (
				<PickingExecution
					canShip={canShip}
					items={result.items}
					picking={result.picking}
				/>
			);
		}
		const canManage =
			session.user.role === "admin" || session.user.role === "super_admin";
		return (
			<PickingReadonly
				canManage={canManage}
				items={result.items}
				picking={result.picking}
			/>
		);
	}

	const exceptionContext =
		result?.picking.status === "exception"
			? {
					reason: result.picking.exceptionReason,
					pickerName: result.picking.pickerName,
				}
			: null;
	return <StartPicking exceptionContext={exceptionContext} orderId={orderId} />;
}

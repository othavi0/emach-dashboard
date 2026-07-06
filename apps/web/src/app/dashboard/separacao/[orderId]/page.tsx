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
	const isOwner = result?.picking.pickerUserId === session.user.id;

	// "completed" entra aqui junto de "in_progress" (só o dono): completePicking
	// revalida esta rota via revalidatePath, o que dispara um refresh automático
	// do Server Component assim que o Server Action resolve. Se esse refresh
	// caísse fora de PickingExecution, o painel "Despachar agora" (estado local
	// completedOk) seria substituído pela tela de "Iniciar separação" antes do
	// usuário conseguir vê-lo — PickingExecution deriva completedOk a partir de
	// picking.status, então mantê-lo como o mesmo componente preserva o painel.
	if (
		isOwner &&
		result &&
		(result.picking.status === "in_progress" ||
			result.picking.status === "completed")
	) {
		const canShip = await can(session, "orders.update_status");
		return (
			<PickingExecution
				canShip={canShip}
				items={result.items}
				picking={result.picking}
			/>
		);
	}

	if (result?.picking.status === "in_progress") {
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

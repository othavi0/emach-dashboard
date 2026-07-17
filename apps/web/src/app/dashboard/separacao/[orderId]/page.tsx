import { buttonVariants } from "@emach/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";
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

/**
 * Sessão de picking já 'completed', mas o pedido saiu de "preparing" (enviado,
 * entregue, etc.) — o painel de despacho (PickingExecution/PickingCompletePanel)
 * não faz mais sentido aqui. Estado terminal simples com link pro detalhe.
 */
function PickingDispatched({
	orderId,
	canViewOrder,
}: {
	orderId: string;
	canViewOrder: boolean;
}) {
	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-medium font-serif text-2xl uppercase tracking-[0.015em]">
						Pedido já despachado
					</h1>
					<p className="mt-1 text-[13px] text-muted-foreground">
						Esta separação já foi concluída e o pedido seguiu em frente — não há
						mais ação de separação por aqui.
					</p>
				</div>
				{/* Detalhe do pedido exige orders.read; operador de separação sem essa
				    capability (role user) não vê o atalho — bateria em guard. */}
				{canViewOrder ? (
					<Link
						className={buttonVariants({ size: "sm", variant: "outline" })}
						href={`/dashboard/orders/${orderId}`}
					>
						Ver pedido
					</Link>
				) : null}
			</div>
		</div>
	);
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
		// Sessão completed sobrevive ao pedido avançar (shipped/delivered/etc.) —
		// o painel de despacho só faz sentido enquanto o pedido ainda está
		// "preparing". Fora disso, é estado terminal: mostra e sai.
		if (
			result.picking.status === "completed" &&
			orderRow.status !== "preparing"
		) {
			const canViewOrder = await can(session, "orders.read");
			return (
				<PickingDispatched canViewOrder={canViewOrder} orderId={orderId} />
			);
		}
		const canShip = await can(session, "orders.update_status");
		return (
			<PickingExecution
				branchName={orderRow.branchName}
				canShip={canShip}
				items={result.items}
				orderNumber={orderRow.number}
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

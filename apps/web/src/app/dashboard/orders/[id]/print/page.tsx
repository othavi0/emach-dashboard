import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCapability } from "@/lib/permissions";
import { PrintButton } from "../../_components/print-button";
import { PrintPickingSlip } from "../../_components/print-picking-slip";
import { PrintShippingLabel } from "../../_components/print-shipping-label";
import { getOrderDetail } from "../../data";

interface OrderPrintPageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ type?: string }>;
}

export const dynamic = "force-dynamic";

export default async function OrderPrintPage({
	params,
	searchParams,
}: OrderPrintPageProps) {
	await requireCapability("orders.read");
	const { id } = await params;
	const { type } = await searchParams;
	const order = await getOrderDetail(id);

	if (!order) {
		notFound();
	}

	const printType = type === "shipping" ? "shipping" : "picking";

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 print:px-0 print:py-0">
			<div className="flex items-center justify-between gap-4 print:hidden">
				<div>
					<h1 className="font-serif text-2xl">
						{printType === "shipping"
							? "Etiqueta de envio"
							: "Romaneio de separação"}
					</h1>
					<p className="text-muted-foreground text-sm">{order.number}</p>
				</div>
				<div className="flex gap-2">
					<Link
						className={buttonVariants({
							variant: printType === "picking" ? "default" : "outline",
						})}
						href={`/dashboard/orders/${order.id}/print?type=picking`}
					>
						Romaneio
					</Link>
					<Link
						className={buttonVariants({
							variant: printType === "shipping" ? "default" : "outline",
						})}
						href={`/dashboard/orders/${order.id}/print?type=shipping`}
					>
						Etiqueta
					</Link>
					<PrintButton />
				</div>
			</div>

			{printType === "shipping" ? (
				<PrintShippingLabel order={order} />
			) : (
				<PrintPickingSlip order={order} />
			)}
		</div>
	);
}

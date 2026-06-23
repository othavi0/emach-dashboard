import type { Metadata } from "next";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { CarrierWizard } from "../../_components/carrier-wizard";

export const metadata: Metadata = { title: "Nova transportadora" };

export default function NewCarrierPage() {
	return <NewCarrierContent />;
}

async function NewCarrierContent() {
	await requireCapabilityOrRedirect("shipping.manage");
	return (
		<div className="flex flex-col gap-6 p-6">
			<div>
				<h1 className="font-medium text-2xl tracking-tight">
					Nova transportadora
				</h1>
				<p className="text-muted-foreground text-sm">
					Dois passos: dados fiscais e zonas de entrega.
				</p>
			</div>
			<CarrierWizard />
		</div>
	);
}

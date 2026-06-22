import type { Metadata } from "next";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { BoxesTab } from "./_components/boxes-tab";
import { CarriersTab } from "./_components/carriers-tab";
import { ShippingHeaderAction } from "./_components/shipping-header-action";
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import {
	getOrCreateShippingSettings,
	listOriginBranchOptions,
} from "./actions";

export const metadata: Metadata = { title: "Frete" };

const GRID = "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]";

interface PageProps {
	searchParams: Promise<{ tab?: string }>;
}

export default function ShippingPage({ searchParams }: PageProps) {
	return <ShippingPageContent searchParams={searchParams} />;
}

async function ShippingPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("shipping.read");
	const sp = await searchParams;

	const [settings, originOptions, canManage] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
		can(session, "shipping.manage"),
	]);
	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;

	const activeTab = sp.tab ?? "transportadoras";

	const tabs: EntityTab[] = [
		{
			value: "transportadoras",
			label: "Transportadoras",
			content: <CarriersTab />,
		},
		{
			value: "caixas",
			label: "Caixas",
			content: sp.tab === "caixas" ? <BoxesTab /> : null,
		},
		{
			value: "config",
			label: "Configurações",
			content: (
				<div className={GRID}>
					<ShippingSettingsForm
						originOptions={originOptions}
						settings={{
							originBranchId: settings.shippingOriginBranchId,
							insurancePolicy: settings.shippingInsurancePolicy,
							insuranceCapAmount: Number(settings.shippingInsuranceCapAmount),
						}}
					/>
					<ShippingPreviewRail
						insuranceCapAmount={Number(settings.shippingInsuranceCapAmount)}
						insurancePolicy={settings.shippingInsurancePolicy}
						originLabel={originLabel}
					/>
				</div>
			),
		},
	];

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					canManage ? <ShippingHeaderAction tab={activeTab} /> : undefined
				}
				description="Transportadoras, tabelas de frete e caixas de envio."
				title="Frete"
			/>
			<EntityTabs defaultValue="transportadoras" tabs={tabs} />
		</div>
	);
}

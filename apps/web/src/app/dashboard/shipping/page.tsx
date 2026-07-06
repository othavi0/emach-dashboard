import { Package, Settings } from "lucide-react";
import type { Metadata } from "next";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { BoxesTab } from "./_components/boxes-tab";
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
	await requireCapabilityOrRedirect("shipping.read");
	const sp = await searchParams;

	const [settings, originOptions] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
	]);
	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;
	const fillFactorPct = Math.round(Number(settings.shippingFillFactor) * 100);
	const boxPaddingCm = Number(settings.shippingBoxPaddingCm);

	const tabs: EntityTab[] = [
		{
			value: "caixas",
			label: "Caixas",
			icon: <Package aria-hidden className="size-3.5" />,
			content: sp.tab === "config" ? null : <BoxesTab />,
		},
		{
			value: "config",
			label: "Configurações",
			icon: <Settings aria-hidden className="size-3.5" />,
			content: (
				<div className={GRID}>
					<ShippingSettingsForm
						originOptions={originOptions}
						settings={{
							originBranchId: settings.shippingOriginBranchId,
							insurancePolicy: settings.shippingInsurancePolicy,
							insuranceCapAmount: Number(settings.shippingInsuranceCapAmount),
							fillFactorPct,
							boxPaddingCm,
						}}
					/>
					<ShippingPreviewRail
						boxPaddingCm={boxPaddingCm}
						fillFactorPct={fillFactorPct}
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
				description="Caixas de envio e configurações de frete da loja."
				title="Frete"
			/>
			<EntityTabs defaultValue="caixas" tabs={tabs} />
		</div>
	);
}

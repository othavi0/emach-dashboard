import { Badge } from "@emach/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import {
	getOrCreateShippingSettings,
	listOriginBranchOptions,
} from "./actions";

export const dynamic = "force-dynamic";

const SECTION_TABS: Array<{ value: string; label: string; soon?: boolean }> = [
	{ value: "frete", label: "Frete" },
	{ value: "redes", label: "Redes sociais", soon: true },
	{ value: "local", label: "Localização", soon: true },
];

interface PageProps {
	searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
	await requireCurrentSession();
	const { tab } = await searchParams;
	const activeTab = tab === "redes" || tab === "local" ? tab : "frete";

	const [settings, originOptions] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
	]);

	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;

	return (
		<>
			<PageHeader
				description="Ajustes globais da loja — frete, redes sociais e localização da cotação."
				title="Configurações"
			/>

			<Tabs value={activeTab}>
				<TabsList scrollable>
					{SECTION_TABS.map((t) => (
						<TabsTrigger disabled={t.soon} key={t.value} value={t.value}>
							{t.label}
							{t.soon ? (
								<Badge className="ml-2" variant="secondary">
									Em breve
								</Badge>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
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
		</>
	);
}

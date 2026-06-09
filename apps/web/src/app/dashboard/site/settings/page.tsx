import { Badge } from "@emach/ui/components/badge";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import { SocialPreviewRail } from "./_components/social-preview-rail";
import type { SocialState } from "./_components/social-schema";
import { SocialSettingsForm } from "./_components/social-settings-form";
import {
	getOrCreateShippingSettings,
	listOriginBranchOptions,
} from "./actions";

export const dynamic = "force-dynamic";

const GRID = "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]";

export default async function SettingsPage() {
	await requireCurrentSession();

	const [settings, originOptions] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
	]);

	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;

	// Mapeia as colunas planas do singleton para o shape que o form/preview consome.
	const socialState: SocialState = {
		instagram: {
			url: settings.socialInstagramUrl ?? "",
			visible: settings.socialInstagramVisible,
		},
		linkedin: {
			url: settings.socialLinkedinUrl ?? "",
			visible: settings.socialLinkedinVisible,
		},
		facebook: {
			url: settings.socialFacebookUrl ?? "",
			visible: settings.socialFacebookVisible,
		},
		x: { url: settings.socialXUrl ?? "", visible: settings.socialXVisible },
		youtube: {
			url: settings.socialYoutubeUrl ?? "",
			visible: settings.socialYoutubeVisible,
		},
	};

	const tabs: EntityTab[] = [
		{
			value: "frete",
			label: "Frete",
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
		{
			value: "redes",
			label: "Contato / Redes",
			content: (
				<div className={GRID}>
					<SocialSettingsForm settings={socialState} />
					<SocialPreviewRail state={socialState} />
				</div>
			),
		},
		{
			value: "local",
			label: "Localização",
			badge: (
				<Badge className="ml-1" variant="secondary">
					Em breve
				</Badge>
			),
			content: (
				<div className="rounded-md border border-border border-dashed bg-muted/40 p-8 text-center text-muted-foreground text-sm">
					Localização da cotação — em breve.
				</div>
			),
		},
	];

	return (
		<>
			<PageHeader
				description="Ajustes globais da loja — frete, redes sociais e localização da cotação."
				title="Configurações"
			/>
			<EntityTabs defaultValue="frete" tabs={tabs} />
		</>
	);
}

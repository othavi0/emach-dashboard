import { Badge } from "@emach/ui/components/badge";
import { MapPin, Share2 } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { SocialPreviewRail } from "./_components/social-preview-rail";
import type { SocialState } from "./_components/social-schema";
import { SocialSettingsForm } from "./_components/social-settings-form";
import { getOrCreateShippingSettings } from "./actions";

export const metadata: Metadata = {
	title: "Configurações do site",
};

const GRID = "grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]";

interface PageProps {
	searchParams: Promise<{ tab?: string }>;
}

export default function SettingsPage({ searchParams }: PageProps) {
	return <SettingsPageContent searchParams={searchParams} />;
}

async function SettingsPageContent({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("site.update_settings");
	const sp = await searchParams;

	if (sp.tab === "frete") {
		redirect("/dashboard/shipping?tab=config");
	}

	const settings = await getOrCreateShippingSettings();

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
			value: "redes",
			label: "Contato / Redes",
			icon: <Share2 aria-hidden className="size-3.5" />,
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
			icon: <MapPin aria-hidden className="size-3.5" />,
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
				description="Ajustes globais da loja — redes sociais e localização da cotação."
				title="Configurações"
			/>
			<EntityTabs defaultValue="redes" tabs={tabs} />
		</>
	);
}

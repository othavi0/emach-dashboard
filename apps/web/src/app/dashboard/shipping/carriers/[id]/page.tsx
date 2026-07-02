import { Eye, FileText, Map as MapIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getCarrierDetail } from "../../data";
import { CarrierEditSheet } from "./_components/carrier-edit-sheet";
import { CarrierIdentity } from "./_components/carrier-identity";
import { PreviewTabLoader } from "./_components/preview-tab-loader";
import { SurchargesTab } from "./_components/surcharges-tab";
import { ZonesTabLoader } from "./_components/zones-tab-loader";

export const metadata: Metadata = { title: "Transportadora" };

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; edit?: string }>;
}

const KNOWN_TABS = new Set(["sobretaxas", "zonas", "preview"]);
const DEFAULT_TAB = "sobretaxas";

export default function CarrierDetailPage({ params, searchParams }: PageProps) {
	return <CarrierDetailContent params={params} searchParams={searchParams} />;
}

async function CarrierDetailContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("shipping.read");
	const canManage = await can(session, "shipping.manage");

	const { id } = await params;
	const sp = await searchParams;
	const initialTab = sp.tab && KNOWN_TABS.has(sp.tab) ? sp.tab : DEFAULT_TAB;
	const detail = await getCarrierDetail(id);
	if (!detail) {
		notFound();
	}

	const tabs: EntityClientTab[] = [
		{
			value: "sobretaxas",
			label: "Dados & sobretaxas",
			icon: <FileText aria-hidden className="size-3.5" />,
			content: <SurchargesTab detail={detail} />,
		},
		{
			value: "zonas",
			label: "Zonas & Tabela",
			icon: <MapIcon aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ZonesTabLoader carrierId={id} />,
		},
		{
			value: "preview",
			label: "Preview",
			icon: <Eye aria-hidden className="size-3.5" />,
			lazy: true,
			content: <PreviewTabLoader carrierId={id} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue={DEFAULT_TAB}
				header={<CarrierIdentity canManage={canManage} detail={detail} />}
				initialTab={initialTab}
				tabs={tabs}
			/>
			{canManage && sp.edit === "1" ? (
				<CarrierEditSheet detail={detail} />
			) : null}
		</div>
	);
}

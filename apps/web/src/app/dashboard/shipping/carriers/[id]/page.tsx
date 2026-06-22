import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getCarrierDetail } from "../../data";
import { CarrierEditSheet } from "./_components/carrier-edit-sheet";
import { CarrierIdentity } from "./_components/carrier-identity";
import { SurchargesTab } from "./_components/surcharges-tab";
import { ZonesTab } from "./_components/zones-tab";

export const metadata: Metadata = { title: "Transportadora" };

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; edit?: string }>;
}

export default function CarrierDetailPage({ params, searchParams }: PageProps) {
	return <CarrierDetailContent params={params} searchParams={searchParams} />;
}

async function CarrierDetailContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("shipping.read");
	const canManage = await can(session, "shipping.manage");

	const { id } = await params;
	const sp = await searchParams;
	const detail = await getCarrierDetail(id);
	if (!detail) {
		notFound();
	}

	const tabs: EntityTab[] = [
		{
			value: "sobretaxas",
			label: "Sobretaxas",
			content: <SurchargesTab detail={detail} />,
		},
		{
			value: "zonas",
			label: "Zonas & Tabela",
			content: sp.tab === "zonas" ? <ZonesTab carrierId={id} /> : null,
		},
		{
			value: "preview",
			label: "Preview",
			content:
				sp.tab === "preview" ? (
					<div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
						Em construção — Task 12
					</div>
				) : null,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<CarrierIdentity canManage={canManage} detail={detail} />
			<EntityTabs defaultValue="sobretaxas" tabs={tabs} />
			{canManage && sp.edit === "1" ? (
				<CarrierEditSheet detail={detail} />
			) : null}
		</div>
	);
}

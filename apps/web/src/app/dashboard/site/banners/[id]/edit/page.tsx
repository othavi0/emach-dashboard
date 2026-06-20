import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { BannerForm } from "../../_components/banner-form";
import { fetchBanner } from "../../actions";

export const metadata: Metadata = {
	title: "Editar banner",
};

export default function EditBannerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	return <EditBannerPageContent params={params} />;
}

async function EditBannerPageContent({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const banner = await fetchBanner(id);
	if (!banner) {
		notFound();
	}
	return (
		<>
			<PageHeader
				description="Edite o banner do carrossel."
				title={banner.title}
			/>
			<BannerForm banner={banner} />
		</>
	);
}

import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { BannerForm } from "../_components/banner-form";

export default async function NewBannerPage() {
	await requireCapability("site.update_banners");
	return (
		<>
			<PageHeader
				description="Crie um novo banner para o carrossel da home."
				title="Novo banner"
			/>
			<BannerForm />
		</>
	);
}

import { permanentRedirect } from "next/navigation";

export default async function SupplierEditRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	permanentRedirect(`/dashboard/suppliers/${id}?edit=1`);
}

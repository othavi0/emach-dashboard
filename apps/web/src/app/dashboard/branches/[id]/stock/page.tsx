import { permanentRedirect } from "next/navigation";

export default async function BranchStockRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	permanentRedirect(`/dashboard/branches/${id}?tab=stock`);
}

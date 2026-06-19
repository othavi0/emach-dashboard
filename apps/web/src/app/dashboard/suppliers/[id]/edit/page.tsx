import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Editar fornecedor",
};

export default function SupplierEditRedirect({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	return (
		<Suspense>
			<SupplierEditRedirectContent params={params} />
		</Suspense>
	);
}

async function SupplierEditRedirectContent({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<never> {
	const { id } = await params;
	permanentRedirect(`/dashboard/suppliers/${id}?edit=1`);
}

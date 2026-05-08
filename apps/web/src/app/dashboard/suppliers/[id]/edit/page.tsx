import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { SupplierForm } from "../../_components/supplier-form";
import { getSupplier } from "../../actions";

interface EditSupplierPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditSupplierPage({
	params,
}: EditSupplierPageProps) {
	await requireRole("admin");
	const { id } = await params;

	const supplier = await getSupplier(id);
	if (!supplier) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium text-2xl tracking-tight">
					Editar fornecedor
				</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados de{" "}
					<span className="font-medium text-foreground">{supplier.name}</span>.
				</p>
			</div>

			<SupplierForm
				defaultValues={{
					name: supplier.name,
					contactEmail: supplier.contactEmail ?? undefined,
					phone: supplier.phone ?? undefined,
					notes: supplier.notes ?? undefined,
				}}
				mode="edit"
				supplierId={supplier.id}
			/>
		</div>
	);
}

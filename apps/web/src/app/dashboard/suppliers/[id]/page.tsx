import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCurrentSession } from "@/lib/session";
import { DeleteSupplierDialog } from "../_components/delete-supplier-dialog";
import { getSupplier } from "../actions";

interface SupplierDetailPageProps {
	params: Promise<{ id: string }>;
}

export default async function SupplierDetailPage({
	params,
}: SupplierDetailPageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;
	const supplier = await getSupplier(id);

	if (!supplier) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-medium text-2xl tracking-tight">
						{supplier.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						{supplier.tools.length} ferramenta
						{supplier.tools.length === 1 ? "" : "s"} vinculada
						{supplier.tools.length === 1 ? "" : "s"}
					</p>
				</div>
				{canMutate && (
					<div className="flex gap-2">
						<Link
							className={buttonVariants({ variant: "secondary" })}
							href={`/dashboard/suppliers/${supplier.id}/edit`}
						>
							Editar
						</Link>
						<DeleteSupplierDialog
							supplierId={supplier.id}
							supplierName={supplier.name}
						/>
					</div>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contato</CardTitle>
					<CardDescription>
						Dados comerciais e observações internas.
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2 text-sm">
					<p>
						<strong>E-mail:</strong> {supplier.contactEmail ?? "—"}
					</p>
					<p>
						<strong>Telefone:</strong> {supplier.phone ?? "—"}
					</p>
					{supplier.notes && (
						<p>
							<strong>Observações:</strong> {supplier.notes}
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Ferramentas vinculadas</CardTitle>
					<CardDescription>
						Ferramentas do catálogo associadas a este fornecedor.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{supplier.tools.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma ferramenta vinculada a este fornecedor.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Ferramenta</TableHead>
									<TableHead>SKU</TableHead>
									<TableHead className="text-right">Visibilidade</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{supplier.tools.map((tool) => (
									<TableRow key={tool.id}>
										<TableCell>
											<Link
												className="font-medium hover:underline"
												href={`/dashboard/tools/${tool.id}`}
											>
												{tool.name}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{tool.sku ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Badge
												variant={tool.visibleOnSite ? "default" : "outline"}
											>
												{tool.visibleOnSite ? "Visível" : "Oculto"}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

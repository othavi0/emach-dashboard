"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Pencil } from "lucide-react";
import Link from "next/link";

import type { SupplierListItem } from "../actions";
import { DeleteSupplierDialog } from "./delete-supplier-dialog";

interface SuppliersTableProps {
	canMutate: boolean;
	suppliers: SupplierListItem[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

export function SuppliersTable({ suppliers, canMutate }: SuppliersTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Contato</TableHead>
					<TableHead className="text-right">Ferramentas</TableHead>
					<TableHead className="w-32">Criado em</TableHead>
					{canMutate && <TableActionsHead />}
				</TableRow>
			</TableHeader>
			<TableBody>
				{suppliers.map((supplier) => (
					<TableRow key={supplier.id}>
						<TableCell>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/suppliers/${supplier.id}`}
							>
								{supplier.name}
							</Link>
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{supplier.contactEmail ?? supplier.phone ?? "—"}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{supplier.toolsCount}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{formatDate(supplier.createdAt)}
						</TableCell>
						{canMutate && (
							<TableActionsCell>
								<Link
									aria-label={`Editar fornecedor ${supplier.name}`}
									className={buttonVariants({
										size: "icon-sm",
										variant: "secondary",
									})}
									href={`/dashboard/suppliers/${supplier.id}/edit`}
								>
									<Pencil aria-hidden className="size-3.5" />
								</Link>
								<DeleteSupplierDialog
									supplierId={supplier.id}
									supplierName={supplier.name}
								/>
							</TableActionsCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

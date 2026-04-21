"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
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
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
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
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({
											size: "sm",
											variant: "ghost",
										})}
										href={`/dashboard/suppliers/${supplier.id}/edit`}
									>
										Editar
									</Link>
									<DeleteSupplierDialog
										supplierId={supplier.id}
										supplierName={supplier.name}
									/>
								</div>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

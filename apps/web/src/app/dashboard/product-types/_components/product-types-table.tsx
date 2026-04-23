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

import type { ProductTypeListItem } from "../actions";
import { DeleteProductTypeDialog } from "./delete-product-type-dialog";

interface ProductTypesTableProps {
	canMutate: boolean;
	productTypes: ProductTypeListItem[];
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

export function ProductTypesTable({
	productTypes,
	canMutate,
}: ProductTypesTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Descrição</TableHead>
					<TableHead className="text-right">Ferramentas</TableHead>
					<TableHead className="w-32">Criado em</TableHead>
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{productTypes.map((row) => (
					<TableRow key={row.id}>
						<TableCell>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/product-types/${row.id}`}
							>
								{row.name}
							</Link>
							{row.slug && (
								<p className="text-muted-foreground text-xs">/{row.slug}</p>
							)}
						</TableCell>
						<TableCell className="max-w-md text-muted-foreground text-sm">
							{row.description ?? "—"}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.toolsCount}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{formatDate(row.createdAt)}
						</TableCell>
						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({
											size: "sm",
											variant: "ghost",
										})}
										href={`/dashboard/product-types/${row.id}/edit`}
									>
										Editar
									</Link>
									<DeleteProductTypeDialog
										productTypeId={row.id}
										productTypeName={row.name}
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
